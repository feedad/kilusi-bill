const { query, transaction } = require('../config/database');
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