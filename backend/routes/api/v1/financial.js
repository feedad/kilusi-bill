const express = require('express');
const router = express.Router();
const { logger } = require('../../../config/logger');
const { query } = require('../../../config/database');

// GET /api/v1/financial/transactions - Get all transactions with pagination and search
router.get('/transactions', async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 20;
        const search = req.query.search || '';
        const type = req.query.type || ''; // income, expense
        const category = req.query.category || '';
        const start_date = req.query.start_date || '';
        const end_date = req.query.end_date || '';
        const offset = (page - 1) * limit;

        let whereClause = 'WHERE 1=1';
        let queryParams = [];

        if (search) {
            whereClause += ` AND (ft.description ILIKE $${queryParams.length + 1} OR ft.category ILIKE $${queryParams.length + 1} OR c.name ILIKE $${queryParams.length + 1})`;
            queryParams.push(`%${search}%`);
        }

        if (type) {
            whereClause += ` AND ft.type = $${queryParams.length + 1}`;
            queryParams.push(type);
        }

        if (category) {
            whereClause += ` AND ft.category = $${queryParams.length + 1}`;
            queryParams.push(category);
        }

        if (start_date) {
            whereClause += ` AND ft.transaction_date >= $${queryParams.length + 1}`;
            queryParams.push(start_date);
        }

        if (end_date) {
            whereClause += ` AND ft.transaction_date <= $${queryParams.length + 1}`;
            queryParams.push(end_date);
        }

        // Count query
        const countQuery = `
            SELECT COUNT(*) as total
            FROM financial_transactions ft
            LEFT JOIN customers c ON ft.customer_id = c.id
            ${whereClause}
        `;

        const countResult = await query(countQuery, queryParams);
        const total = parseInt(countResult.rows[0].total);

        // Data query with customer info
        const dataQuery = `
            SELECT
                ft.*,
                c.name as customer_name,
                c.phone as customer_phone
            FROM financial_transactions ft
            LEFT JOIN customers c ON ft.customer_id = c.id
            ${whereClause}
            ORDER BY ft.transaction_date DESC, ft.created_at DESC
            LIMIT $${queryParams.length + 1} OFFSET $${queryParams.length + 2}
        `;

        queryParams.push(limit, offset);
        const result = await query(dataQuery, queryParams);

        const transactions = result.rows.map(trans => ({
            id: trans.id,
            type: trans.type,
            category: trans.category,
            amount: parseFloat(trans.amount),
            description: trans.description || null,
            customer_id: trans.customer_id || null,
            customer_name: trans.customer_name || null,
            customer_phone: trans.customer_phone || null,
            transaction_date: trans.transaction_date,
            payment_method: trans.payment_method || null,
            created_at: trans.created_at,
            updated_at: trans.updated_at
        }));

        res.json({
            success: true,
            data: {
                transactions,
                pagination: {
                    page,
                    limit,
                    total,
                    totalPages: Math.ceil(total / limit)
                }
            }
        });

    } catch (error) {
        logger.error('Error fetching financial transactions:', error);
        res.status(500).json({
            success: false,
            message: 'Terjadi kesalahan saat mengambil data transaksi keuangan'
        });
    }
});

// GET /api/v1/financial/summary - Get financial summary with optional date range
router.get('/summary', async (req, res) => {
    try {
        const start_date = req.query.start_date || '';
        const end_date = req.query.end_date || '';

        let dateClause = '';
        let queryParams = [];

        if (start_date && end_date) {
            dateClause = 'WHERE transaction_date BETWEEN $1 AND $2';
            queryParams = [start_date, end_date];
        } else if (start_date) {
            dateClause = 'WHERE transaction_date >= $1';
            queryParams = [start_date];
        } else if (end_date) {
            dateClause = 'WHERE transaction_date <= $1';
            queryParams = [end_date];
        }

        // Get income and expense totals
        const totalQuery = `
            SELECT
                type,
                SUM(amount) as total_amount
            FROM financial_transactions
            ${dateClause}
            GROUP BY type
        `;

        const totalResult = await query(totalQuery, queryParams);
        const totalIncome = parseFloat(totalResult.rows.find(r => r.type === 'income')?.total_amount || 0);
        const totalExpense = parseFloat(totalResult.rows.find(r => r.type === 'expense')?.total_amount || 0);
        const netProfit = totalIncome - totalExpense;

        // Get income breakdown by category
        const incomeBreakdownQuery = `
            SELECT
                category,
                SUM(amount) as total
            FROM financial_transactions
            WHERE type = 'income' ${dateClause ? 'AND ' + dateClause.substring(6) : ''}
            GROUP BY category
            ORDER BY total DESC
        `;

        const incomeBreakdownResult = await query(incomeBreakdownQuery, queryParams);
        const incomeBreakdown = {};
        incomeBreakdownResult.rows.forEach(row => {
            incomeBreakdown[row.category] = parseFloat(row.total);
        });

        // Get expense breakdown by category
        const expenseBreakdownQuery = `
            SELECT
                category,
                SUM(amount) as total
            FROM financial_transactions
            WHERE type = 'expense' ${dateClause ? 'AND ' + dateClause.substring(6) : ''}
            GROUP BY category
            ORDER BY total DESC
        `;

        const expenseBreakdownResult = await query(expenseBreakdownQuery, queryParams);
        const expenseBreakdown = {};
        expenseBreakdownResult.rows.forEach(row => {
            expenseBreakdown[row.category] = parseFloat(row.total);
        });

        // Get transaction counts
        const countQuery = `
            SELECT
                type,
                COUNT(*) as count
            FROM financial_transactions
            ${dateClause}
            GROUP BY type
        `;

        const countResult = await query(countQuery, queryParams);
        const totalIncomeTransactions = parseInt(countResult.rows.find(r => r.type === 'income')?.count || 0);
        const totalExpenseTransactions = parseInt(countResult.rows.find(r => r.type === 'expense')?.count || 0);

        res.json({
            success: true,
            data: {
                period: start_date && end_date ? `${start_date} to ${end_date}` : 'All time',
                total_income: totalIncome,
                total_expense: totalExpense,
                net_profit: netProfit,
                income_breakdown: incomeBreakdown,
                expense_breakdown: expenseBreakdown,
                transaction_counts: {
                    income: totalIncomeTransactions,
                    expense: totalExpenseTransactions,
                    total: totalIncomeTransactions + totalExpenseTransactions
                }
            }
        });

    } catch (error) {
        logger.error('Error fetching financial summary:', error);
        res.status(500).json({
            success: false,
            message: 'Terjadi kesalahan saat mengambil ringkasan keuangan'
        });
    }
});

// GET /api/v1/financial/reports/daily - Get daily financial report for a specific month
router.get('/reports/daily', async (req, res) => {
    try {
        const month = req.query.month; // Format: 2025-11
        if (!month) {
            return res.status(400).json({
                success: false,
                message: 'Parameter month diperlukan (format: 2025-11)'
            });
        }

        // Parse month to get start and end dates
        const [year, monthNum] = month.split('-').map(Number);
        const startDate = `${year}-${monthNum.toString().padStart(2, '0')}-01`;
        const endDate = `${year}-${monthNum.toString().padStart(2, '0')}-31`;

        const queryText = `
            SELECT
                transaction_date,
                SUM(CASE WHEN type = 'income' THEN amount ELSE 0 END) as income,
                SUM(CASE WHEN type = 'expense' THEN amount ELSE 0 END) as expense,
                (SUM(CASE WHEN type = 'income' THEN amount ELSE 0 END) - SUM(CASE WHEN type = 'expense' THEN amount ELSE 0 END)) as profit
            FROM financial_transactions
            WHERE transaction_date BETWEEN $1 AND $2
            GROUP BY transaction_date
            ORDER BY transaction_date
        `;

        const result = await query(queryText, [startDate, endDate]);

        const dailyData = result.rows.map(row => ({
            date: row.transaction_date,
            income: parseFloat(row.income || 0),
            expense: parseFloat(row.expense || 0),
            profit: parseFloat(row.profit || 0)
        }));

        res.json({
            success: true,
            data: {
                month,
                daily_report: dailyData,
                summary: {
                    total_income: dailyData.reduce((sum, day) => sum + day.income, 0),
                    total_expense: dailyData.reduce((sum, day) => sum + day.expense, 0),
                    total_profit: dailyData.reduce((sum, day) => sum + day.profit, 0),
                    days_with_data: dailyData.length
                }
            }
        });

    } catch (error) {
        logger.error('Error fetching daily financial report:', error);
        res.status(500).json({
            success: false,
            message: 'Terjadi kesalahan saat mengambil laporan harian'
        });
    }
});

// POST /api/v1/financial/transactions - Create new transaction
router.post('/transactions', async (req, res) => {
    try {
        const { type, category, amount, description, customer_id, transaction_date, payment_method } = req.body;

        if (!type || !category || !amount || !transaction_date) {
            return res.status(400).json({
                success: false,
                message: 'Type, category, amount, dan transaction_date wajib diisi'
            });
        }

        if (!['income', 'expense'].includes(type)) {
            return res.status(400).json({
                success: false,
                message: 'Type harus berupa income atau expense'
            });
        }

        const insertQuery = `
            INSERT INTO financial_transactions (type, category, amount, description, customer_id, transaction_date, payment_method)
            VALUES ($1, $2, $3, $4, $5, $6, $7)
            RETURNING *
        `;

        const result = await query(insertQuery, [
            type,
            category,
            parseFloat(amount),
            description || null,
            customer_id || null,
            transaction_date,
            payment_method || null
        ]);

        const newTransaction = result.rows[0];

        res.status(201).json({
            success: true,
            message: 'Transaksi berhasil dibuat',
            data: {
                id: newTransaction.id,
                type: newTransaction.type,
                category: newTransaction.category,
                amount: parseFloat(newTransaction.amount),
                description: newTransaction.description || null,
                customer_id: newTransaction.customer_id || null,
                transaction_date: newTransaction.transaction_date,
                payment_method: newTransaction.payment_method || null,
                created_at: newTransaction.created_at,
                updated_at: newTransaction.updated_at
            }
        });

    } catch (error) {
        logger.error('Error creating financial transaction:', error);
        res.status(500).json({
            success: false,
            message: 'Terjadi kesalahan saat membuat transaksi'
        });
    }
});

// PUT /api/v1/financial/transactions/:id - Update transaction
router.put('/transactions/:id', async (req, res) => {
    try {
        const transactionId = req.params.id;
        const { type, category, amount, description, customer_id, transaction_date, payment_method } = req.body;

        if (!type || !category || !amount || !transaction_date) {
            return res.status(400).json({
                success: false,
                message: 'Type, category, amount, dan transaction_date wajib diisi'
            });
        }

        if (!['income', 'expense'].includes(type)) {
            return res.status(400).json({
                success: false,
                message: 'Type harus berupa income atau expense'
            });
        }

        const updateQuery = `
            UPDATE financial_transactions
            SET type = $1, category = $2, amount = $3, description = $4, customer_id = $5,
                transaction_date = $6, payment_method = $7, updated_at = CURRENT_TIMESTAMP
            WHERE id = $8
            RETURNING *
        `;

        const result = await query(updateQuery, [
            type,
            category,
            parseFloat(amount),
            description || null,
            customer_id || null,
            transaction_date,
            payment_method || null,
            transactionId
        ]);

        if (result.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Transaksi tidak ditemukan'
            });
        }

        const updatedTransaction = result.rows[0];

        res.json({
            success: true,
            message: 'Transaksi berhasil diperbarui',
            data: {
                id: updatedTransaction.id,
                type: updatedTransaction.type,
                category: updatedTransaction.category,
                amount: parseFloat(updatedTransaction.amount),
                description: updatedTransaction.description || null,
                customer_id: updatedTransaction.customer_id || null,
                transaction_date: updatedTransaction.transaction_date,
                payment_method: updatedTransaction.payment_method || null,
                created_at: updatedTransaction.created_at,
                updated_at: updatedTransaction.updated_at
            }
        });

    } catch (error) {
        logger.error('Error updating financial transaction:', error);
        res.status(500).json({
            success: false,
            message: 'Terjadi kesalahan saat memperbarui transaksi'
        });
    }
});

// DELETE /api/v1/financial/transactions/:id - Delete transaction
router.delete('/transactions/:id', async (req, res) => {
    try {
        const transactionId = req.params.id;

        // Check if transaction exists
        const checkResult = await query(
            'SELECT id FROM financial_transactions WHERE id = $1',
            [transactionId]
        );

        if (checkResult.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Transaksi tidak ditemukan'
            });
        }

        const deleteQuery = 'DELETE FROM financial_transactions WHERE id = $1';
        await query(deleteQuery, [transactionId]);

        res.json({
            success: true,
            message: 'Transaksi berhasil dihapus'
        });

    } catch (error) {
        logger.error('Error deleting financial transaction:', error);
        res.status(500).json({
            success: false,
            message: 'Terjadi kesalahan saat menghapus transaksi'
        });
    }
});

// GET /api/v1/financial/categories - Get all transaction categories
router.get('/categories', async (req, res) => {
    try {
        const type = req.query.type; // income, expense, or empty for all

        let whereClause = '';
        let queryParams = [];

        if (type && ['income', 'expense'].includes(type)) {
            whereClause = 'WHERE type = $1';
            queryParams = [type];
        }

        const queryText = `
            SELECT DISTINCT category, type
            FROM financial_transactions
            ${whereClause}
            ORDER BY category
        `;

        const result = await query(queryText, queryParams);

        const categories = result.rows.map(row => ({
            category: row.category,
            type: row.type
        }));

        res.json({
            success: true,
            data: {
                categories
            }
        });

    } catch (error) {
        logger.error('Error fetching transaction categories:', error);
        res.status(500).json({
            success: false,
            message: 'Terjadi kesalahan saat mengambil kategori transaksi'
        });
    }
});

module.exports = router;