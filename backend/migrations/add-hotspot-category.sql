-- Add Hotspot Voucher category to accounting_categories
INSERT INTO accounting_categories (name, type, description, color, icon, is_active)
VALUES (
    'Hotspot Voucher',
    'revenue',
    'Pendapatan dari penjualan voucher hotspot',
    '#8b5cf6',
    'ticket',
    true
)
ON CONFLICT (name) DO UPDATE SET
    type = EXCLUDED.type,
    description = EXCLUDED.description,
    color = EXCLUDED.color,
    icon = EXCLUDED.icon,
    is_active = EXCLUDED.is_active,
    updated_at = NOW();

-- Verify
SELECT id, name, type, color, icon FROM accounting_categories WHERE name = 'Hotspot Voucher';
