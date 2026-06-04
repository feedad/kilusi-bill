-- Registration Rejected
INSERT INTO whatsapp_templates (template_id, name, category, content, variables, enabled)
VALUES (
    'registration_rejected',
    'Registrasi Ditolak',
    'registration',
    '❌ *REGISTRASI DITOLAK*

Halo {customer_name},

Mohon maaf, registrasi Anda tidak dapat dilanjutkan.

📝 *Alasan:* {reason}

Jika ada pertanyaan, hubungi: {support_phone}

Terima kasih.

*{company_name}*',
    '["customer_name", "reason", "support_phone", "company_name"]'::jsonb,
    true
) ON CONFLICT (template_id) DO UPDATE SET content = EXCLUDED.content, variables = EXCLUDED.variables, updated_at = NOW();

-- Service Restoration
INSERT INTO whatsapp_templates (template_id, name, category, content, variables, enabled)
VALUES (
    'service_restoration',
    'Service Restoration - Layanan Aktif Kembali',
    'utility',
    '✅ *LAYANAN AKTIF KEMBALI*

Halo {customer_name},

Layanan internet Anda sudah aktif kembali.

📦 Paket: {package_name} ({package_speed})
🔑 Username: {pppoe_username}
🔑 Password: {pppoe_password}

Silakan nikmati layanan kembali.

Hubungi {support_phone} jika ada kendala.

*{company_name}*',
    '["customer_name", "package_name", "package_speed", "pppoe_username", "pppoe_password", "support_phone", "company_name"]'::jsonb,
    true
) ON CONFLICT (template_id) DO UPDATE SET content = EXCLUDED.content, variables = EXCLUDED.variables, updated_at = NOW();

-- Ticket Assigned to Technician
INSERT INTO whatsapp_templates (template_id, name, category, content, variables, enabled)
VALUES (
    'ticket_assigned',
    'Tiket Ditugaskan ke Teknisi',
    'support',
    '🎫 *TIKET BARU DITUGASKAN*

Halo {technician_name},

Anda mendapat tugas tiket baru:

👤 Customer: {customer_name}
📱 HP: {customer_phone}
📋 Subjek: {subject}
📂 Kategori: {category}
⚡ Prioritas: {priority}

{description}

🎫 ID: {ticket_number}

Silakan login untuk menindaklanjuti.

*{company_name}*',
    '["technician_name", "customer_name", "customer_phone", "subject", "category", "priority", "description", "ticket_number", "company_name"]'::jsonb,
    true
) ON CONFLICT (template_id) DO UPDATE SET content = EXCLUDED.content, variables = EXCLUDED.variables, updated_at = NOW();

-- Technician New Installation Task
INSERT INTO whatsapp_templates (template_id, name, category, content, variables, enabled)
VALUES (
    'technician_new_installation',
    'Tugas Instalasi Baru untuk Teknisi',
    'installation',
    '🔧 *TUGAS INSTALASI BARU*

Halo {technician_name},

Anda mendapat tugas instalasi baru:

👤 Customer: {customer_name}
📱 HP: {customer_phone}
📍 Alamat: {address}{schedule_info}

📦 Paket: {package_name} ({package_speed})

🎫 ID Instalasi: {installation_id}

Silakan hubungi customer sebelum meluncur.

*{company_name}*',
    '["technician_name", "customer_name", "customer_phone", "address", "schedule_info", "package_name", "package_speed", "installation_id", "company_name"]'::jsonb,
    true
) ON CONFLICT (template_id) DO UPDATE SET content = EXCLUDED.content, variables = EXCLUDED.variables, updated_at = NOW();

-- Admin New Registration Notification
INSERT INTO whatsapp_templates (template_id, name, category, content, variables, enabled)
VALUES (
    'admin_new_registration',
    'Pendaftaran Baru untuk Admin',
    'registration',
    '🔔 *PENDAFTARAN BARU*

Ada pendaftaran customer baru:

👤 Nama: {customer_name}
📱 HP: {customer_phone}
📍 Alamat: {address}
📦 Paket: {package_name}
📅 Tanggal: {registration_date}

Segera proses pendaftaran ini.

*{company_name}*',
    '["customer_name", "customer_phone", "address", "package_name", "registration_date", "company_name"]'::jsonb,
    true
) ON CONFLICT (template_id) DO UPDATE SET content = EXCLUDED.content, variables = EXCLUDED.variables, updated_at = NOW();

-- Ticket Resolved (Customer)
INSERT INTO whatsapp_templates (template_id, name, category, content, variables, enabled)
VALUES (
    'ticket_resolved_customer',
    'Tiket Terselesaikan (Customer)',
    'support',
    '✅ *TIKET TERSELESAIKAN*

Halo {customer_name},

Tiket Anda telah terselesaikan.

🎫 No. Tiket: {ticket_number}
📋 Subjek: {subject}
👷 Teknisi: {technician_name}
📝 Solusi: {resolution}

Terima kasih telah melapor.

Hubungi {support_phone} jika masih ada kendala.

*{company_name}*',
    '["customer_name", "ticket_number", "subject", "technician_name", "resolution", "support_phone", "company_name"]'::jsonb,
    true
) ON CONFLICT (template_id) DO UPDATE SET content = EXCLUDED.content, variables = EXCLUDED.variables, updated_at = NOW();
