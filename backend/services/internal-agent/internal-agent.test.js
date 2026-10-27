const {
    normalizePhone,
    getPhoneVariants,
    canExecuteTool
} = require('./identity');
const {
    parseConfirmationReply,
    formatRp
} = require('./actions');
const {
    TOOL_MAP,
    getToolsForIdentity
} = require('./tools');

describe('Internal WhatsApp AI Agent - Identity & Permissions', () => {
    test('normalizePhone strips JID suffixes, device suffixes, and standardizes to 62 prefix', () => {
        expect(normalizePhone('6281115345333@s.whatsapp.net')).toBe('6281115345333');
        expect(normalizePhone('6281115345333:14@s.whatsapp.net')).toBe('6281115345333');
        expect(normalizePhone('0812-3456-7890')).toBe('6281234567890');
        expect(normalizePhone('+62 812 3456 7890')).toBe('6281234567890');
        expect(normalizePhone('81234567890')).toBe('6281234567890');
    });

    test('getPhoneVariants returns 62, 0, and 8 prefix variants', () => {
        const variants = getPhoneVariants('08123456789');
        expect(variants).toContain('628123456789');
        expect(variants).toContain('08123456789');
        expect(variants).toContain('8123456789');
    });

    test('canExecuteTool enforces role boundaries and can_write matrix', () => {
        const recordPaymentTool = TOOL_MAP.get('record_payment');
        const suspendServiceTool = TOOL_MAP.get('suspend_service');
        const dailySummaryTool = TOOL_MAP.get('get_daily_summary');
        const deviceStatusTool = TOOL_MAP.get('get_device_status');

        const superadmin = {
            role: 'superadmin',
            can_read: true,
            can_write: true,
            allowed_write_tools: ['record_payment', 'resend_invoice', 'update_ticket_status', 'suspend_service', 'restore_service'],
            disabled: false
        };
        expect(canExecuteTool(superadmin, recordPaymentTool)).toBe(true);
        expect(canExecuteTool(superadmin, suspendServiceTool)).toBe(true);
        expect(canExecuteTool(superadmin, dailySummaryTool)).toBe(true);

        const readOnlyMitra = {
            role: 'mitra',
            can_read: true,
            can_write: false,
            allowed_write_tools: [],
            disabled: false
        };
        expect(canExecuteTool(readOnlyMitra, dailySummaryTool)).toBe(true);
        expect(canExecuteTool(readOnlyMitra, recordPaymentTool)).toBe(false);
        expect(canExecuteTool(readOnlyMitra, deviceStatusTool)).toBe(false);

        const writeMitraPaymentOnly = {
            role: 'mitra',
            can_read: true,
            can_write: true,
            allowed_write_tools: ['record_payment'],
            disabled: false
        };
        expect(canExecuteTool(writeMitraPaymentOnly, recordPaymentTool)).toBe(true);
        expect(canExecuteTool(writeMitraPaymentOnly, suspendServiceTool)).toBe(false);

        const writeTechnician = {
            role: 'technician',
            can_read: true,
            can_write: true,
            allowed_write_tools: ['record_payment', 'update_ticket_status', 'suspend_service'],
            disabled: false
        };
        expect(canExecuteTool(writeTechnician, deviceStatusTool)).toBe(true);
        expect(canExecuteTool(writeTechnician, recordPaymentTool)).toBe(true);
        // Technician role is never allowed to run suspend_service or get_daily_summary
        expect(canExecuteTool(writeTechnician, suspendServiceTool)).toBe(false);
        expect(canExecuteTool(writeTechnician, dailySummaryTool)).toBe(false);
    });

    test('getToolsForIdentity filters tools by role', () => {
        const techTools = getToolsForIdentity({ role: 'technician' }).map(t => t.name);
        expect(techTools).toContain('get_connection_status');
        expect(techTools).toContain('get_device_status');
        expect(techTools).not.toContain('get_daily_summary');
        expect(techTools).not.toContain('suspend_service');
    });
});

describe('Internal WhatsApp AI Agent - Confirmation Parser & Formatting', () => {
    test('parseConfirmationReply parses YA, YA <CODE>, and BATAL replies accurately', () => {
        expect(parseConfirmationReply('YA')).toEqual({ type: 'confirm', code: null });
        expect(parseConfirmationReply('ya 8f4k2a')).toEqual({ type: 'confirm', code: '8F4K2A' });
        expect(parseConfirmationReply('Setuju AB12CD')).toEqual({ type: 'confirm', code: 'AB12CD' });
        expect(parseConfirmationReply('batal')).toEqual({ type: 'cancel', code: null });
        expect(parseConfirmationReply('cancel 99aabb')).toEqual({ type: 'cancel', code: '99AABB' });

        // Normal conversational sentences should not trigger confirmation parser
        expect(parseConfirmationReply('ya pak tolong cek tagihan ibu ade')).toBeNull();
        expect(parseConfirmationReply('apakah layanan bisa dibatalkan besok?')).toBeNull();
    });

    test('formatRp formats Indonesian Rupiah cleanly', () => {
        expect(formatRp(150000)).toBe('Rp 150.000');
        expect(formatRp(0)).toBe('Rp 0');
    });
});
