-- ============================================================================
-- Migration: Operational WhatsApp Templates without Icons
-- Clean, concise, polite, and dynamic templates for Admin, Mitra, and Technician
-- ============================================================================

-- 1. admin_new_ticket
INSERT INTO whatsapp_templates (template_id, name, category, enabled, variables, content)
VALUES (
    'admin_new_ticket',
    'Tiket Bantuan Baru (Admin & Mitra)',
    'UTILITY',
    true,
    '["ticketNumber", "customerName", "customerPhone", "customerAddress", "mitraName", "subject", "category", "priority", "description", "createdAt", "companyName"]'::jsonb,
    E'Pemberitahuan Tiket Baru\n\nTiket bantuan telah dibuat dengan rincian berikut:\n\nNomor       : {{ticketNumber}}\nPelanggan   : {{customerName}}\nTelepon     : {{customerPhone}}\nAlamat      : {{customerAddress}}\nArea        : {{mitraName}}\nSubjek      : {{subject}}\nKategori    : {{category}}\nPrioritas   : {{priority}}\nWaktu       : {{createdAt}}\n\nKeluhan:\n{{description}}\n\nSalam,\n{{companyName}}.\n\n_Pesan ini dikirim otomatis oleh sistem._'
)
ON CONFLICT (template_id) DO UPDATE SET
    name = EXCLUDED.name,
    category = EXCLUDED.category,
    enabled = EXCLUDED.enabled,
    variables = EXCLUDED.variables,
    content = EXCLUDED.content,
    updated_at = NOW();

-- 2. admin_ticket_resolved
INSERT INTO whatsapp_templates (template_id, name, category, enabled, variables, content)
VALUES (
    'admin_ticket_resolved',
    'Tiket Selesai (Admin & Mitra)',
    'UTILITY',
    true,
    '["ticketNumber", "customerName", "customerPhone", "customerAddress", "mitraName", "subject", "category", "technicianName", "resolutionNotes", "resolvedAt", "companyName"]'::jsonb,
    E'Pemberitahuan Tiket Selesai\n\nTiket bantuan telah diselesaikan dengan rincian berikut:\n\nNomor       : {{ticketNumber}}\nPelanggan   : {{customerName}}\nTelepon     : {{customerPhone}}\nAlamat      : {{customerAddress}}\nArea        : {{mitraName}}\nSubjek      : {{subject}}\nKategori    : {{category}}\nTeknisi     : {{technicianName}}\nWaktu       : {{resolvedAt}}\n\nCatatan Penyelesaian:\n{{resolutionNotes}}\n\nSalam,\n{{companyName}}.\n\n_Pesan ini dikirim otomatis oleh sistem._'
)
ON CONFLICT (template_id) DO UPDATE SET
    name = EXCLUDED.name,
    category = EXCLUDED.category,
    enabled = EXCLUDED.enabled,
    variables = EXCLUDED.variables,
    content = EXCLUDED.content,
    updated_at = NOW();

-- Also update alias ticket_resolved_mitra if present
INSERT INTO whatsapp_templates (template_id, name, category, enabled, variables, content)
VALUES (
    'ticket_resolved_mitra',
    'Tiket Selesai (Mitra)',
    'UTILITY',
    true,
    '["ticketNumber", "customerName", "customerPhone", "customerAddress", "mitraName", "subject", "category", "technicianName", "resolutionNotes", "resolvedAt", "companyName"]'::jsonb,
    E'Pemberitahuan Tiket Selesai\n\nTiket bantuan telah diselesaikan dengan rincian berikut:\n\nNomor       : {{ticketNumber}}\nPelanggan   : {{customerName}}\nTelepon     : {{customerPhone}}\nAlamat      : {{customerAddress}}\nArea        : {{mitraName}}\nSubjek      : {{subject}}\nKategori    : {{category}}\nTeknisi     : {{technicianName}}\nWaktu       : {{resolvedAt}}\n\nCatatan Penyelesaian:\n{{resolutionNotes}}\n\nSalam,\n{{companyName}}.\n\n_Pesan ini dikirim otomatis oleh sistem._'
)
ON CONFLICT (template_id) DO UPDATE SET
    name = EXCLUDED.name,
    category = EXCLUDED.category,
    enabled = EXCLUDED.enabled,
    variables = EXCLUDED.variables,
    content = EXCLUDED.content,
    updated_at = NOW();

-- 3. admin_new_installation
INSERT INTO whatsapp_templates (template_id, name, category, enabled, variables, content)
VALUES (
    'admin_new_installation',
    'Jadwal Instalasi Baru (Admin & Mitra)',
    'UTILITY',
    true,
    '["jobNumber", "customerName", "customerPhone", "customerAddress", "mitraName", "packageName", "packageSpeed", "scheduleDate", "scheduleTime", "technicianName", "notes", "createdAt", "companyName"]'::jsonb,
    E'Pemberitahuan Jadwal Instalasi Baru\n\nJadwal pemasangan baru telah ditambahkan dengan rincian berikut:\n\nID Job      : {{jobNumber}}\nPelanggan   : {{customerName}}\nTelepon     : {{customerPhone}}\nAlamat      : {{customerAddress}}\nArea        : {{mitraName}}\nPaket       : {{packageName}} ({{packageSpeed}})\nJadwal      : {{scheduleDate}} {{scheduleTime}}\nTeknisi     : {{technicianName}}\nCatatan     : {{notes}}\nWaktu       : {{createdAt}}\n\nSalam,\n{{companyName}}.\n\n_Pesan ini dikirim otomatis oleh sistem._'
)
ON CONFLICT (template_id) DO UPDATE SET
    name = EXCLUDED.name,
    category = EXCLUDED.category,
    enabled = EXCLUDED.enabled,
    variables = EXCLUDED.variables,
    content = EXCLUDED.content,
    updated_at = NOW();

-- 4. admin_installation_completed
INSERT INTO whatsapp_templates (template_id, name, category, enabled, variables, content)
VALUES (
    'admin_installation_completed',
    'Instalasi Selesai (Admin & Mitra)',
    'UTILITY',
    true,
    '["jobNumber", "serviceNumber", "customerName", "customerPhone", "customerAddress", "mitraName", "packageName", "technicianName", "completedAt", "companyName"]'::jsonb,
    E'Pemberitahuan Instalasi Selesai\n\nInstalasi pelanggan telah selesai dan layanan telah aktif:\n\nID Job      : {{jobNumber}}\nNo. Layanan : {{serviceNumber}}\nPelanggan   : {{customerName}}\nTelepon     : {{customerPhone}}\nAlamat      : {{customerAddress}}\nArea        : {{mitraName}}\nPaket       : {{packageName}}\nTeknisi     : {{technicianName}}\nWaktu       : {{completedAt}}\n\nLayanan telah aktif dan siap digunakan pelanggan.\n\nSalam,\n{{companyName}}.\n\n_Pesan ini dikirim otomatis oleh sistem._'
)
ON CONFLICT (template_id) DO UPDATE SET
    name = EXCLUDED.name,
    category = EXCLUDED.category,
    enabled = EXCLUDED.enabled,
    variables = EXCLUDED.variables,
    content = EXCLUDED.content,
    updated_at = NOW();

-- Also update alias installation_completed_mitra if present
INSERT INTO whatsapp_templates (template_id, name, category, enabled, variables, content)
VALUES (
    'installation_completed_mitra',
    'Instalasi Selesai (Mitra)',
    'UTILITY',
    true,
    '["jobNumber", "serviceNumber", "customerName", "customerPhone", "customerAddress", "mitraName", "packageName", "technicianName", "completedAt", "companyName"]'::jsonb,
    E'Pemberitahuan Instalasi Selesai\n\nInstalasi pelanggan telah selesai dan layanan telah aktif:\n\nID Job      : {{jobNumber}}\nNo. Layanan : {{serviceNumber}}\nPelanggan   : {{customerName}}\nTelepon     : {{customerPhone}}\nAlamat      : {{customerAddress}}\nArea        : {{mitraName}}\nPaket       : {{packageName}}\nTeknisi     : {{technicianName}}\nWaktu       : {{completedAt}}\n\nLayanan telah aktif dan siap digunakan pelanggan.\n\nSalam,\n{{companyName}}.\n\n_Pesan ini dikirim otomatis oleh sistem._'
)
ON CONFLICT (template_id) DO UPDATE SET
    name = EXCLUDED.name,
    category = EXCLUDED.category,
    enabled = EXCLUDED.enabled,
    variables = EXCLUDED.variables,
    content = EXCLUDED.content,
    updated_at = NOW();

-- 5. admin_daily_recap
INSERT INTO whatsapp_templates (template_id, name, category, enabled, variables, content)
VALUES (
    'admin_daily_recap',
    'Rekap Harian Transaksi Kemarin (Superadmin)',
    'UTILITY',
    true,
    '["recapDate", "totalRevenue", "totalTransactions", "cashTotal", "transferTotal", "autopayTotal", "tripayTotal", "mitraBreakdown", "companyName"]'::jsonb,
    E'Pemberitahuan Rekap Transaksi Harian\n\nBerikut rangkuman transaksi penerimaan pembayaran kemarin:\nPeriode     : {{recapDate}} (00:00 - 23:59 WIB)\n\nTotal Masuk : {{totalRevenue}}\nTransaksi   : {{totalTransactions}} transaksi\n\nRincian Metode Pembayaran:\n- Tunai     : {{cashTotal}}\n- Transfer  : {{transferTotal}}\n- Autopay   : {{autopayTotal}}\n- Tripay    : {{tripayTotal}}\n\nKontribusi Per Area / Mitra:\n{{mitraBreakdown}}\n\nSalam,\n{{companyName}}.\n\n_Pesan ini dikirim otomatis oleh sistem._'
)
ON CONFLICT (template_id) DO UPDATE SET
    name = EXCLUDED.name,
    category = EXCLUDED.category,
    enabled = EXCLUDED.enabled,
    variables = EXCLUDED.variables,
    content = EXCLUDED.content,
    updated_at = NOW();

-- 6. mitra_daily_recap
INSERT INTO whatsapp_templates (template_id, name, category, enabled, variables, content)
VALUES (
    'mitra_daily_recap',
    'Rekap Harian Transaksi Kemarin (Mitra)',
    'UTILITY',
    true,
    '["mitraName", "recapDate", "totalRevenue", "totalTransactions", "paymentBreakdown", "transactionList", "companyName"]'::jsonb,
    E'Pemberitahuan Rekap Transaksi Area\n\nHalo {{mitraName}},\n\nBerikut rangkuman transaksi penerimaan pembayaran area Anda kemarin:\nPeriode     : {{recapDate}} (00:00 - 23:59 WIB)\n\nTotal Masuk : {{totalRevenue}}\nTransaksi   : {{totalTransactions}} transaksi\n\nMetode Pembayaran:\n{{paymentBreakdown}}\n\nRincian Transaksi:\n{{transactionList}}\n\nSalam,\n{{companyName}}.\n\n_Pesan ini dikirim otomatis oleh sistem._'
)
ON CONFLICT (template_id) DO UPDATE SET
    name = EXCLUDED.name,
    category = EXCLUDED.category,
    enabled = EXCLUDED.enabled,
    variables = EXCLUDED.variables,
    content = EXCLUDED.content,
    updated_at = NOW();

-- 7. network_device_alert
INSERT INTO whatsapp_templates (template_id, name, category, enabled, variables, content)
VALUES (
    'network_device_alert',
    'Alert Status Perangkat Jaringan (NAS / OLT)',
    'UTILITY',
    true,
    '["statusTitle", "deviceType", "deviceName", "deviceIp", "eventTime", "detailInfo", "companyName"]'::jsonb,
    E'Pemberitahuan Status Perangkat Jaringan\n\nStatus perangkat infrastruktur jaringan:\n\nStatus      : {{statusTitle}}\nTipe        : {{deviceType}}\nNama        : {{deviceName}}\nIP Host     : {{deviceIp}}\nWaktu       : {{eventTime}}\nKeterangan  : {{detailInfo}}\n\nMohon dilakukan pengecekan pada perangkat terkait.\n\nSalam,\n{{companyName}}.\n\n_Pesan ini dikirim otomatis oleh sistem._'
)
ON CONFLICT (template_id) DO UPDATE SET
    name = EXCLUDED.name,
    category = EXCLUDED.category,
    enabled = EXCLUDED.enabled,
    variables = EXCLUDED.variables,
    content = EXCLUDED.content,
    updated_at = NOW();

-- 8. voucher_delivered (Clean, icon-free)
INSERT INTO whatsapp_templates (template_id, name, category, enabled, variables, content)
VALUES (
    'voucher_delivered',
    'Voucher Hotspot Dikirim',
    'transactional',
    true,
    '["customer_name", "voucher_code", "username", "password", "duration_hours", "speed_limit", "ssid", "support_phone", "company_name"]'::jsonb,
    E'Pemberitahuan Voucher Hotspot\n\nHalo {{customer_name}},\n\nBerikut rincian voucher hotspot Anda:\n\nKode Voucher : {{voucher_code}}\nUsername     : {{username}}\nPassword     : {{password}}\nDurasi       : {{duration_hours}} jam\nKecepatan    : {{speed_limit}}\n\nPetunjuk Penggunaan:\n1. Hubungkan perangkat ke WiFi "{{ssid}}"\n2. Buka peramban jika halaman login tidak muncul otomatis\n3. Masukkan username dan password di atas\n4. Klik tombol Login\n\nJika mengalami kendala, silakan hubungi {{support_phone}}.\n\nSalam,\n{{company_name}}.\n\n_Pesan ini dikirim otomatis oleh sistem._'
)
ON CONFLICT (template_id) DO UPDATE SET
    name = EXCLUDED.name,
    category = EXCLUDED.category,
    enabled = EXCLUDED.enabled,
    variables = EXCLUDED.variables,
    content = EXCLUDED.content,
    updated_at = NOW();

-- 9. mitra_payment_received (Clean, icon-free)
INSERT INTO whatsapp_templates (template_id, name, category, enabled, variables, content)
VALUES (
    'mitra_payment_received',
    'Notifikasi Pembayaran ke Mitra',
    'billing',
    true,
    '["mitraName", "customerName", "serviceNumber", "invoiceNumber", "packageName", "amount", "paymentDate", "paymentMethod", "destinationBank", "reconciliationInfo", "isolirDate", "companyName"]'::jsonb,
    E'Pemberitahuan Pembayaran Pelanggan Area\n\nHalo {{mitraName}},\n\nPembayaran tagihan pelanggan di area Anda telah berhasil diproses dengan rincian berikut:\n\nPelanggan     : {{customerName}}\nNo. Layanan   : {{serviceNumber}}\nInvoice       : {{invoiceNumber}}\nPaket         : {{packageName}}\nJumlah        : Rp {{amount}}\nTanggal Bayar : {{paymentDate}}\nMetode        : {{paymentMethod}}\nTujuan Bank   : {{destinationBank}}\nRekonsiliasi  : {{reconciliationInfo}}\nMasa Aktif    : {{isolirDate}}\n\nSalam,\n{{companyName}}.\n\n_Pesan ini dikirim otomatis oleh sistem._'
)
ON CONFLICT (template_id) DO UPDATE SET
    name = EXCLUDED.name,
    category = EXCLUDED.category,
    enabled = EXCLUDED.enabled,
    variables = EXCLUDED.variables,
    content = EXCLUDED.content,
    updated_at = NOW();

-- 10. payment_confirmation (Clean, icon-free)
INSERT INTO whatsapp_templates (template_id, name, category, enabled, variables, content)
VALUES (
    'payment_confirmation',
    'Konfirmasi Pembayaran',
    'billing',
    true,
    '["invoiceNumber", "customerName", "serviceNumber", "packageName", "amount", "paymentMethod", "paymentDate", "dueDate", "isolirDate", "companyName"]'::jsonb,
    E'Pelanggan yang terhormat,\n\nPembayaran Anda telah kami terima dengan rincian:\n\nInvoice         : {{invoiceNumber}}\nPelanggan       : {{customerName}}\nNo. Layanan     : {{serviceNumber}}\nPaket Langganan : {{packageName}}\nJumlah          : Rp {{amount}}\nMetode          : {{paymentMethod}}\nTanggal         : {{paymentDate}}\n\nLayanan sudah aktif dan dapat digunakan sampai dengan {{isolirDate}}.\nJika internet belum terhubung, silakan matikan dan hidupkan kembali perangkat Modem/ONT.\n\nTerima kasih telah melakukan pembayaran tepat waktu.\n\nSalam,\n{{companyName}}.\n\n_Pesan ini dikirim otomatis oleh sistem._'
)
ON CONFLICT (template_id) DO UPDATE SET
    name = EXCLUDED.name,
    category = EXCLUDED.category,
    enabled = EXCLUDED.enabled,
    variables = EXCLUDED.variables,
    content = EXCLUDED.content,
    updated_at = NOW();
