-- Prevent duplicate invoices: same service + same due_date (for active/unpaid statuses)
CREATE UNIQUE INDEX IF NOT EXISTS uq_invoices_service_due
    ON invoices (service_number, due_date)
    WHERE status IN ('unpaid', 'sent', 'draft', 'overdue', 'suspended');
