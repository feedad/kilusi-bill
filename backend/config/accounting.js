const { query } = require('./database');
const { logger } = require('./logger');

async function createAccountingTransaction(type, amount, description, referenceType = null, referenceId = null, explicitMitraId = null) {
    try {
        // Check if transaction already exists for this reference to prevent duplicates
        if (referenceType && referenceId) {
            const existingCheck = await query(`
                SELECT id FROM accounting_transactions
                WHERE reference_type = $1 AND reference_id = $2
                LIMIT 1
            `, [referenceType, referenceId]);

            if (existingCheck.rows.length > 0) {
                logger.info(`ℹ️ Accounting transaction already exists for ${referenceType}:${referenceId}, skipping`);
                return existingCheck.rows[0].id;
            }
        }

        // Auto-resolve mitra_id if reference is a payment and not explicitly given
        let mitraId = explicitMitraId || null;
        if (!mitraId && referenceType === 'payment' && referenceId) {
            try {
                const mRes = await query(`
                    SELECT m.id as mitra_id
                    FROM payments p
                    JOIN invoices i ON p.invoice_id = i.id
                    LEFT JOIN services s ON s.service_number = i.service_number
                    LEFT JOIN regions r ON r.id = s.region_id
                    LEFT JOIN mitra m ON r.mitra_id = m.id
                    WHERE p.id = $1
                    LIMIT 1
                `, [referenceId]);
                mitraId = mRes.rows[0]?.mitra_id || null;
            } catch (e) { /* ignore */ }
        }

        // Get default category for this transaction type
        const categoryQuery = await query(`
            SELECT id FROM accounting_categories
            WHERE type = $1 AND is_active = true
            ORDER BY name LIMIT 1
        `, [type]);

        if (categoryQuery.rows.length === 0) {
            logger.warn(`No active category found for ${type} transactions`);
            return;
        }

        const categoryId = categoryQuery.rows[0].id;

        const result = await query(`
            INSERT INTO accounting_transactions (
                category_id, type, amount, description,
                reference_type, reference_id, mitra_id, date, created_at
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, CURRENT_DATE, CURRENT_TIMESTAMP)
            RETURNING id
        `, [categoryId, type, amount, description, referenceType, referenceId, mitraId]);

        logger.info(`✅ Accounting transaction created: ${type} ${amount} - ${description} (ID: ${result.rows[0].id}, Mitra: ${mitraId || 'none'})`);
        return result.rows[0].id;
    } catch (error) {
        logger.error('Error creating accounting transaction:', error);
    }
}

module.exports = { createAccountingTransaction };
