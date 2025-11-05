const { query, getOne, getAll } = require('./config/database');

async function debugInvoiceStatus() {
    console.log('=== DEBUG INVOICE STATUS ===');

    try {
        // Check all invoices with their status
        const allInvoices = await getAll(`
            SELECT id, customer_id, invoice_number, amount, status, due_date, payment_date, created_at, updated_at
            FROM invoices
            ORDER BY created_at DESC
        `);

        console.log('\nAll Invoices:');
        console.table(allInvoices);

        // Check all payments
        const allPayments = await getAll(`
            SELECT id, invoice_id, amount, payment_method, payment_date, created_at
            FROM payments
            ORDER BY created_at DESC
        `);

        console.log('\nAll Payments:');
        console.table(allPayments);

        // Check specifically for unpaid invoices
        const unpaidInvoices = await getAll(`
            SELECT id, invoice_number, amount, status, payment_date
            FROM invoices
            WHERE status = 'unpaid'
            ORDER BY created_at DESC
        `);

        console.log('\nUnpaid Invoices:');
        console.table(unpaidInvoices);

        // Check if there are invoices that should be paid but aren't
        const questionableInvoices = await getAll(`
            SELECT i.id, i.invoice_number, i.status as invoice_status, i.payment_date,
                   p.id as payment_id, p.amount as payment_amount, p.payment_date as payment_created
            FROM invoices i
            LEFT JOIN payments p ON i.id = p.invoice_id
            WHERE i.status = 'unpaid' AND p.id IS NOT NULL
            ORDER BY i.created_at DESC
        `);

        console.log('\nInvoices marked as unpaid but have payments:');
        console.table(questionableInvoices);

    } catch (error) {
        console.error('Error debugging invoice status:', error);
    }
}

debugInvoiceStatus();