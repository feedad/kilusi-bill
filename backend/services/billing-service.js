const { query, transaction, getOne } = require('../config/database');
const { logger } = require('../config/logger');

class BillingService {

    // ==================
    // PACKAGES
    // ==================
    async getPackages(activeOnly = false) {
        let sql = 'SELECT * FROM packages';
        if (activeOnly) sql += ' WHERE is_active = true';
        sql += ' ORDER BY price ASC';
        const result = await query(sql);
        return result.rows;
    }

    async getPackageById(id) {
        const result = await query('SELECT * FROM packages WHERE id = $1', [id]);
        return result.rows[0] || null;
    }

    async createPackage(data) {
        const sql = `
            INSERT INTO packages (
                name, speed, price, tax_rate, description, pppoe_profile, 
                is_active, "group", rate_limit, shared, hpp, commission
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
            RETURNING *
        `;
        const values = [
            data.name, data.speed, data.price, data.tax_rate || 11.00, data.description || '',
            data.pppoe_profile || 'default', data.is_active !== false, data.group || null,
            data.rate_limit || null, data.shared || 0, data.hpp || 0, data.commission || 0
        ];
        const result = await query(sql, values);
        return result.rows[0];
    }

    async updatePackage(id, data) {
        const sql = `
            UPDATE packages 
            SET name = $1, speed = $2, price = $3, tax_rate = $4, 
                description = $5, pppoe_profile = $6, is_active = $7,
                "group" = $8, rate_limit = $9, shared = $10, hpp = $11, commission = $12
            WHERE id = $13
            RETURNING *
        `;
        const values = [
            data.name, data.speed, data.price, data.tax_rate, data.description,
            data.pppoe_profile, data.is_active, data.group, data.rate_limit,
            data.shared, data.hpp, data.commission, id
        ];
        const result = await query(sql, values);
        return result.rows[0];
    }

    async deletePackage(id) {
        await query('DELETE FROM packages WHERE id = $1', [id]);
        return true;
    }

    // ==================
    // INVOICES & PAYMENTS
    // ==================
    async getInvoices(filters = {}) {
        let sql = `
            SELECT i.*, 
                   c.name as customer_name, c.phone as customer_phone,
                   p.name as package_name
            FROM invoices i
            JOIN customers c ON i.customer_id = c.id
            JOIN packages p ON i.package_id = p.id
        `;
        const conditions = [];
        const values = [];

        if (filters.status) {
            conditions.push(`i.status = $${values.length + 1}`);
            values.push(filters.status);
        }
        if (filters.customer_id) {
            conditions.push(`i.customer_id = $${values.length + 1}`);
            values.push(filters.customer_id);
        }

        if (conditions.length > 0) sql += ' WHERE ' + conditions.join(' AND ');
        sql += ' ORDER BY i.created_at DESC';

        const result = await query(sql, values);
        return result.rows;
    }

    async createInvoice(data) {
        const invoiceNumber = data.invoice_number || this.generateInvoiceNumber();
        const sql = `
            INSERT INTO invoices (
                customer_id, package_id, invoice_number, amount, due_date, status, notes
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7)
            RETURNING *
        `;
        const values = [
            data.customer_id, data.package_id, invoiceNumber, data.amount,
            data.due_date, data.status || 'unpaid', data.notes
        ];
        const result = await query(sql, values);
        return result.rows[0];
    }

    async markInvoicePaid(invoiceId, paymentData) {
        return await transaction(async (client) => {
            // Update invoice
            const invSql = `
                UPDATE invoices 
                SET status = 'paid', payment_date = $1, payment_method = $2
                WHERE id = $3 RETURNING *
            `;
            const invRes = await client.query(invSql, [new Date(), paymentData.payment_method || 'manual', invoiceId]);

            // Create payment record
            const paySql = `
                INSERT INTO payments (invoice_id, amount, payment_method, reference_number, notes)
                VALUES ($1, $2, $3, $4, $5) RETURNING *
            `;
            const payRes = await client.query(paySql, [
                invoiceId, paymentData.amount, paymentData.payment_method || 'manual',
                paymentData.reference_number, paymentData.notes
            ]);

            return { invoice: invRes.rows[0], payment: payRes.rows[0] };
        });
    }

    generateInvoiceNumber() {
        const date = new Date();
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const random = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
        return `INV-${year}${month}-${random}`;
    }

    // ==================
    // CUSTOMER INVOICE (Installation / First Invoice)
    // ==================
    async createCustomerInvoice(customerId, packageId, billingType, serviceNumber) {
        try {
            const pkg = await getOne('SELECT * FROM packages WHERE id = $1', [packageId]);
            if (!pkg) {
                logger.warn(`Package ${packageId} not found for customer ${customerId}`);
                return null;
            }

            let svcNum = serviceNumber;
            if (!svcNum) {
                const service = await getOne(`
                    SELECT service_number FROM services WHERE customer_id = $1 ORDER BY created_at DESC LIMIT 1
                `, [customerId]);
                svcNum = service?.service_number || null;
            }

            // Get installation fee (package-specific first, then billing-type default)
            let installationFee = 0;
            if (packageId) {
                const pkgFee = await getOne(`
                    SELECT fee_amount FROM installation_fee_settings
                    WHERE billing_type = $1 AND package_id = $2 AND is_active = true
                    LIMIT 1
                `, [billingType, packageId]);
                if (pkgFee) installationFee = parseFloat(pkgFee.fee_amount);
            }
            if (installationFee === 0) {
                const defaultFee = await getOne(`
                    SELECT fee_amount FROM installation_fee_settings
                    WHERE billing_type = $1 AND package_id IS NULL AND is_active = true
                    LIMIT 1
                `, [billingType]);
                if (defaultFee) installationFee = parseFloat(defaultFee.fee_amount);
            }

            let amount, dueDate, notes;

            if (billingType === 'postpaid') {
                if (installationFee <= 0) return null;
                amount = installationFee;
                dueDate = new Date();
                notes = 'Biaya instalasi';
            } else {
                amount = parseFloat(pkg.price) + installationFee;
                dueDate = new Date();
                notes = 'Tagihan bulan pertama';
            }

            const invoiceNumber = this.generateInvoiceNumber();
            const sql = `
                INSERT INTO invoices (
                    customer_id, package_id, invoice_number, amount, total_amount,
                    due_date, status, notes, service_number
                )
                VALUES ($1, $2, $3, $4, $5, $6, 'unpaid', $7, $8)
                RETURNING *
            `;
            const result = await query(sql, [
                customerId, packageId, invoiceNumber, amount, amount,
                dueDate, notes, svcNum
            ]);

            logger.info(`Created installation invoice ${invoiceNumber} for customer ${customerId} (${billingType}, amount=${amount})`);

            // Generate unique code for autopay if enabled
            const invoice = result.rows[0];
            try {
                const uniqueCodeGenerator = require('../config/unique-code');
                if (uniqueCodeGenerator.isEnabled()) {
                    const code = await uniqueCodeGenerator.generateCode();
                    const amountWithCode = uniqueCodeGenerator.calculateAmountWithCode(amount, code);
                    await query(
                        `UPDATE invoices SET unique_code = $1, amount_with_code = $2 WHERE id = $3`,
                        [code, amountWithCode, invoice.id]
                    );
                    invoice.unique_code = code;
                    invoice.amount_with_code = amountWithCode;
                    logger.info(`Unique code ${code} generated for invoice ${invoiceNumber}`);
                }
            } catch (ucError) {
                logger.error(`Unique code generation failed for ${invoiceNumber}:`, ucError.message);
            }

            return invoice;
        } catch (error) {
            logger.error('Error creating customer invoice:', error);
            return null;
        }
    }

    // ==================
    // STATS
    // ==================
    async getBillingStats() {
        const result = await query(`
            SELECT 
                (SELECT COUNT(*) FROM services WHERE status = 'active') as active_customers,
                (SELECT COUNT(*) FROM invoices WHERE status = 'unpaid') as unpaid_invoices,
                (SELECT COALESCE(SUM(amount), 0) FROM invoices WHERE status = 'paid' 
                 AND EXTRACT(MONTH FROM payment_date) = EXTRACT(MONTH FROM CURRENT_DATE)) as monthly_revenue
        `);
        return result.rows[0];
    }
}

module.exports = new BillingService();