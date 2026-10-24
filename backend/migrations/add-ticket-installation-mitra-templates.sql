-- Migration: Add operational notification settings and WhatsApp templates
-- for Tickets, Installations, Yesterday's Daily Recap, and NAS/OLT Uptime Monitoring

-- 1. Configuration in app_config
INSERT INTO app_config (key, value, type, category, description) VALUES
  ('notif_ticket_new_enabled', 'true', 'boolean', 'notifications', 'Notifikasi tiket baru ke Admin & Mitra'),
  ('notif_ticket_resolved_enabled', 'true', 'boolean', 'notifications', 'Notifikasi tiket selesai ke Admin & Mitra'),
  ('notif_installation_new_enabled', 'true', 'boolean', 'notifications', 'Notifikasi jadwal instalasi baru ke Admin, Mitra & Teknisi'),
  ('notif_installation_completed_enabled', 'true', 'boolean', 'notifications', 'Notifikasi instalasi selesai ke Admin & Mitra'),
  ('notif_daily_recap_enabled', 'true', 'boolean', 'notifications', 'Notifikasi rekap transaksi harian kemarin'),
  ('daily_recap_time', '07:00', 'string', 'notifications', 'Jam pengiriman rekap transaksi harian'),
  ('nas_monitoring_enabled', 'true', 'boolean', 'monitoring', 'Monitoring uptime NAS MikroTik'),
  ('olt_monitoring_enabled', 'false', 'boolean', 'monitoring', 'Monitoring uptime OLT')
ON CONFLICT (key) DO UPDATE SET
  value = EXCLUDED.value,
  type = EXCLUDED.type,
  category = EXCLUDED.category,
  description = EXCLUDED.description;

-- 2. Ensure uptime_monitors columns for device categorization
ALTER TABLE uptime_monitors ADD COLUMN IF NOT EXISTS device_type VARCHAR(20) DEFAULT 'other';
ALTER TABLE uptime_monitors ADD COLUMN IF NOT EXISTS device_id VARCHAR(50);

-- 3. Templates in whatsapp_templates
INSERT INTO whatsapp_templates (template_id, name, content, category, variables, meta_status, enabled)
VALUES
(
  'admin_new_ticket',
  'Tiket Baru (Admin & Mitra)',
  E'🎫 *TIKET BANTUAN BARU*\n\nNomor    : {{ticketNumber}}\nPelanggan: {{customerName}}\nTelepon  : {{customerPhone}}\nAlamat   : {{customerAddress}}\nArea     : {{mitraName}}\nSubjek   : {{subject}}\nKategori : {{category}}\nPrioritas: {{priority}}\nWaktu    : {{createdAt}}\n\nKeluhan:\n{{description}}\n\n_Pesan ini dikirim otomatis oleh sistem {{companyName}}._',
  'UTILITY',
  '["ticketNumber", "customerName", "customerPhone", "customerAddress", "mitraName", "subject", "category", "priority", "description", "createdAt", "companyName"]'::jsonb,
  'local',
  true
),
(
  'admin_ticket_resolved',
  'Tiket Selesai (Admin & Mitra)',
  E'✅ *TIKET BANTUAN SELESAI*\n\nNomor    : {{ticketNumber}}\nPelanggan: {{customerName}}\nTelepon  : {{customerPhone}}\nAlamat   : {{customerAddress}}\nArea     : {{mitraName}}\nSubjek   : {{subject}}\nKategori : {{category}}\nTeknisi  : {{technicianName}}\nWaktu    : {{resolvedAt}}\n\nCatatan Penyelesaian:\n{{resolutionNotes}}\n\n_Pesan ini dikirim otomatis oleh sistem {{companyName}}._',
  'UTILITY',
  '["ticketNumber", "customerName", "customerPhone", "customerAddress", "mitraName", "subject", "category", "technicianName", "resolutionNotes", "resolvedAt", "companyName"]'::jsonb,
  'local',
  true
),
(
  'admin_new_installation',
  'Jadwal Instalasi Baru (Admin & Mitra)',
  E'🔧 *JADWAL INSTALASI BARU*\n\nID Job   : {{jobNumber}}\nPelanggan: {{customerName}}\nTelepon  : {{customerPhone}}\nAlamat   : {{customerAddress}}\nArea     : {{mitraName}}\nPaket    : {{packageName}} ({{packageSpeed}})\nJadwal   : {{scheduleDate}} {{scheduleTime}}\nTeknisi  : {{technicianName}}\nCatatan  : {{notes}}\nWaktu    : {{createdAt}}\n\n_Pesan ini dikirim otomatis oleh sistem {{companyName}}._',
  'UTILITY',
  '["jobNumber", "customerName", "customerPhone", "customerAddress", "mitraName", "packageName", "packageSpeed", "scheduleDate", "scheduleTime", "technicianName", "notes", "createdAt", "companyName"]'::jsonb,
  'local',
  true
),
(
  'admin_installation_completed',
  'Instalasi Selesai (Admin & Mitra)',
  E'🎉 *INSTALASI SELESAI*\n\nID Job    : {{jobNumber}}\nNo Layanan: {{serviceNumber}}\nPelanggan : {{customerName}}\nTelepon   : {{customerPhone}}\nAlamat    : {{customerAddress}}\nArea      : {{mitraName}}\nPaket     : {{packageName}}\nTeknisi   : {{technicianName}}\nWaktu     : {{completedAt}}\n\nLayanan telah aktif dan siap digunakan pelanggan.\n\n_Pesan ini dikirim otomatis oleh sistem {{companyName}}._',
  'UTILITY',
  '["jobNumber", "serviceNumber", "customerName", "customerPhone", "customerAddress", "mitraName", "packageName", "technicianName", "completedAt", "companyName"]'::jsonb,
  'local',
  true
),
(
  'admin_daily_recap',
  'Rekap Transaksi Kemarin (Superadmin)',
  E'📊 *REKAP TRANSAKSI HARIAN KEMARIN*\nTanggal: {{recapDate}} (00:00 - 23:59 WIB)\n\n💰 *Total Pendapatan:* {{totalRevenue}}\n🔢 *Total Transaksi:* {{totalTransactions}} transaksi\n\n💳 *Rincian Metode Pembayaran:*\n• Tunai    : {{cashTotal}}\n• Transfer : {{transferTotal}}\n• Autopay  : {{autopayTotal}}\n• Tripay   : {{tripayTotal}}\n\n📍 *Kontribusi Per Area / Mitra:*\n{{mitraBreakdown}}\n\n_Laporan otomatis sistem {{companyName}}._',
  'billing',
  '["recapDate", "totalRevenue", "totalTransactions", "cashTotal", "transferTotal", "autopayTotal", "tripayTotal", "mitraBreakdown", "companyName"]'::jsonb,
  'local',
  true
),
(
  'mitra_daily_recap',
  'Rekap Transaksi Kemarin (Mitra Area)',
  E'📊 *REKAP TRANSAKSI AREA: {{mitraName}}*\nTanggal: {{recapDate}} (00:00 - 23:59 WIB)\n\n💰 *Total Pendapatan:* {{totalRevenue}}\n🔢 *Total Transaksi:* {{totalTransactions}} transaksi\n\n💳 *Metode Pembayaran:*\n{{paymentBreakdown}}\n\n📝 *Rincian Transaksi:*\n{{transactionList}}\n\n_Laporan otomatis sistem {{companyName}}._',
  'billing',
  '["mitraName", "recapDate", "totalRevenue", "totalTransactions", "paymentBreakdown", "transactionList", "companyName"]'::jsonb,
  'local',
  true
),
(
  'network_device_alert',
  'Alert Status Perangkat Jaringan',
  E'{{statusIcon}} *ALERT MONITORING JARINGAN*\n\nStatus   : *{{statusTitle}}*\nTipe     : {{deviceType}}\nNama     : {{deviceName}}\nIP Host  : {{deviceIp}}\nWaktu    : {{eventTime}}\nInfo     : {{detailInfo}}\n\n_Pesan otomatis sistem monitoring {{companyName}}._',
  'UTILITY',
  '["statusIcon", "statusTitle", "deviceType", "deviceName", "deviceIp", "eventTime", "detailInfo", "companyName"]'::jsonb,
  'local',
  true
)
ON CONFLICT (template_id) DO UPDATE SET
  name = EXCLUDED.name,
  content = EXCLUDED.content,
  category = EXCLUDED.category,
  variables = EXCLUDED.variables,
  enabled = true,
  updated_at = NOW();
