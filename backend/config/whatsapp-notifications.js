const { getSetting, updateSetting } = require("./settingsManager");
const billingManager = require("./billing");
const logger = require("./logger");
const fs = require("fs");
const path = require("path");
const kilusiOmnichat = require("./kilusi-whatsapp");
const { query } = require("./database");
const messageLogger = require("../services/omnichat-message-logger");

class WhatsAppNotificationManager {
    constructor() {
        this.sock = null;
        this.lastQR = null;
        this.qrCodeData = null;
        this.templatesFile = path.join(
            __dirname,
            "../data/whatsapp-templates.json",
        );
        this.templates = this.loadTemplates() || {
            invoice_created: {
                title: "Tagihan Baru",
                template: `🧾 *TAGIHAN BARU*

Halo {customer_name},

Berikut tagihan internet Anda:

📦 Paket: {package_name} ({package_speed})
💰 Jumlah: Rp {amount}
📅 Jatuh Tempo: {due_date}
🔖 No. Invoice: {invoice_number}

{payment_accounts}

{company_name}
{company_address}

Hubungi {support_phone} untuk konfirmasi pembayaran.`,
                enabled: true,
            },
            due_date_reminder: {
                title: "Peringatan Jatuh Tempo",
                template: `⚠️ *PERINGATAN JATUH TEMPO*

Halo {customer_name},

Tagihan Anda akan jatuh tempo dalam {days_remaining} hari:

📄 *No. Invoice:* {invoice_number}
💰 *Jumlah:* Rp {amount}
📅 *Jatuh Tempo:* {due_date}
📦 *Paket: {package_name} ({package_speed})

{payment_accounts}

{company_name}
{company_address}

Hubungi {support_phone} untuk konfirmasi pembayaran.`,
                enabled: true,
            },
            payment_received: {
                title: "Pembayaran Diterima",
                template: `✅ *PEMBAYARAN DITERIMA*

Halo {customer_name},

Terima kasih! Pembayaran Anda telah kami terima:

📄 *No. Invoice:* {invoice_number}
💰 *Jumlah:* Rp {amount}
💳 *Metode Pembayaran:* {payment_method}
📅 *Tanggal Pembayaran:* {payment_date}
🔢 *No. Referensi:* {reference_number}

Layanan internet Anda akan tetap aktif. Terima kasih atas kepercayaan Anda.`,
                enabled: true,
            },
            service_disruption: {
                title: "Gangguan Layanan",
                template: `🚨 *GANGGUAN LAYANAN*

Halo Pelanggan Setia,

Kami informasikan bahwa sedang terjadi gangguan pada jaringan internet:

📡 *Jenis Gangguan:* {disruption_type}
📍 *Area Terdampak:* {affected_area}
⏰ *Perkiraan Selesai:* {estimated_resolution}
📞 *Hotline:* {support_phone}

Kami sedang bekerja untuk mengatasi masalah ini secepat mungkin. Mohon maaf atas ketidaknyamanannya.

Terima kasih atas pengertian Anda.`,
                enabled: true,
            },
            service_announcement: {
                title: "Pengumuman Layanan",
                template: `📢 *PENGUMUMAN LAYANAN*

Halo Pelanggan Setia,

{announcement_content}

Terima kasih atas perhatian Anda.`,
                enabled: true,
            },

            service_suspension: {
                title: "Service Suspension",
                template: `⚠️ *LAYANAN INTERNET DINONAKTIFKAN*

Halo {customer_name},

Layanan internet Anda telah dinonaktifkan sementara karena:

📋 *Tagihan Belum Dibayar:*
No. Invoice: {invoice_number}
Jumlah: Rp {unpaid_amount}
Alasan: {reason}

{payment_accounts}

Silakan lakukan pembayaran untuk mengaktifkan kembali layanan Anda.

📞 *Butuh Bantuan?*
Hubungi: {support_phone}

*{company_name}*
Terima kasih atas perhatian Anda.`,
                enabled: true,
            },

            service_restoration: {
                title: "Service Restoration",
                template: `✅ *LAYANAN INTERNET DIAKTIFKAN*

Halo {customer_name},

Selamat! Layanan internet Anda telah diaktifkan kembali.

📋 *Informasi:*
• Status: AKTIF ✅
• Paket: {package_name}
• Kecepatan: {package_speed}

Terima kasih telah melakukan pembayaran tepat waktu.

*KILUSI BILL*
Info: +6281234567890`,
                enabled: true,
            },
            welcome_message: {
                title: "Welcome Message",
                template: `👋 *SELAMAT DATANG*

Halo {customer_name},

Selamat datang di layanan internet kami!

📦 *Paket:* {package_name} ({package_speed})
🔑 *Password WiFi:* {wifi_password}
📞 *Support:* {support_phone}

Terima kasih telah memilih layanan kami.`,
                enabled: true,
            },
            installation_job_assigned: {
                title: "Tugas Instalasi Baru",
                template: `🔧 *TUGAS INSTALASI BARU*

Halo {technician_name},

Anda telah ditugaskan untuk instalasi baru:

📋 *Detail Job:*
• No. Job: {job_number}
• Pelanggan: {customer_name}
• Telepon: {customer_phone}
• Alamat: {customer_address}

📦 *Paket Internet:*
• Nama: {package_name}
• Harga: Rp {package_price}

📅 *Jadwal Instalasi:*
• Tanggal: {installation_date}
• Waktu: {installation_time}

📝 *Catatan:* {notes}
🛠️ *Peralatan:* {equipment_needed}

📍 *Lokasi:* {customer_address}

*Status:* Ditugaskan
*Prioritas:* {priority}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📱 *MENU KONFIRMASI:*

1️⃣ *KONFIRMASI PENERIMAAN*
Balas dengan: *TERIMA* atau *OK*

2️⃣ *MULAI INSTALASI*
Balas dengan: *MULAI* atau *START*

3️⃣ *SELESAI INSTALASI*
Balas dengan: *SELESAI* atau *DONE*

4️⃣ *BUTUH BANTUAN*
Balas dengan: *BANTU* atau *HELP*

5️⃣ *LAPOR MASALAH*
Balas dengan: *MASALAH* atau *ISSUE*

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

💡 *HELPER RESPONS CEPAT:*
• *TERIMA* - Konfirmasi menerima tugas
• *MULAI* - Mulai proses instalasi
• *SELESAI* - Tandai instalasi selesai
• *BANTU* - Minta bantuan teknis
• *MASALAH* - Laporkan kendala

📞 *Support:* +6281234567890

Silakan konfirmasi penerimaan tugas ini dengan balasan *TERIMA*.

*KILUSI BILL*`,
                enabled: true,
            },
            installation_status_update: {
                title: "Update Status Instalasi",
                template: `🔄 *UPDATE STATUS INSTALASI*

Halo {technician_name},

Status instalasi telah diperbarui:

📋 *Detail Job:*
• No. Job: {job_number}
• Pelanggan: {customer_name}
• Status Baru: {new_status}
• Waktu Update: {update_time}

📝 *Catatan:* {notes}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📱 *MENU KONFIRMASI:*

1️⃣ *KONFIRMASI UPDATE*
Balas dengan: *KONFIRM* atau *OK*

2️⃣ *BUTUH BANTUAN*
Balas dengan: *BANTU* atau *HELP*

3️⃣ *LAPOR MASALAH*
Balas dengan: *MASALAH* atau *ISSUE*

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

*KILUSI BILL*`,
                enabled: true,
            },
            installation_completed: {
                title: "Instalasi Selesai",
                template: `✅ *INSTALASI SELESAI*

Halo {technician_name},

Selamat! Instalasi telah berhasil diselesaikan:

📋 *Detail Job:*
• No. Job: {job_number}
• Pelanggan: {customer_name}
• Status: SELESAI ✅
• Waktu Selesai: {completion_time}

📝 *Catatan Penyelesaian:* {completion_notes}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📱 *MENU KONFIRMASI:*

1️⃣ *KONFIRMASI SELESAI*
Balas dengan: *KONFIRM* atau *OK*

2️⃣ *LAPOR TAMBAHAN*
Balas dengan: *LAPOR* atau *REPORT*

3️⃣ *BUTUH BANTUAN*
Balas dengan: *BANTU* atau *HELP*

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

💡 *HELPER RESPONS CEPAT:*
• *KONFIRM* - Konfirmasi penyelesaian
• *LAPOR* - Laporkan detail tambahan
• *BANTU* - Minta bantuan teknis

*KILUSI BILL*`,
                enabled: true,
            },
            // Template baru untuk registrasi dan tiket
            registration_submitted: {
                title: "Registrasi Berhasil",
                template: `✅ *REGISTRASI BERHASIL*

Halo {customer_name},

Terima kasih telah mendaftar layanan internet kami!

Registrasi Anda telah kami terima pada {registration_date}.
Tim kami akan menghubungi Anda segera untuk jadwal survei dan instalasi.

*KILUSI BILL*`,
                enabled: true,
            },
            registration_approved: {
                title: "Registrasi Diterima",
                template: `🎉 *REGISTRASI DITERIMA*

Halo {customer_name},

Selamat! Registrasi Anda telah disetujui.

📦 Paket: {package_name} ({package_speed})

Jadwal Instalasi:
📅 Tanggal: {installation_date}
⏰ Waktu: {installation_time}
👷 Teknisi: {technician_name}
📞 Kontak: {technician_phone}

Pastikan alamat dapat diakses pada waktu tersebut.
Teknisi akan menghubungi Anda sebelum datang.

*KILUSI BILL*`,
                enabled: true,
            },
            installation_completed_customer: {
                title: "Instalasi Selesai (Customer)",
                template: `🎊 *INSTALASI SELESAI*

Halo {customer_name},

Selamat! Instalasi internet Anda telah selesai.

📦 Paket: {package_name} ({package_speed})
🔑 Username: {username}
🔑 Password WiFi: {wifi_password}

Anda sudah dapat menikmati layanan internet kami.

Jika ada kendala, hubungi:
{support_phone}

*KILUSI BILL*`,
                enabled: true,
            },
            ticket_created: {
                title: "Tiket Support Baru",
                template: `🎫 *TIKET SUPPORT BARU*

Halo {customer_name},

Tiket Anda telah dibuat:

📝 Nomor: {ticket_number}
📋 Subjek: {subject}
📂 Kategori: {category}
⚡ Prioritas: {priority}

Deskripsi:
{description}

Tim kami akan segera memproses tiket Anda.

*KILUSI BILL*`,
                enabled: true,
            },
            ticket_updated: {
                title: "Update Tiket",
                template: `🔄 *UPDATE TIKET*

Halo {customer_name},

Tiket Anda telah diperbarui:

📝 Nomor: {ticket_number}
📊 Status Baru: {new_status}

{update_message}

Terima kasih telah menggunakan layanan kami.

*KILUSI BILL*`,
                enabled: true,
            },
        };
    }

    setSock(sockInstance) {
        this.sock = sockInstance;

        // Listen for QR events if provided by the connection logic
        if (this.sock && this.sock.ev) {
            this.sock.ev.on("connection.update", (update) => {
                const { qr, connection } = update;
                if (qr) {
                    this.lastQR = qr;
                    logger.info("[Baileys] New QR Code generated");
                }
                if (connection === "open") {
                    this.lastQR = null;
                    logger.info("[Baileys] Connected successfully");
                }
            });
        }
    }

    /**
     * Request a pairing code for phone-only login
     * @param {string} phoneNumber - Target phone number
     * @returns {Promise<string>} 8-character pairing code
     */
    async requestPairingCode(phoneNumber) {
        if (!this.sock) {
            throw new Error(
                "WhatsApp socket not initialized. Please wait or refresh.",
            );
        }

        const code = await this.sock.requestPairingCode(
            this.formatPhoneNumber(phoneNumber),
        );
        logger.info(
            `[Baileys] Pairing code generated for ${phoneNumber}: ${code}`,
        );
        return code;
    }

    // Format phone number for WhatsApp
    formatPhoneNumber(number) {
        let cleaned = number.replace(/\D/g, "");
        if (cleaned.startsWith("0")) {
            cleaned = "62" + cleaned.slice(1);
        }
        if (!cleaned.startsWith("62")) {
            cleaned = "62" + cleaned;
        }
        return cleaned;
    }

    // Helper method to get invoice image path with fallback handling
    getInvoiceImagePath() {
        const imagePaths = [
            path.resolve(__dirname, "../public/img/tagihan.jpg"),
            path.resolve(__dirname, "../public/img/tagihan.png"),
            path.resolve(__dirname, "../public/img/invoice.jpg"),
            path.resolve(__dirname, "../public/img/invoice.png"),
            path.resolve(__dirname, "../public/img/logo.png"),
        ];

        // Check each path and return the first one that exists
        for (const imagePath of imagePaths) {
            if (fs.existsSync(imagePath)) {
                logger.info(`📸 Using invoice image: ${imagePath}`);
                return imagePath;
            }
        }

        // Log if no image found (will send text-only)
        logger.warn(
            `⚠️ No invoice image found, will send text-only notification`,
        );
        return null;
    }

    // Replace template variables with actual data
    replaceTemplateVariables(template, data) {
        let message = template;
        for (const [key, value] of Object.entries(data)) {
            // Support both {{key}} (database templates) and {key} (config templates)
            const doubleBrace = `{{${key}}}`;
            const singleBrace = `{${key}}`;
            message = message.replace(
                new RegExp(doubleBrace, "g"),
                value || "",
            );
            message = message.replace(
                new RegExp(singleBrace, "g"),
                value || "",
            );
        }
        return message;
    }

    // Format currency
    formatCurrency(amount) {
        return new Intl.NumberFormat("id-ID").format(amount);
    }

    // Format date
    formatDate(date) {
        return new Date(date).toLocaleDateString("id-ID", {
            year: "numeric",
            month: "long",
            day: "numeric",
        });
    }

    // ============================================================
    // DYNAMIC PARAMETER RESOLVER
    // Maps template variable names to their resolution functions.
    // Each resolver receives: (ctx) where ctx = { customer, invoice, package, payment, service, company, customData }
    // ============================================================

    PARAMETER_REGISTRY = {
        // === CUSTOMER ===
        customerName: (ctx) =>
            ctx.customer?.name ||
            ctx.customData?.customerName ||
            ctx.customData?.customer_name ||
            "",
        customerPhone: (ctx) =>
            ctx.customer?.phone ||
            ctx.customData?.customerPhone ||
            ctx.customData?.customer_phone ||
            "",
        customerAddress: (ctx) =>
            ctx.customer?.address ||
            ctx.customData?.customerAddress ||
            ctx.customData?.customer_address ||
            "",
        customerEmail: (ctx) =>
            ctx.customer?.email ||
            ctx.customData?.customerEmail ||
            ctx.customData?.customer_email ||
            "",

        // === SERVICE ===
        serviceNumber: (ctx) =>
            ctx.invoice?.service_number ||
            ctx.service?.service_number ||
            ctx.customer?.service_number ||
            ctx.customData?.serviceNumber ||
            ctx.customData?.service_number ||
            "",
        username: (ctx) =>
            ctx.customer?.pppoe_username || ctx.customData?.username || "",
        wifiPassword: (ctx) =>
            ctx.customer?.wifi_password ||
            ctx.customData?.wifiPassword ||
            ctx.customData?.wifi_password ||
            "",

        // === INVOICE ===
        invoiceNumber: (ctx) =>
            ctx.invoice?.invoice_number ||
            ctx.customData?.invoiceNumber ||
            ctx.customData?.invoice_number ||
            "",
        amount:          (ctx) => {
            // Autopay: amount_with_code works regardless of payment state
            if (ctx.invoice?.amount_with_code != null)
                return this.formatCurrency(ctx.invoice.amount_with_code);
            // Autopay payment confirmation fallback (payment.gateway check)
            if (
                ctx.payment?.gateway === "autopay" ||
                ctx.invoice?.payment_gateway === "autopay"
            ) {
                if (ctx.customData?.amount)
                    return this.formatCurrency(ctx.customData.amount);
            }
            // Tripay: base + admin fee = what customer actually paid
            if (
                ctx.payment?.gateway === "tripay" ||
                ctx.invoice?.payment_gateway === "tripay"
            ) {
                const base = parseFloat(ctx.invoice?.amount || 0);
                const fee = parseFloat(
                    ctx.invoice?.payment_fee_amount ||
                        ctx.payment?.fee_amount ||
                        0,
                );
                return this.formatCurrency(fee > 0 ? base + fee : base);
            }
            // Prefer final_amount if differs from amount (saldo marketing / referral discount applied)
            if (ctx.invoice?.final_amount != null && ctx.invoice?.amount != null
                && parseFloat(ctx.invoice.final_amount) !== parseFloat(ctx.invoice.amount))
                return this.formatCurrency(ctx.invoice.final_amount);
            if (ctx.invoice?.amount != null)
                return this.formatCurrency(ctx.invoice.amount);
            if (ctx.customData?.amount) return ctx.customData.amount;
            if (ctx.package?.price != null)
                return this.formatCurrency(ctx.package.price);
            return "";
        },
        isolirDate: (ctx) => {
            if (ctx.customData?.isolirDate || ctx.customData?.isolir_date)
                return this.formatDate(
                    ctx.customData.isolirDate || ctx.customData.isolir_date,
                );
            if (ctx.service?.isolir_date)
                return this.formatDate(ctx.service.isolir_date);
            if (ctx.customer?.isolir_date)
                return this.formatDate(ctx.customer.isolir_date);
            return "";
        },
        dueDate: (ctx) => {
            if (ctx.customData?.dueDate || ctx.customData?.due_date)
                return this.formatDate(
                    ctx.customData.dueDate || ctx.customData.due_date,
                );
            if (ctx.invoice?.due_date)
                return this.formatDate(ctx.invoice.due_date);
            if (ctx.customer?.isolir_date)
                return this.formatDate(ctx.customer.isolir_date);
            return "";
        },

        // === SERVICE / BILLING CYCLE ===
        activeDate: (ctx) => {
            const raw =
                ctx.service?.active_date ||
                ctx.customer?.active_date ||
                ctx.customData?.activeDate ||
                ctx.customData?.active_date;
            return raw ? this.formatDate(raw) : "";
        },
        billingType: (ctx) => {
            const raw =
                ctx.service?.billing_type ||
                ctx.customer?.billing_type ||
                ctx.customData?.billingType ||
                ctx.customData?.billing_type ||
                "";
            const labels = {
                prepaid: "Prabayar",
                postpaid: "Pascabayar",
                PRABAYAR: "Prabayar",
                PASCABAYAR: "Pascabayar",
            };
            return labels[raw] || raw;
        },

        // === PACKAGE ===
        packageName: (ctx) =>
            ctx.package?.name ||
            ctx.customData?.packageName ||
            ctx.customData?.package_name ||
            "",
        packageSpeed: (ctx) =>
            ctx.package?.speed ||
            ctx.customData?.packageSpeed ||
            ctx.customData?.package_speed ||
            "",
        packagePrice: (ctx) =>
            ctx.package?.price != null
                ? this.formatCurrency(ctx.package.price)
                : ctx.customData?.packagePrice ||
                  ctx.customData?.package_price ||
                  "",

        // === PAYMENT ===
        paymentMethod: (ctx) => {
            const raw =
                ctx.payment?.payment_method ||
                ctx.customData?.paymentMethod ||
                ctx.customData?.payment_method ||
                "";
            if (!raw) return "";
            // Resolve bank_xxx or ewallet_xxx to human-readable name
            if (raw.startsWith("bank_") || raw.startsWith("ewallet_")) {
                try {
                    let ps = getSetting("payment_settings");
                    if (typeof ps === "string") {
                        try {
                            ps = JSON.parse(ps);
                        } catch (e) {}
                    }
                    if (ps) {
                        const accounts =
                            ps.bank_accounts || ps.bankAccounts || [];
                        const wallets = ps.ewallets || ps.eWallets || [];
                        const all = [...accounts, ...wallets];
                        const id = raw.startsWith("bank_")
                            ? raw.replace("bank_", "")
                            : raw.replace("ewallet_", "");
                        const found = all.find(
                            (b) => String(b.id) === String(id),
                        );
                        if (found)
                            return `${found.bankName || found.bank_name || found.provider || "Bank"} - ${found.accountNumber || found.account_number || found.phoneNumber || ""}`;
                    }
                } catch (e) {
                    /* ignore */
                }
            }
            return raw;
        },
        paymentDate: (ctx) =>
            ctx.payment?.payment_date
                ? this.formatDate(ctx.payment.payment_date)
                : ctx.customData?.paymentDate ||
                  ctx.customData?.payment_date ||
                  "",
        referenceNumber: (ctx) =>
            ctx.customData?.referenceNumber ||
            ctx.customData?.reference_number ||
            "",

        // === COMPANY (pre-resolved into context.company) ===
        companyName: (ctx) => ctx.company?.name || "",
        companyAddress: (ctx) => ctx.company?.address || "",
        supportPhone: (ctx) => ctx.company?.support_phone || "",
        customerPortal: (ctx) => ctx.company?.customer_portal || "",
        paymentAccounts: (ctx) => ctx.company?.payment_accounts || "",
        paymentUrl: (ctx) => {
            const inv = ctx.invoice?.invoice_number ||
                ctx.customData?.invoiceNumber ||
                ctx.customData?.invoice_number || "";
            return inv ? `https://billing.kilusi.id/pay/${inv}` : "";
        },
        customerToken: (ctx) => ctx.company?.customer_token || "",

        // === PACKAGE CHANGE ===
        oldPackageName: (ctx) =>
            ctx.customData?.oldPackageName ||
            ctx.customData?.old_package_name ||
            "",
        oldPackagePrice: (ctx) => {
            const val = ctx.customData?.oldPackagePrice || ctx.customData?.old_package_price;
            if (!val) return "";
            return typeof val === "number" ? this.formatCurrency(val) : String(val);
        },
        newPackageName: (ctx) =>
            ctx.customData?.newPackageName ||
            ctx.customData?.new_package_name ||
            "",
        newPackagePrice: (ctx) => {
            const val = ctx.customData?.newPackagePrice || ctx.customData?.new_package_price;
            if (!val) return "";
            return typeof val === "number" ? this.formatCurrency(val) : String(val);
        },

        // === REGISTRATION ===
        registrationDate: (ctx) =>
            ctx.customData?.registrationDate ||
            ctx.customData?.registration_date ||
            "",
        installationDate: (ctx) =>
            ctx.customData?.installationDate ||
            ctx.customData?.installation_date ||
            "",
        installationTime: (ctx) =>
            ctx.customData?.installationTime ||
            ctx.customData?.installation_time ||
            "",
        technicianName: (ctx) =>
            ctx.customData?.technicianName ||
            ctx.customData?.technician_name ||
            "",
        technicianPhone: (ctx) =>
            ctx.customData?.technicianPhone ||
            ctx.customData?.technician_phone ||
            "",
        reason: (ctx) => ctx.customData?.reason || "",
        notes: (ctx) => ctx.customData?.notes || "",

        // === SUPPORT / TICKET ===
        ticketNumber: (ctx) =>
            ctx.customData?.ticketNumber || ctx.customData?.ticket_number || "",
        subject: (ctx) => ctx.customData?.subject || "",
        category: (ctx) => ctx.customData?.category || "",
        description: (ctx) => ctx.customData?.description || "",
        newStatus: (ctx) =>
            ctx.customData?.newStatus || ctx.customData?.new_status || "",
        assignedAgent: (ctx) =>
            ctx.customData?.assignedAgent ||
            ctx.customData?.assigned_agent ||
            "",
        updateMessage: (ctx) =>
            ctx.customData?.updateMessage ||
            ctx.customData?.update_message ||
            "",
        resolutionNotes: (ctx) =>
            ctx.customData?.resolutionNotes ||
            ctx.customData?.resolution_notes ||
            "",

        // === MAINTENANCE / BROADCAST ===
        type: (ctx) => ctx.customData?.type || "",
        title: (ctx) => ctx.customData?.title || "",
        content: (ctx) => ctx.customData?.content || "",

        // === daysRemaining (computed) ===
        daysRemaining: (ctx) => ctx.customData?.daysRemaining || "",
    };

    /**
     * Dynamically resolve all {{variable}} placeholders in a template.
     * - Extracts variables from template content
     * - Resolves each via PARAMETER_REGISTRY using the provided context
     * - Also copies any caller-provided customData for backward compatibility
     *
     * @param {string} templateContent - Template text with {{variables}}
     * @param {object} context - { customer, invoice, package, payment, company, customData }
     * @returns {object} - Resolved key-value map ready for replaceTemplateVariables()
     */
    resolveMessageData(templateContent, context) {
        const data = {};

        // Copy caller-provided customData as base (backward compat for snake_case templates etc.)
        if (context.customData && typeof context.customData === "object") {
            Object.assign(data, context.customData);
        }

        // Extract all {{variable}} from template content
        const variableRegex = /\{\{([^}]+)\}\}/g;
        let match;
        while ((match = variableRegex.exec(templateContent)) !== null) {
            const varName = match[1];
            const resolver = this.PARAMETER_REGISTRY[varName];
            if (resolver) {
                data[varName] = resolver(context) || "";
            }
        }

        return data;
    }

    // Get rate limit settings
    getRateLimitSettings() {
        return {
            maxMessagesPerBatch: getSetting(
                "whatsapp_rate_limit.maxMessagesPerBatch",
                10,
            ),
            delayBetweenBatches: getSetting(
                "whatsapp_rate_limit.delayBetweenBatches",
                30,
            ),
            delayBetweenMessages: getSetting(
                "whatsapp_rate_limit.delayBetweenMessages",
                2,
            ),
            maxRetries: getSetting("whatsapp_rate_limit.maxRetries", 2),
            dailyMessageLimit: getSetting(
                "whatsapp_rate_limit.dailyMessageLimit",
                0,
            ),
            enabled: getSetting("whatsapp_rate_limit.enabled", true),
        };
    }

    // Check daily message limit
    checkDailyMessageLimit() {
        const settings = this.getRateLimitSettings();
        if (settings.dailyMessageLimit <= 0) return true; // No limit

        const d = new Date();
        const today = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
        const dailyCount = getSetting(`whatsapp_daily_count.${today}`, 0);

        return dailyCount < settings.dailyMessageLimit;
    }

    // Increment daily message count
    incrementDailyMessageCount() {
        const d = new Date();
        const today = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
        const currentCount = getSetting(`whatsapp_daily_count.${today}`, 0);
        updateSetting(`whatsapp_daily_count.${today}`, currentCount + 1);
    }

    // Get current WhatsApp provider
    getProvider() {
        return getSetting("whatsapp_provider", "omnichat");
    }

    // Check if Baileys fallback is enabled
    isBaileysFallbackEnabled() {
        return getSetting("baileys_fallback_enabled", true);
    }

    // Get company information from settings
    async getCompanyInfo(customerId = null) {
        try {
            const company = await getSetting("company");
            const supportContacts = company?.supportContacts || [];

            // Get primary support phone (prefer "Konfirmasi Pembayaran" or first contact)
            let supportPhone = company?.phone || "";
            if (supportContacts.length > 0) {
                const paymentContact = supportContacts.find(
                    (c) =>
                        c.label?.toLowerCase().includes("konfirmasi") ||
                        c.label?.toLowerCase().includes("payment"),
                );
                supportPhone =
                    paymentContact?.number || supportContacts[0].number;
            }

            // Format support_phone as wa.me link for clickability
            const waLink = supportPhone
                ? `wa.me/${supportPhone.replace(/\D/g, "").replace(/^0/, "62").replace(/^62/, "62")}`
                : "";

            // Build customer portal URL (prioritas customer_portal_url, fallback ke website)
            const website = company?.website || "";
            const portalBase = company?.customer_portal_url || website;
            let customerPortal = portalBase;
            if (portalBase && !portalBase.includes("/customer")) {
                const baseUrl = portalBase.replace(/\/$/, "");
                customerPortal = `${baseUrl}/customer`;
            }

            // If customerId provided, get token and create direct login link
            let customerToken = null;
            if (customerId && customerPortal) {
                customerToken =
                    await this.getCustomerPortalToken(customerId);
                if (customerToken) {
                    const baseUrl = customerPortal.replace(/\/customer$/, "");
                    customerPortal = `${baseUrl}/customer/login/${customerToken}`;
                }
            }

            return {
                name: company?.name || "KITA SELALU TERKONEKSI",
                address: company?.address || "",
                phone: company?.phone || "",
                email: company?.email || "",
                website: website,
                customer_portal: customerPortal,
                customer_token: customerToken,
                support_phone: waLink,
                support_contacts: supportContacts,
            };
        } catch (error) {
            logger.error("Error getting company info:", error);
            return {
                name: "KITA SELALU TERKONEKSI",
                address: "",
                phone: "",
                email: "",
                website: "",
                customer_portal: "",
                support_phone: "",
                support_contacts: [],
            };
        }
    }

    // Helper: Get customer portal magic token
    async getCustomerPortalToken(customerId) {
        try {
            const CustomerTokenService = require("../services/customer-token-service");

            // Check if customer has existing valid token
            const result = await query(
                "SELECT portal_access_token, token_expires_at FROM customers WHERE id = $1",
                [customerId],
            );

            if (result.rows.length > 0 && result.rows[0].portal_access_token) {
                const tokenExpiresAt = result.rows[0].token_expires_at;
                // Check if token is not expired
                if (tokenExpiresAt && new Date(tokenExpiresAt) > new Date()) {
                    return result.rows[0].portal_access_token;
                }
                // Token expired, generate new one below
            }

            // Generate new token (either doesn't exist or expired)
            const tokenData = await CustomerTokenService.generateCustomerToken(
                customerId,
                "30d",
            );
            return tokenData.token;
        } catch (error) {
            logger.error("Error getting customer portal token:", error);
            return null;
        }
    }

    // Get formatted payment accounts list
    async getPaymentAccounts() {
        try {
            const settings = await getSetting("payment_settings");
            let accounts = [];

            // Bank accounts
            if (
                settings?.bank_accounts &&
                Array.isArray(settings.bank_accounts)
            ) {
                settings.bank_accounts
                    .filter((acc) => acc.isActive !== false)
                    .forEach((acc) => {
                        accounts.push(
                            `${acc.bankName}: ${acc.accountNumber} (${acc.accountName})`,
                        );
                    });
            }

            // E-wallets
            if (settings?.ewallets && Array.isArray(settings.ewallets)) {
                const providerLabels = {
                    gopay: "GoPay",
                    GoPay: "GoPay",
                    ovo: "OVO",
                    OVO: "OVO",
                    dana: "DANA",
                    DANA: "DANA",
                    shopeepay: "ShopeePay",
                    ShopeePay: "ShopeePay",
                    linkaja: "LinkAja",
                    LinkAja: "LinkAja",
                    QRIS: "QRIS",
                    qris: "QRIS",
                };

                settings.ewallets
                    .filter((wallet) => wallet.isActive !== false)
                    .forEach((wallet) => {
                        const label =
                            providerLabels[wallet.provider] ||
                            wallet.provider ||
                            "E-Wallet";
                        accounts.push(
                            `${label}: ${wallet.phoneNumber} (${wallet.accountName})`,
                        );
                    });
            }

            if (accounts.length > 0) {
                return `*REKENING PEMBAYARAN* - ${accounts.join(" | ")}`;
            }

            return "";
        } catch (error) {
            logger.error("Error getting payment accounts:", error);
            return "";
        }
    }

    // Get template from database by template_id
    async getTemplateFromDatabase(templateId) {
        try {
            const result = await query(
                `
                SELECT template_id, name, content, variables, enabled,
                       meta_status, meta_template_id, meta_name, meta_components
                FROM whatsapp_templates
                WHERE template_id = $1 AND enabled = true
                LIMIT 1
            `,
                [templateId],
            );

            if (result.rows.length === 0) {
                logger.warn(`Template not found or disabled: ${templateId}`);
                return null;
            }

            return result.rows[0];
        } catch (error) {
            logger.error(`Error getting template ${templateId}:`, error);
            return null;
        }
    }

    /**
     * Get service data for a customer (active_date, billing_type, siklus)
     * Used by notification functions to populate activeDate/billingType params
     */
    async getServiceForCustomer(customerId, serviceNumber) {
        try {
            let queryStr, params;
            if (serviceNumber) {
                queryStr = `SELECT active_date, billing_type, siklus, service_number, isolir_date
                            FROM services WHERE service_number = $1 LIMIT 1`;
                params = [serviceNumber];
            } else {
                queryStr = `SELECT active_date, billing_type, siklus, service_number, isolir_date
                            FROM services WHERE customer_id = $1
                            ORDER BY created_at DESC LIMIT 1`;
                params = [customerId];
            }
            const result = await query(queryStr, params);
            return result.rows[0] || null;
        } catch (error) {
            logger.error(
                `Error getting service for customer ${customerId}:`,
                error,
            );
            return null;
        }
    }

    /**
     * Build Meta template parameters from resolved message data.
     * Converts named variables to indexed array matching template.variables order.
     * Example: {customerName: "ASE", amount: "150.000"} + ["customerName","amount"] → ["ASE", "150.000"]
     *
     * @param {object} template - DB template row (must have .variables array)
     * @param {object} messageData - Resolved key-value data from resolveMessageData()
     * @returns {array} Ordered parameter values for Meta template body component
     */
    buildMetaParamsFromData(template, messageData) {
        const vars = template.variables || [];
        return vars.map((varName) => {
            const val = messageData[varName];
            const str = val !== undefined && val !== null ? String(val) : "";
            return str.replace(/[\r\n]+/g, " ");
        });
    }

    /**
     * Sync Meta template status from Omnichat to local database.
     * Called by cron job every 30 minutes to auto-update approval status.
     */
    async syncMetaTemplateStatus() {
        try {
            // Ensure Omnichat client is configured (settings may come from DB, not env)
            if (!kilusiOmnichat.initialized || !kilusiOmnichat.apiKey) {
                await kilusiOmnichat.initialize();
            }
            if (!kilusiOmnichat.apiKey) {
                logger.warn(
                    "[TemplateSync] No Omnichat API key configured, skipping sync",
                );
                return { success: false, error: "No API key configured" };
            }
            logger.info(
                "[TemplateSync] Fetching template status from Omnichat...",
            );
            const result = await kilusiOmnichat.getWhatsAppTemplates();

            // Handle various response formats from /integration/templates
            let templates = result?.data?.templates || result?.templates;
            if (!templates || !Array.isArray(templates)) {
                templates =
                    result?.data?.data?.data || result?.data?.data || [];
            }
            if (
                !templates ||
                !Array.isArray(templates) ||
                templates.length === 0
            ) {
                logger.warn(
                    "[TemplateSync] No templates returned from Omnichat",
                );
                return { success: false, error: "No templates returned" };
            }

            let updated = 0;
            for (const metaT of templates) {
                let metaStatus = (metaT.status || "").toLowerCase();
                // Normalize Meta status to our DB constraint values
                if (metaStatus === "pending") metaStatus = "pending_approval";
                const metaName = (metaT.name || "").toLowerCase();

                if (!metaName) continue;

                // Match by meta_name first (the separate Meta name field), then by template_id (lowercase)
                const matchResult = await query(
                    `UPDATE whatsapp_templates
                     SET meta_status = $1,
                         meta_components = $2::jsonb,
                         meta_template_id = $3,
                         updated_at = NOW()
                     WHERE LOWER(COALESCE(meta_name, template_id)) = $4
                     RETURNING template_id, meta_name`,
                    [
                        metaStatus,
                        JSON.stringify(metaT.components || null),
                        metaT.id || null,
                        metaName,
                    ],
                );

                if (matchResult.rowCount > 0) {
                    const row = matchResult.rows[0];
                    logger.info(
                        `[TemplateSync] ✅ ${row.template_id} (meta: ${row.meta_name || "-"}) → ${metaStatus}`,
                    );
                    updated++;
                }
            }

            logger.info(
                `[TemplateSync] Done. Updated ${updated}/${templates.length} templates.`,
            );
            return { success: true, updated, total: templates.length };
        } catch (error) {
            logger.error("[TemplateSync] Error syncing Meta templates:", error);
            return { success: false, error: error.message };
        }
    }

    // Send notification via Omnichat (Primary Provider)
    // Uses Meta approved template if available, falls back to local sendMessage only if allowed.
    async sendNotificationOmnichat(phoneNumber, message, options = {}) {
        try {
            const formattedPhone = this.formatPhoneNumber(phoneNumber);
            kilusiOmnichat.initialize();

            // Try Meta template mode if notification_type is provided
            if (options.notification_type && options.meta_data) {
                const template = await this.getTemplateFromDatabase(
                    options.notification_type,
                );
                if (
                    template &&
                    template.meta_template_id
                ) {
                    const bodyParams = this.buildMetaParamsFromData(
                        template,
                        options.meta_data,
                    );

                    // Build components: body + optional button params from meta_components
                    const components = [
                        {
                            type: "body",
                            parameters: bodyParams.map((p) => ({
                                type: "text",
                                text: p,
                            })),
                        },
                    ];

                    // Add button parameters if template has BUTTONS in meta_components
                    if (template.meta_components) {
                        try {
                            const parsed = typeof template.meta_components === "string"
                                ? JSON.parse(template.meta_components)
                                : template.meta_components;
                            const buttonsComp = Array.isArray(parsed)
                                ? parsed.find((c) => c.type === "BUTTONS")
                                : null;
                            if (buttonsComp && Array.isArray(buttonsComp.buttons)) {
                                for (let i = 0; i < buttonsComp.buttons.length; i++) {
                                    const btn = buttonsComp.buttons[i];
                                    if (btn.type !== "URL") continue;
                                    let paramValue = "";
                                    const btnText = (btn.text || "").toLowerCase();
                                    if (btnText.includes("bayar") || btnText.includes("pay")) {
                                        paramValue = options.meta_data?.invoiceNumber ||
                                            options.meta_data?.invoice_number || "";
                                    } else {
                                        paramValue = options.meta_data?.customerToken ||
                                            options.meta_data?.token || "";
                                        if (!paramValue && options.customer_id) {
                                            paramValue = await this.getCustomerPortalToken(options.customer_id) || "";
                                        }
                                    }
                                    components.push({
                                        type: "button",
                                        sub_type: "url",
                                        index: i,
                                        parameters: [{ type: "text", text: paramValue }],
                                    });
                                }
                            }
                        } catch (e) {
                            logger.warn("[Omnichat] Failed to parse meta_components for buttons:", e.message);
                        }
                    }

                    const result = await kilusiOmnichat.sendTemplateMessage(
                        formattedPhone,
                        {
                            template_id: template.meta_template_id,
                            template_name:
                                template.meta_name || template.template_id,
                            language: template.meta_language || "id",
                            notification_type: options.notification_type,
                            preview_text: message,
                            components,
                        },
                    );
                    logger.info(
                        `[Omnichat] Meta template sent to ${phoneNumber} (${template.template_id})`,
                    );
                    return {
                        success: true,
                        provider: "omnichat",
                        mode: "meta_template",
                        result,
                    };
                }
                // Template not approved → fail (do NOT fallback to local sendMessage)
                logger.warn(
                    `[Omnichat] Template ${options.notification_type} not approved or missing meta_template_id, refusing to send via local mode`,
                );
                throw new Error(
                    `Template ${options.notification_type} is not approved for Meta sending`,
                );
            }

            // No meta_data provided — fallback to local mode (legacy behavior)
            logger.info(`[Omnichat] Sending local message to ${phoneNumber}`);
            const result = await kilusiOmnichat.sendMessage(
                formattedPhone,
                message,
                options,
            );
            logger.info(`[Omnichat] Local message sent to ${phoneNumber}`);
            return {
                success: true,
                provider: "omnichat",
                mode: "local",
                result,
            };
        } catch (error) {
            logger.error(
                `[Omnichat] Failed to send notification to ${phoneNumber}:`,
                error.message,
            );
            throw error;
        }
    }

    // Send notification via Baileys (Fallback Provider)
    async sendNotificationBaileys(phoneNumber, message, options = {}) {
        try {
            if (!this.sock) {
                logger.error("[Baileys] WhatsApp sock not initialized");
                return {
                    success: false,
                    error: "WhatsApp not connected",
                    provider: "baileys",
                };
            }

            const formattedNumber = this.formatPhoneNumber(phoneNumber);
            const jid = `${formattedNumber}@s.whatsapp.net`;

            // Random Delay Implementation to prevent ban
            const minDelay = getSetting("baileys_delay_min", 100);
            const maxDelay = getSetting("baileys_delay_max", 600);
            const randomDelay = Math.floor(
                Math.random() * (maxDelay - minDelay + 1) + minDelay,
            );

            logger.info(
                `[Baileys] Anti-ban: Sleeping for ${randomDelay} seconds before sending to ${phoneNumber}...`,
            );
            await this.delay(randomDelay * 1000);

            // Use template body as-is (no hardcoded header/footer)
            const fullMessage = message;

            // If imagePath provided and exists, try to send as image with caption
            if (options.imagePath) {
                try {
                    const imagePath = options.imagePath;
                    logger.info(
                        `📸 [Baileys] Trying to send with image: ${imagePath}`,
                    );

                    if (fs.existsSync(imagePath)) {
                        await this.sock.sendMessage(jid, {
                            image: { url: imagePath },
                            caption: fullMessage,
                        });
                        logger.info(
                            `✅ [Baileys] Image notification sent to ${phoneNumber} with image`,
                        );

                        await messageLogger.logMessage({
                            phone_number: phoneNumber,
                            customer_id: options.customer_id,
                            customer_name: options.customer_name,
                            notification_type: options.notification_type || "general",
                            message_content: fullMessage,
                            message_type: "image",
                            status: "sent",
                            sent_via: "baileys",
                            created_at: new Date(),
                        }).catch(e => logger.warn('[Baileys] Log message failed:', e.message));

                        this.incrementDailyMessageCount();
                        return {
                            success: true,
                            provider: "baileys",
                            withImage: true,
                        };
                    } else {
                        logger.warn(
                            `⚠️ [Baileys] Image not found at path: ${imagePath}, falling back to text message`,
                        );
                    }
                } catch (imgErr) {
                    logger.error(
                        `❌ [Baileys] Failed sending image to ${phoneNumber}, falling back to text:`,
                        imgErr,
                    );
                }
            }

            // Send as text message (fallback or when no image specified)
            await this.sock.sendMessage(jid, { text: fullMessage }, options);

            logger.info(
                `✅ [Baileys] Text notification sent to ${phoneNumber}`,
            );

            await messageLogger.logMessage({
                phone_number: phoneNumber,
                customer_id: options.customer_id,
                customer_name: options.customer_name,
                notification_type: options.notification_type || "general",
                message_content: fullMessage,
                message_type: "text",
                status: "sent",
                sent_via: "baileys",
                created_at: new Date(),
            }).catch(e => logger.warn('[Baileys] Log message failed:', e.message));

            this.incrementDailyMessageCount();
            return { success: true, provider: "baileys", withImage: false };
        } catch (error) {
            logger.error(
                `[Baileys] Error sending notification to ${phoneNumber}:`,
                error.message,
            );
            return {
                success: false,
                error: error.message,
                provider: "baileys",
            };
        }
    }

    // Send notification with provider routing
    //   global:     options.provider determines primary, second = failover
    //   off:        skip with log
    //   omnichat:   Omnichat only (no failover)
    //   baileys:    Baileys only (no failover)
    //   dual + options.provider='baileys':  Baileys primary, Omnichat failover
    //   dual + lainnya:                     Omnichat primary, Baileys failover
    async sendNotification(phoneNumber, message, options = {}) {
        const globalProvider = this.getProvider();

        // OFF: always log and skip
        if (globalProvider === "off") {
            logger.info(
                `[WhatsApp] Notifications DISABLED (off). Skipping ${phoneNumber}`,
            );
            try {
                await messageLogger.logMessage({
                    phone_number: phoneNumber,
                    customer_id: options.customer_id,
                    customer_name: options.customer_name,
                    notification_type: options.notification_type || "general",
                    message_content: message,
                    message_type: "text",
                    status: "skipped",
                    error_message: "WhatsApp provider is OFF",
                    sent_via: "api",
                    created_at: new Date(),
                });
            } catch (logErr) {
                logger.warn(
                    "[WhatsApp] Failed to log skipped message:",
                    logErr.message,
                );
            }
            return {
                success: true,
                skipped: true,
                reason: "WhatsApp provider is disabled",
            };
        }

        // Build provider priority list
        let providers = [];
        if (globalProvider === "omnichat") {
            providers = ["omnichat"];
        } else if (globalProvider === "baileys") {
            providers = ["baileys"];
        } else if (globalProvider === "dual") {
            if (options.provider === "baileys") {
                providers = ["baileys", "omnichat"];
            } else {
                providers = ["omnichat", "baileys"];
            }
        } else {
            return { success: false, error: `Unknown global provider: ${globalProvider}`, provider: globalProvider };
        }

        const baileysReady = !!this.sock;

        logger.info(
            `[Route] Sending to ${phoneNumber} | global: ${globalProvider} | options.provider: ${options.provider || "-"} | type: ${options.notification_type || "-"}`,
        );

        for (const p of providers) {
            if (p === "baileys" && !baileysReady) {
                logger.warn(`[Route] Baileys not available, skipping...`);
                continue;
            }

            try {
                let result;
                if (p === "omnichat") {
                    result = await this.sendNotificationOmnichat(phoneNumber, message, options);
                } else {
                    result = await this.sendNotificationBaileys(phoneNumber, message, options);
                }
                if (result && result.success) {
                    if (providers.length > 1 && p === providers[1]) {
                        logger.info(`[Route] ${p} fallback success for ${phoneNumber}`);
                        return { ...result, fallback: true, originalError: null };
                    }
                    return result;
                }
                logger.warn(`[Route] ${p} returned failure for ${phoneNumber}: ${result?.error || "unknown"}`);
            } catch (err) {
                logger.warn(`[Route] ${p} error for ${phoneNumber}: ${err.message}`);
                await messageLogger.logFailedMessage(phoneNumber, err.message, {
                    customer_id: options.customer_id,
                    customer_name: options.customer_name,
                    notification_type: options.notification_type || "general",
                    message_content: message,
                    sent_via: p,
                }).catch(() => {});
            }
        }

        return { success: false, error: "All providers failed", provider: "none" };
    }

    // Legacy notification method (deprecated - use sendNotification instead)
    async sendNotificationLegacy(phoneNumber, message, options = {}) {
        try {
            if (!this.sock) {
                logger.error("WhatsApp sock not initialized");
                return { success: false, error: "WhatsApp not connected" };
            }

            // Check rate limiting
            const settings = this.getRateLimitSettings();
            if (settings.enabled && !this.checkDailyMessageLimit()) {
                logger.warn(
                    `Daily message limit reached (${settings.dailyMessageLimit}), skipping notification to ${phoneNumber}`,
                );
                return { success: false, error: "Daily message limit reached" };
            }

            const formattedNumber = this.formatPhoneNumber(phoneNumber);
            const jid = `${formattedNumber}@s.whatsapp.net`;

            // Use template body as-is (no hardcoded header/footer)
            const fullMessage = message;

            // If imagePath provided and exists, try to send as image with caption
            if (options.imagePath) {
                try {
                    const imagePath = options.imagePath;
                    logger.info(
                        `📸 Mencoba mengirim dengan gambar: ${imagePath}`,
                    );

                    if (fs.existsSync(imagePath)) {
                        await this.sock.sendMessage(jid, {
                            image: { url: imagePath },
                            caption: fullMessage,
                        });
                        logger.info(
                            `✅ WhatsApp image notification sent to ${phoneNumber} with image`,
                        );

                        // Increment daily count
                        this.incrementDailyMessageCount();
                        return { success: true, withImage: true };
                    } else {
                        logger.warn(
                            `⚠️ Image not found at path: ${imagePath}, falling back to text message`,
                        );
                    }
                } catch (imgErr) {
                    logger.error(
                        `❌ Failed sending image to ${phoneNumber}, falling back to text:`,
                        imgErr,
                    );
                }
            }

            // Send as text message (fallback or when no image specified)
            await this.sock.sendMessage(jid, { text: fullMessage }, options);

            logger.info(`✅ WhatsApp text notification sent to ${phoneNumber}`);

            // Increment daily count
            this.incrementDailyMessageCount();
            return { success: true, withImage: false };
        } catch (error) {
            logger.error(
                `Error sending WhatsApp notification to ${phoneNumber}:`,
                error,
            );
            return { success: false, error: error.message };
        }
    }

    // Send bulk notifications with rate limiting
    async sendBulkNotifications(notifications) {
        try {
            const settings = this.getRateLimitSettings();

            if (!settings.enabled) {
                logger.info(
                    "Rate limiting disabled, sending all notifications immediately",
                );
                return await this.sendAllNotifications(notifications);
            }

            logger.info(
                `Sending ${notifications.length} notifications with rate limiting enabled`,
            );
            logger.info(
                `Settings: ${settings.maxMessagesPerBatch} per batch, ${settings.delayBetweenBatches}s between batches, ${settings.delayBetweenMessages}s between messages`,
            );

            const results = {
                success: 0,
                failed: 0,
                skipped: 0,
                errors: [],
            };

            // Process notifications in batches
            for (
                let i = 0;
                i < notifications.length;
                i += settings.maxMessagesPerBatch
            ) {
                const batch = notifications.slice(
                    i,
                    i + settings.maxMessagesPerBatch,
                );
                logger.info(
                    `Processing batch ${Math.floor(i / settings.maxMessagesPerBatch) + 1}/${Math.ceil(notifications.length / settings.maxMessagesPerBatch)} (${batch.length} messages)`,
                );

                // Check daily limit before processing batch
                if (!this.checkDailyMessageLimit()) {
                    logger.warn(
                        `Daily message limit reached, skipping remaining ${notifications.length - i} notifications`,
                    );
                    results.skipped += notifications.length - i;
                    break;
                }

                // Process each notification in the batch
                for (let j = 0; j < batch.length; j++) {
                    const notification = batch[j];

                    // Check daily limit for each message
                    if (!this.checkDailyMessageLimit()) {
                        logger.warn(
                            `Daily message limit reached, skipping remaining ${batch.length - j} messages in current batch`,
                        );
                        results.skipped += batch.length - j;
                        break;
                    }

                    try {
                        const result = await this.sendNotificationWithRetry(
                            notification.phoneNumber,
                            notification.message,
                            notification.options,
                        );

                        if (result.success) {
                            results.success++;
                        } else {
                            results.failed++;
                            results.errors.push(
                                `${notification.phoneNumber}: ${result.error}`,
                            );
                        }
                    } catch (error) {
                        results.failed++;
                        results.errors.push(
                            `${notification.phoneNumber}: ${error.message}`,
                        );
                        logger.error(
                            `Error sending notification to ${notification.phoneNumber}:`,
                            error,
                        );
                    }

                    // Add delay between messages within batch (skip for Baileys, it has its own delay)
                    if (
                        j < batch.length - 1 &&
                        settings.delayBetweenMessages > 0 &&
                        !(notification.options && notification.options.provider === "baileys")
                    ) {
                        await this.delay(settings.delayBetweenMessages * 1000);
                    }
                }

                // Add delay between batches
                if (
                    i + settings.maxMessagesPerBatch < notifications.length &&
                    settings.delayBetweenBatches > 0
                ) {
                    logger.info(
                        `Waiting ${settings.delayBetweenBatches} seconds before next batch...`,
                    );
                    await this.delay(settings.delayBetweenBatches * 1000);
                }
            }

            logger.info(
                `Bulk notification completed: ${results.success} success, ${results.failed} failed, ${results.skipped} skipped`,
            );
            return results;
        } catch (error) {
            logger.error("Error in sendBulkNotifications:", error);
            return {
                success: 0,
                failed: notifications.length,
                skipped: 0,
                errors: [`Bulk send error: ${error.message}`],
            };
        }
    }

    // Send message to configured WhatsApp groups (no template replacements here)
    async sendToConfiguredGroups(message) {
        try {
            const enabled = getSetting("whatsapp_groups.enabled", true);
            if (!enabled) {
                return { success: true, sent: 0, failed: 0, skipped: 0 };
            }

            let ids = getSetting("whatsapp_groups.ids", []);
            if (!Array.isArray(ids)) {
                // collect numeric keys for compatibility
                const asObj = getSetting("whatsapp_groups", {});
                ids = [];
                Object.keys(asObj).forEach((k) => {
                    if (k.match(/^ids\.\d+$/)) {
                        ids.push(asObj[k]);
                    }
                });
            }

            if (!this.sock) {
                logger.error("WhatsApp sock not initialized");
                return {
                    success: false,
                    sent: 0,
                    failed: ids.length,
                    skipped: 0,
                    error: "WhatsApp not connected",
                };
            }

            let sent = 0;
            let failed = 0;

            const companyHeader = getSetting(
                "company_header",
                "📱 KILUSI BILL 📱\n\n",
            );
            const footerSeparator =
                "\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n";
            const footerInfo =
                footerSeparator +
                getSetting("footer_info", "Powered by Alijaya Digital Network");
            const fullMessage = `${companyHeader}${message}${footerInfo}`;

            for (const gid of ids) {
                try {
                    await this.sock.sendMessage(gid, { text: fullMessage });
                    sent++;
                    // small delay between group messages to avoid rate limit
                    await this.delay(1000);
                } catch (e) {
                    failed++;
                    logger.error(`Failed sending to group ${gid}:`, e);
                }
            }

            return { success: true, sent, failed, skipped: 0 };
        } catch (error) {
            logger.error("Error sending to configured groups:", error);
            return {
                success: false,
                sent: 0,
                failed: 0,
                skipped: 0,
                error: error.message,
            };
        }
    }

    // Send notification with retry logic
    async sendNotificationWithRetry(
        phoneNumber,
        message,
        options = {},
        retryCount = 0,
    ) {
        const settings = this.getRateLimitSettings();
        const maxRetries = settings.maxRetries;

        try {
            const result = await this.sendNotification(
                phoneNumber,
                message,
                options,
            );

            if (result.success) {
                return result;
            }

            // Retry if failed and retry count not exceeded
            if (retryCount < maxRetries) {
                logger.warn(
                    `Retry ${retryCount + 1}/${maxRetries} for ${phoneNumber}: ${result.error}`,
                );
                await this.delay(2000 * (retryCount + 1)); // Exponential backoff
                return await this.sendNotificationWithRetry(
                    phoneNumber,
                    message,
                    options,
                    retryCount + 1,
                );
            }

            return result;
        } catch (error) {
            if (retryCount < maxRetries) {
                logger.warn(
                    `Retry ${retryCount + 1}/${maxRetries} for ${phoneNumber}: ${error.message}`,
                );
                await this.delay(2000 * (retryCount + 1)); // Exponential backoff
                return await this.sendNotificationWithRetry(
                    phoneNumber,
                    message,
                    options,
                    retryCount + 1,
                );
            }

            return { success: false, error: error.message };
        }
    }

    // Send all notifications without rate limiting
    async sendAllNotifications(notifications) {
        const results = {
            success: 0,
            failed: 0,
            skipped: 0,
            errors: [],
        };

        for (const notification of notifications) {
            try {
                const result = await this.sendNotification(
                    notification.phoneNumber,
                    notification.message,
                    notification.options,
                );

                if (result.success) {
                    results.success++;
                } else {
                    results.failed++;
                    results.errors.push(
                        `${notification.phoneNumber}: ${result.error}`,
                    );
                }
            } catch (error) {
                results.failed++;
                results.errors.push(
                    `${notification.phoneNumber}: ${error.message}`,
                );
                logger.error(
                    `Error sending notification to ${notification.phoneNumber}:`,
                    error,
                );
            }
        }

        return results;
    }

    // Utility function for delays
    delay(ms) {
        return new Promise((resolve) => setTimeout(resolve, ms));
    }

    // Send invoice created notification
    async sendInvoiceCreatedNotification(customerId, invoiceId) {
        try {
            // Regenerate portal token for new billing cycle
            const CustomerTokenService = require("../services/customer-token-service");
            try {
                await CustomerTokenService.regenerateToken(customerId, "365d");
            } catch (tokenError) {
                logger.warn(
                    `Token regeneration failed for customer ${customerId}: ${tokenError.message}`,
                );
            }

            const customer = await billingManager.getCustomerById(customerId);
            const invoice = await billingManager.getInvoiceById(invoiceId);
            const packageData = await billingManager.getPackageById(
                invoice.package_id,
            );

            if (!customer || !invoice || !packageData) {
                logger.error("Missing data for invoice notification");
                return { success: false, error: "Missing data" };
            }

            const companyInfo = await this.getCompanyInfo(customerId);
            const paymentAccounts = await this.getPaymentAccounts();
            const service = await this.getServiceForCustomer(customerId, invoice.service_number);
            const template =
                await this.getTemplateFromDatabase("invoice_created");

            const templateContent = template
                ? template.content
                : this.templates.invoice_created.template;
            const context = {
                customer,
                invoice,
                package: packageData,
                service,
                company: { ...companyInfo, payment_accounts: paymentAccounts },
            };
            const messageData = this.resolveMessageData(
                templateContent,
                context,
            );
            const message = this.replaceTemplateVariables(
                templateContent,
                messageData,
            );

            // Attach invoice banner image if available
            const imagePath = this.getInvoiceImagePath();
            return await this.sendNotification(customer.phone, message, {
                imagePath,
                customer_id: customerId,
                customer_name: customer.name || customer.username,
                notification_type: "invoice_created",
                meta_data: messageData,
                billing_context: {
                    invoice_id: invoiceId,
                    invoice_number: invoice.invoice_number,
                },
            });
        } catch (error) {
            logger.error("Error sending invoice created notification:", error);
            return { success: false, error: error.message };
        }
    }

    // Send due date reminder
    async sendDueDateReminder(invoiceId) {
        try {
            const invoice = await billingManager.getInvoiceById(invoiceId);
            const customer = await billingManager.getCustomerById(
                invoice.customer_id,
            );
            const packageData = await billingManager.getPackageById(
                invoice.package_id,
            );

            if (!customer || !invoice || !packageData) {
                logger.error("Missing data for due date reminder");
                return { success: false, error: "Missing data" };
            }

            const dueDate = new Date(invoice.due_date);
            const today = new Date();
            const daysRemaining = Math.ceil(
                (dueDate - today) / (1000 * 60 * 60 * 24),
            );

            const companyInfo = await this.getCompanyInfo(invoice.customer_id);
            const paymentAccounts = await this.getPaymentAccounts();
            const service = await this.getServiceForCustomer(
                invoice.customer_id, invoice.service_number
            );
            const template =
                await this.getTemplateFromDatabase("due_date_reminder");

            const templateContent = template
                ? template.content
                : this.templates.due_date_reminder.template;
            const context = {
                customer,
                invoice,
                package: packageData,
                service,
                company: { ...companyInfo, payment_accounts: paymentAccounts },
                customData: {
                    daysRemaining: invoice?.due_date
                        ? Math.ceil(
                              (new Date(invoice.due_date) - new Date()) /
                                  86400000,
                          )
                        : 0,
                },
            };
            const messageData = this.resolveMessageData(
                templateContent,
                context,
            );
            const message = this.replaceTemplateVariables(
                templateContent,
                messageData,
            );

            // Attach same invoice banner image
            const imagePath = this.getInvoiceImagePath();
            return await this.sendNotification(customer.phone, message, {
                imagePath,
                customer_id: invoice.customer_id,
                customer_name: customer.name,
                notification_type: "due_date_reminder",
                meta_data: messageData,
                billing_context: {
                    invoice_id: invoiceId,
                    invoice_number: invoice.invoice_number,
                },
            });
        } catch (error) {
            logger.error("Error sending due date reminder:", error);
            return { success: false, error: error.message };
        }
    }

    // Send payment received notification
    async sendPaymentReceivedNotification(paymentId, customData = {}) {
        try {
            const payment = await billingManager.getPaymentById(paymentId);
            const invoice = await billingManager.getInvoiceById(
                payment.invoice_id,
            );
            const customer = await billingManager.getCustomerById(
                invoice.customer_id,
            );

            if (!payment || !invoice || !customer) {
                logger.error("Missing data for payment notification");
                return { success: false, error: "Missing data" };
            }

            const companyInfo = await this.getCompanyInfo(invoice.customer_id);
            const service = await this.getServiceForCustomer(
                invoice.customer_id, invoice.service_number
            );
            const packageData = await billingManager.getPackageById(
                invoice.package_id,
            );
            const template = await this.getTemplateFromDatabase(
                "payment_confirmation",
            );

            const templateContent = template
                ? template.content
                : this.templates.payment_received.template;
            const context = {
                customer,
                invoice,
                payment,
                package: packageData,
                service,
                company: companyInfo,
                customData,
            };
            const messageData = this.resolveMessageData(
                templateContent,
                context,
            );
            const message = this.replaceTemplateVariables(
                templateContent,
                messageData,
            );

            // Attach same invoice banner image
            const imagePath = this.getInvoiceImagePath();
            return await this.sendNotification(customer.phone, message, {
                imagePath,
                customer_id: invoice.customer_id,
                customer_name: customer.name,
                notification_type: "payment_confirmation",
                meta_data: messageData,
                billing_context: {
                    payment_id: paymentId,
                    invoice_id: invoice.id,
                },
            });
        } catch (error) {
            logger.error("Error sending payment received notification:", error);
            return { success: false, error: error.message };
        }
    }

    // Send service disruption notification
    async sendServiceDisruptionNotification(disruptionData) {
        try {
            // Check if template is enabled
            if (!this.isTemplateEnabled("service_disruption")) {
                logger.info(
                    "Service disruption notification is disabled, skipping...",
                );
                return {
                    success: true,
                    skipped: true,
                    reason: "Template disabled",
                };
            }

            const customers = await billingManager.getCustomers();
            const activeCustomers = customers.filter(
                (c) => c.status === "active" && c.phone,
            );

            const template = await this.getTemplateFromDatabase(
                "broadcast_notification",
            );
            const companyInfo = await this.getCompanyInfo();
            const contentText = disruptionData.content ||
                `Area: ${disruptionData.area || "Seluruh Area"}. Estimasi: ${disruptionData.estimatedTime || "Sedang dalam penanganan"}`;
            const customData = {
                title: disruptionData.title || "Gangguan Jaringan",
                content: contentText,
                info_tambahan: disruptionData.info_tambahan || "-",
                supportPhone: getSetting("support_phone", "+6281234567890"),
                customerPortal: companyInfo.portal_url || "-",
                companyName: companyInfo.name,
            };

            let message, messageData;
            if (template) {
                const context = { company: companyInfo, customData };
                messageData = this.resolveMessageData(
                    template.content,
                    context,
                );
                message = this.replaceTemplateVariables(
                    template.content,
                    messageData,
                );
            } else {
                message = `*${customData.title}*\n\n${customData.content}\n\nInfo: ${customData.info_tambahan}\nHubungi: ${customData.supportPhone}\n\n${customData.companyName}`;
            }

            // Prepare notifications for bulk sending
            const notifOptions = {
                notification_type: "service_disruption",
                provider: "baileys",
                ...(messageData ? { meta_data: messageData } : {}),
            };
            const notifications = activeCustomers.map((customer) => ({
                phoneNumber: customer.phone,
                message: message,
                options: notifOptions,
            }));

            // Use bulk notifications with rate limiting
            const result = await this.sendBulkNotifications(notifications);

            // Also send to configured groups
            const groupMessage = message;
            const groupRes = await this.sendToConfiguredGroups(groupMessage);

            return {
                success: true,
                sent: result.success + (groupRes.sent || 0),
                failed: result.failed + (groupRes.failed || 0),
                skipped: result.skipped + (groupRes.skipped || 0),
                total: activeCustomers.length,
                errors: result.errors,
                customer_sent: result.success,
                customer_failed: result.failed,
                group_sent: groupRes.sent || 0,
                group_failed: groupRes.failed || 0,
            };
        } catch (error) {
            logger.error(
                "Error sending service disruption notification:",
                error,
            );
            return { success: false, error: error.message };
        }
    }

    // Send service announcement
    async sendServiceAnnouncement(announcementData) {
        try {
            // Check if template is enabled
            if (!this.isTemplateEnabled("service_announcement")) {
                logger.info(
                    "Service announcement notification is disabled, skipping...",
                );
                return {
                    success: true,
                    skipped: true,
                    reason: "Template disabled",
                };
            }

            const customers = await billingManager.getCustomers();
            const activeCustomers = customers.filter(
                (c) => c.status === "active" && c.phone,
            );

            const template = await this.getTemplateFromDatabase(
                "broadcast_notification",
            );
            const companyInfo = await this.getCompanyInfo();
            const customData = {
                type: announcementData.type || "Pengumuman",
                title: announcementData.title || "Pengumuman Layanan",
                content:
                    announcementData.content || "Tidak ada konten pengumuman",
            };
            const templateContent = template
                ? template.content
                : this.templates.service_announcement.template;

            let message, messageData;
            if (template) {
                const context = { company: companyInfo, customData };
                messageData = this.resolveMessageData(
                    templateContent,
                    context,
                );
                message = this.replaceTemplateVariables(
                    templateContent,
                    messageData,
                );
            } else {
                message = this.replaceTemplateVariables(templateContent, {
                    announcement_content:
                        announcementData.content ||
                        "Tidak ada konten pengumuman",
                });
            }

            // Prepare notifications for bulk sending
            const notifOptions = {
                notification_type: "broadcast_notification",
                provider: "baileys",
                ...(messageData ? { meta_data: messageData } : {}),
            };
            const notifications = activeCustomers.map((customer) => ({
                phoneNumber: customer.phone,
                message: message,
                options: notifOptions,
            }));

            // Use bulk notifications with rate limiting
            const result = await this.sendBulkNotifications(notifications);

            // Also send to configured groups
            const groupMessage = message;
            const groupRes = await this.sendToConfiguredGroups(groupMessage);

            return {
                success: true,
                sent: result.success + (groupRes.sent || 0),
                failed: result.failed + (groupRes.failed || 0),
                skipped: result.skipped + (groupRes.skipped || 0),
                total: activeCustomers.length,
                errors: result.errors,
                customer_sent: result.success,
                customer_failed: result.failed,
                group_sent: groupRes.sent || 0,
                group_failed: groupRes.failed || 0,
            };
        } catch (error) {
            logger.error("Error sending service announcement:", error);
            return { success: false, error: error.message };
        }
    }

    // Get all templates
    // Load templates from file
    loadTemplates() {
        try {
            if (fs.existsSync(this.templatesFile)) {
                const data = fs.readFileSync(this.templatesFile, "utf8");
                console.log("✅ [WHATSAPP] Loaded templates from file");
                return JSON.parse(data);
            }
        } catch (error) {
            console.error("❌ [WHATSAPP] Error loading templates:", error);
        }
        return null;
    }

    // Save templates to file
    saveTemplates() {
        try {
            // Ensure data directory exists
            const dataDir = path.dirname(this.templatesFile);
            if (!fs.existsSync(dataDir)) {
                fs.mkdirSync(dataDir, { recursive: true });
            }

            fs.writeFileSync(
                this.templatesFile,
                JSON.stringify(this.templates, null, 2),
            );
            console.log("✅ [WHATSAPP] Templates saved to file");
            return true;
        } catch (error) {
            console.error("❌ [WHATSAPP] Error saving templates:", error);
            return false;
        }
    }

    getTemplates() {
        return this.templates;
    }

    // Update template
    updateTemplate(templateKey, newTemplate) {
        if (this.templates[templateKey]) {
            this.templates[templateKey] = newTemplate;
            this.saveTemplates(); // Save to file after update
            return true;
        }
        return false;
    }

    // Update multiple templates at once
    updateTemplates(templatesData) {
        let updated = 0;
        Object.keys(templatesData).forEach((key) => {
            if (this.templates[key]) {
                this.templates[key] = templatesData[key];
                updated++;
            }
        });

        if (updated > 0) {
            this.saveTemplates(); // Save once after all updates
        }

        return updated;
    }

    // Check if template is enabled
    isTemplateEnabled(templateKey) {
        return (
            this.templates[templateKey] &&
            this.templates[templateKey].enabled !== false
        );
    }

    // Test notification to specific number
    async testNotification(phoneNumber, templateKey, testData = {}) {
        try {
            if (!this.templates[templateKey]) {
                return { success: false, error: "Template not found" };
            }

            const message = this.replaceTemplateVariables(
                this.templates[templateKey].template,
                testData,
            );

            return await this.sendNotification(phoneNumber, message);
        } catch (error) {
            logger.error("Error sending test notification:", error);
            return { success: false, error: error.message };
        }
    }

    // Send service suspension notification
    async sendServiceSuspensionNotification(customer, reason) {
        try {
            if (!customer.phone) {
                logger.warn(
                    `Customer ${customer.username} has no phone number for suspension notification`,
                );
                return { success: false, error: "No phone number" };
            }

            const service = await this.getServiceForCustomer(
                customer.id || customer.customer_id, customer.service_number
            );
            const companyInfo = await this.getCompanyInfo(
                customer.id || customer.customer_id,
            );
            const paymentAccounts = await this.getPaymentAccounts();

            // Query latest unpaid invoice to populate invoice/package params
            const customerId = customer.id || customer.customer_id;
            const serviceNumber = customer.service_number;
            let invoice = null;
            let packageData = null;
            if (serviceNumber) {
                const invResult = await query(
                    "SELECT id, invoice_number, amount, due_date, package_id FROM invoices WHERE service_number = $1 AND status IN ('unpaid','sent','overdue') ORDER BY due_date ASC LIMIT 1",
                    [serviceNumber],
                );
                invoice = invResult.rows[0] || null;
                if (invoice && invoice.package_id) {
                    packageData = await billingManager.getPackageById(
                        invoice.package_id,
                    );
                }
            }

            const template =
                await this.getTemplateFromDatabase("service_suspension");

            const fallbackTpl = this.templates.service_suspension;
            const templateContent = template
                ? template.content
                : fallbackTpl
                  ? fallbackTpl.template
                  : "";
            const context = {
                customer,
                invoice,
                package: packageData,
                service,
                company: { ...companyInfo, payment_accounts: paymentAccounts },
                customData: { reason },
            };
            const messageData = this.resolveMessageData(
                templateContent,
                context,
            );
            const message = this.replaceTemplateVariables(
                templateContent,
                messageData,
            );

            const result = await this.sendNotification(
                customer.phone,
                message,
                {
                    customer_id: customer.id || customer.customer_id,
                    customer_name: customer.name || customer.username,
                    notification_type: "service_suspension",
                    meta_data: messageData,
                    billing_context: { reason },
                },
            );
            if (result.success) {
                logger.info(
                    `Service suspension notification sent to ${customer.name} (${customer.phone})`,
                );
            } else {
                logger.error(
                    `Failed to send service suspension notification to ${customer.name}:`,
                    result.error,
                );
            }

            return result;
        } catch (error) {
            logger.error(
                `Error sending service suspension notification to ${customer.name}:`,
                error,
            );
            return { success: false, error: error.message };
        }
    }

    // Send service restoration notification
    async sendServiceRestorationNotification(customer, reason) {
        try {
            if (!customer.phone) {
                logger.warn(
                    `Customer ${customer.username} has no phone number for restoration notification`,
                );
                return { success: false, error: "No phone number" };
            }

            const companyInfo = await this.getCompanyInfo(customer.id);
            const template = await this.getTemplateFromDatabase(
                "service_restoration",
            );

            const fallbackTpl = this.templates.service_restoration;
            const templateContent = template
                ? template.content
                : fallbackTpl
                  ? fallbackTpl.template
                  : "";
            const context = {
                customer,
                company: companyInfo,
                customData: { reason },
            };
            const messageData = this.resolveMessageData(
                templateContent,
                context,
            );
            const message = this.replaceTemplateVariables(
                templateContent,
                messageData,
            );

            const result = await this.sendNotification(
                customer.phone,
                message,
                {
                    customer_id: customer.id || customer.customer_id,
                    customer_name: customer.name || customer.username,
                    notification_type: "service_restoration",
                    meta_data: messageData,
                    billing_context: { reason },
                },
            );
            if (result.success) {
                logger.info(
                    `Service restoration notification sent to ${customer.name} (${customer.phone})`,
                );
            } else {
                logger.error(
                    `Failed to send service restoration notification to ${customer.name}:`,
                    result.error,
                );
            }

            return result;
        } catch (error) {
            logger.error(
                `Error sending service restoration notification to ${customer.name}:`,
                error,
            );
            return { success: false, error: error.message };
        }
    }

    // Send welcome message notification
    async sendWelcomeMessage(customer) {
        try {
            // Check if template is enabled
            if (!this.isTemplateEnabled("welcome_message")) {
                logger.info(
                    "Welcome message notification is disabled, skipping...",
                );
                return {
                    success: true,
                    skipped: true,
                    reason: "Template disabled",
                };
            }

            if (!customer.phone) {
                logger.warn(
                    `Customer ${customer.username} has no phone number for welcome message`,
                );
                return { success: false, error: "No phone number" };
            }

            const template =
                await this.getTemplateFromDatabase("welcome_message");
            const companyInfo = await this.getCompanyInfo(customer.id);
            const templateContent = template
                ? template.content
                : this.templates.welcome_message.template;

            const context = {
                customer,
                company: companyInfo,
                customData: {
                    customer_name: customer.name,
                    package_name: customer.package_name || "N/A",
                    package_speed: customer.package_speed || "N/A",
                    wifi_password: customer.wifi_password || "N/A",
                    support_phone: getSetting(
                        "support_phone",
                        "+6281234567890",
                    ),
                },
            };
            const messageData = this.resolveMessageData(
                templateContent,
                context,
            );
            const message = this.replaceTemplateVariables(
                templateContent,
                messageData,
            );

            const result = await this.sendNotification(
                customer.phone,
                message,
                {
                    customer_id: customer.id || customer.customer_id,
                    customer_name: customer.name || customer.username,
                    notification_type: "welcome_message",
                    meta_data: messageData,
                },
            );
            if (result.success) {
                logger.info(
                    `Welcome message sent to ${customer.name} (${customer.phone})`,
                );
            } else {
                logger.error(
                    `Failed to send welcome message to ${customer.name}:`,
                    result.error,
                );
            }

            return result;
        } catch (error) {
            logger.error(
                `Error sending welcome message to ${customer.name}:`,
                error,
            );
            return { success: false, error: error.message };
        }
    }

    // Send installation job assignment notification to technician
    async sendInstallationJobNotification(
        technician,
        installationJob,
        customer,
        packageData,
    ) {
        try {
            // Check if template is enabled
            if (!this.isTemplateEnabled("installation_job_assigned")) {
                logger.info(
                    "Installation job notification is disabled, skipping...",
                );
                return {
                    success: true,
                    skipped: true,
                    reason: "Template disabled",
                };
            }

            if (!technician.phone) {
                logger.warn(
                    `Technician ${technician.name} has no phone number for installation job notification`,
                );
                return { success: false, error: "No phone number" };
            }

            // Format installation date
            const installationDate = installationJob.installation_date
                ? new Date(
                      installationJob.installation_date,
                  ).toLocaleDateString("id-ID")
                : "TBD";

            const template = await this.getTemplateFromDatabase(
                "technician_new_installation",
            );
            const companyInfo = await this.getCompanyInfo();
            const templateContent = template
                ? template.content
                : this.templates.installation_job_assigned.template;

            const context = {
                customer,
                package: packageData,
                company: companyInfo,
                customData: {
                    technician_name: technician.name,
                    job_number: installationJob.job_number || "N/A",
                    customer_name:
                        customer.name || installationJob.customer_name || "N/A",
                    customer_phone:
                        customer.phone ||
                        installationJob.customer_phone ||
                        "N/A",
                    customer_address:
                        customer.address ||
                        installationJob.customer_address ||
                        "N/A",
                    package_name:
                        packageData.name ||
                        installationJob.package_name ||
                        "N/A",
                    package_price: packageData.price
                        ? new Intl.NumberFormat("id-ID").format(
                              packageData.price,
                          )
                        : installationJob.package_price
                          ? new Intl.NumberFormat("id-ID").format(
                                installationJob.package_price,
                            )
                          : "N/A",
                    installation_date: installationDate,
                    installation_time:
                        installationJob.installation_time || "TBD",
                    notes: installationJob.notes || "Tidak ada catatan",
                    equipment_needed:
                        installationJob.equipment_needed ||
                        "Standard equipment",
                    priority: installationJob.priority || "Normal",
                },
            };
            const messageData = this.resolveMessageData(
                templateContent,
                context,
            );
            const message = this.replaceTemplateVariables(
                templateContent,
                messageData,
            );

            const result = await this.sendNotification(
                technician.phone,
                message,
                {
                    notification_type: "technician_new_installation",
                    meta_data: messageData,
                },
            );
            if (result.success) {
                logger.info(
                    `Installation job notification sent to technician ${technician.name} (${technician.phone}) for job ${installationJob.job_number}`,
                );
            } else {
                logger.error(
                    `Failed to send installation job notification to technician ${technician.name}:`,
                    result.error,
                );
            }

            return result;
        } catch (error) {
            logger.error(
                `Error sending installation job notification to technician ${technician.name}:`,
                error,
            );
            return { success: false, error: error.message };
        }
    }

    // Send installation status update notification to technician
    async sendInstallationStatusUpdateNotification(
        technician,
        installationJob,
        customer,
        newStatus,
        notes,
    ) {
        try {
            // Check if template is enabled
            if (!this.isTemplateEnabled("installation_status_update")) {
                logger.info(
                    "Installation status update notification is disabled, skipping...",
                );
                return {
                    success: true,
                    skipped: true,
                    reason: "Template disabled",
                };
            }

            if (!technician.phone) {
                logger.warn(
                    `Technician ${technician.name} has no phone number for status update notification`,
                );
                return { success: false, error: "No phone number" };
            }

            // Format status text
            const statusText =
                {
                    scheduled: "Terjadwal",
                    assigned: "Ditugaskan",
                    in_progress: "Sedang Berlangsung",
                    completed: "Selesai",
                    cancelled: "Dibatalkan",
                }[newStatus] || newStatus;

            const template = await this.getTemplateFromDatabase(
                "installation_status_update",
            );
            const companyInfo = await this.getCompanyInfo();
            const templateContent = template
                ? template.content
                : this.templates.installation_status_update.template;

            const context = {
                customer,
                company: companyInfo,
                customData: {
                    technician_name: technician.name,
                    job_number: installationJob.job_number || "N/A",
                    customer_name:
                        customer.name || installationJob.customer_name || "N/A",
                    new_status: statusText,
                    update_time: new Date().toLocaleString("id-ID"),
                    notes: notes || "Tidak ada catatan",
                },
            };
            const messageData = this.resolveMessageData(
                templateContent,
                context,
            );
            const message = this.replaceTemplateVariables(
                templateContent,
                messageData,
            );

            const result = await this.sendNotification(
                technician.phone,
                message,
                {
                    notification_type: "installation_status_update",
                    meta_data: messageData,
                },
            );
            if (result.success) {
                logger.info(
                    `Installation status update notification sent to technician ${technician.name} for job ${installationJob.job_number}`,
                );
            } else {
                logger.error(
                    `Failed to send status update notification to technician ${technician.name}:`,
                    result.error,
                );
            }

            return result;
        } catch (error) {
            logger.error(
                `Error sending installation status update notification to technician ${technician.name}:`,
                error,
            );
            return { success: false, error: error.message };
        }
    }

    // Send installation completion notification to technician
    async sendInstallationCompletionNotification(
        technician,
        installationJob,
        customer,
        completionNotes,
    ) {
        try {
            // Check if template is enabled
            if (!this.isTemplateEnabled("installation_completed")) {
                logger.info(
                    "Installation completion notification is disabled, skipping...",
                );
                return {
                    success: true,
                    skipped: true,
                    reason: "Template disabled",
                };
            }

            if (!technician.phone) {
                logger.warn(
                    `Technician ${technician.name} has no phone number for completion notification`,
                );
                return { success: false, error: "No phone number" };
            }

            const template = await this.getTemplateFromDatabase(
                "installation_completed",
            );
            const companyInfo = await this.getCompanyInfo();
            const templateContent = template
                ? template.content
                : this.templates.installation_completed.template;

            const context = {
                customer,
                company: companyInfo,
                customData: {
                    technician_name: technician.name,
                    job_number: installationJob.job_number || "N/A",
                    customer_name:
                        customer.name || installationJob.customer_name || "N/A",
                    completion_time: new Date().toLocaleString("id-ID"),
                    completion_notes:
                        completionNotes || "Tidak ada catatan tambahan",
                },
            };
            const messageData = this.resolveMessageData(
                templateContent,
                context,
            );
            const message = this.replaceTemplateVariables(
                templateContent,
                messageData,
            );

            const result = await this.sendNotification(
                technician.phone,
                message,
                {
                    notification_type: "installation_completed",
                    meta_data: messageData,
                },
            );
            if (result.success) {
                logger.info(
                    `Installation completion notification sent to technician ${technician.name} for job ${installationJob.job_number}`,
                );
            } else {
                logger.error(
                    `Failed to send completion notification to technician ${technician.name}:`,
                    result.error,
                );
            }

            return result;
        } catch (error) {
            logger.error(
                `Error sending installation completion notification to technician ${technician.name}:`,
                error,
            );
            return { success: false, error: error.message };
        }
    }

    // ==================== NEW NOTIFICATION FUNCTIONS ====================

    // Send registration submitted notification (after customer fills form)
    async sendRegistrationSubmittedNotification(phoneNumber, data = {}) {
        try {
            // Get template from database or use fallback
            const template = await this.getTemplateFromDatabase(
                "registration_submitted",
            );
            if (!template) {
                logger.warn(
                    "registration_submitted template not found, using fallback",
                );
            }

            const companyInfo = await this.getCompanyInfo();

            let message,
                messageData = null;
            if (template) {
                const context = {
                    company: companyInfo,
                    customData: data,
                };
                messageData = this.resolveMessageData(
                    template.content,
                    context,
                );
                message = this.replaceTemplateVariables(
                    template.content,
                    messageData,
                );
            } else {
                message = `✅ *REGISTRASI BERHASIL*\n\nHalo ${data.customer_name},\n\nTerima kasih telah mendaftar layanan internet ${companyInfo.name}!\n\nTim kami akan menghubungi Anda segera.\n\n*${companyInfo.name}*`;
            }

            const result = await this.sendNotification(phoneNumber, message, {
                notification_type: "registration_submitted",
                ...(messageData ? { meta_data: messageData } : {}),
            });
            if (result.success) {
                logger.info(
                    `Registration submitted notification sent to ${phoneNumber}`,
                );
            }
            return result;
        } catch (error) {
            logger.error(
                `Error sending registration submitted notification:`,
                error,
            );
            return { success: false, error: error.message };
        }
    }

    // Send registration approved notification (with installation schedule)
    async sendRegistrationApprovedNotification(phoneNumber, data = {}) {
        try {
            const template = await this.getTemplateFromDatabase(
                "registration_approved",
            );
            const companyInfo = await this.getCompanyInfo();
            const paymentAccounts = await this.getPaymentAccounts();

            let message,
                messageData = null;
            if (template) {
                const context = {
                    company: {
                        ...companyInfo,
                        payment_accounts: paymentAccounts,
                    },
                    customData: data,
                };
                messageData = this.resolveMessageData(
                    template.content,
                    context,
                );
                message = this.replaceTemplateVariables(
                    template.content,
                    messageData,
                );
            } else {
                message = `🎉 *REGISTRASI DITERIMA*\n\nHalo ${data.customer_name},\n\nSelamat! Registrasi Anda telah disetujui.\n\nJadwal Instalasi:\n📅 ${data.installation_date}\n⏰ ${data.installation_time}\n👷 ${data.technician_name}\n\nPastikan alamat dapat diakses.\n\n*${companyInfo.name}*\n\n${paymentAccounts}`;
            }

            const result = await this.sendNotification(phoneNumber, message, {
                notification_type: "registration_approved",
                ...(messageData ? { meta_data: messageData } : {}),
            });
            if (result.success) {
                logger.info(
                    `Registration approved notification sent to ${phoneNumber}`,
                );
            }
            return result;
        } catch (error) {
            logger.error(
                `Error sending registration approved notification:`,
                error,
            );
            return { success: false, error: error.message };
        }
    }

    // Send package change notification (uses package_change Meta template)
    async sendPackageChangeNotification(phoneNumber, customer, oldPackage, newPackage) {
        try {
            const template = await this.getTemplateFromDatabase("package_change");
            const companyInfo = await this.getCompanyInfo(customer.id);
            const service = await this.getServiceForCustomer(customer.id, customer.service_number);
            const packageData = newPackage;

            const oldPrice = parseFloat(oldPackage.price || oldPackage.old_price) || 0;
            const newPrice = parseFloat(newPackage.price || newPackage.new_price) || 0;

            const customData = {
                customerName: customer.nama_customer || customer.name || "-",
                serviceNumber: customer.service_number || service?.service_number || "-",
                oldPackageName: oldPackage.name || oldPackage.old_package_name || "-",
                oldPackagePrice: oldPrice,
                newPackageName: newPackage.name || newPackage.new_package_name || "-",
                newPackagePrice: newPrice,
            };

            let message, messageData = null;
            if (template) {
                const context = {
                    customer,
                    invoice: null,
                    package: packageData,
                    service,
                    company: companyInfo,
                    customData,
                };
                messageData = this.resolveMessageData(template.content, context);
                message = this.replaceTemplateVariables(template.content, messageData);
            } else {
                message = `📦 *PERUBAHAN PAKET BERHASIL*\n\nHalo ${customData.customerName},\n\nPaket internet Anda telah diubah:\nDari: ${customData.oldPackageName} (Rp ${this.formatCurrency(oldPrice)}/bulan)\nKe: ${customData.newPackageName} (Rp ${this.formatCurrency(newPrice)}/bulan)\n\nSalam,\n${companyInfo.name}`;
            }

            const result = await this.sendNotification(phoneNumber, message, {
                customer_id: customer.id,
                customer_name: customData.customerName,
                notification_type: "package_change",
                ...(messageData ? { meta_data: messageData } : {}),
            });

            if (result.success) {
                logger.info(`📱 Package change notification sent to ${phoneNumber} (${oldPackage.name} → ${newPackage.name})`);
            }
            return result;
        } catch (error) {
            logger.error(`Error sending package change notification to ${phoneNumber}:`, error.message);
            return { success: false, error: error.message };
        }
    }

    // Send registration rejected notification
    async sendRegistrationRejectedNotification(phoneNumber, data = {}) {
        try {
            const template = await this.getTemplateFromDatabase(
                "registration_rejected",
            );
            const companyInfo = await this.getCompanyInfo();

            let message,
                messageData = null;
            if (template) {
                const context = {
                    company: companyInfo,
                    customData: data,
                };
                messageData = this.resolveMessageData(
                    template.content,
                    context,
                );
                message = this.replaceTemplateVariables(
                    template.content,
                    messageData,
                );
            } else {
                message = `❌ *REGISTRASI DITOLAK*

Halo {customer_name},

Mohon maaf, registrasi Anda tidak dapat dilanjutkan.

📝 *Alasan:*
{reason}

Jika ada pertanyaan, hubungi: {support_phone}

Terima kasih.

*{company_name}*`;
            }

            const result = await this.sendNotification(phoneNumber, message, {
                notification_type: "registration_rejected",
                ...(messageData ? { meta_data: messageData } : {}),
            });
            if (result.success) {
                logger.info(
                    `Registration rejected notification sent to ${phoneNumber}`,
                );
            }
            return result;
        } catch (error) {
            logger.error(
                `Error sending registration rejected notification:`,
                error,
            );
            return { success: false, error: error.message };
        }
    }

    // Send installation completed notification (for customer)
    async sendInstallationCompletedCustomerNotification(
        phoneNumber,
        data = {},
    ) {
        try {
            const template = await this.getTemplateFromDatabase(
                "installation_completed_customer",
            );
            const customerId = data.customer_id || null;
            const companyInfo = await this.getCompanyInfo(customerId);

            // Query full customer + service from DB so no params are empty
            const dbCustomer = customerId
                ? await billingManager.getCustomerById(customerId)
                : null;
            const service = customerId
                ? await this.getServiceForCustomer(customerId)
                : null;
            const packageData = dbCustomer?.package_id
                ? await billingManager.getPackageById(dbCustomer.package_id)
                : null;

            let message,
                messageData = null;
            if (template) {
                const context = {
                    customer: dbCustomer,
                    invoice: null,
                    package: packageData,
                    service,
                    company: companyInfo,
                    customData: data,
                };
                messageData = this.resolveMessageData(
                    template.content,
                    context,
                );
                message = this.replaceTemplateVariables(
                    template.content,
                    messageData,
                );
            } else {
                message = `🎊 *INSTALASI SELESAI*\n\nHalo ${data.customer_name},\n\nSelamat! Instalasi internet Anda telah selesai.\n\n📦 Paket: ${data.package_name} (${data.package_speed})\n🔑 Username: ${data.username}\n🔑 Password WiFi: ${data.wifi_password}\n\nAnda sudah dapat menikmati layanan.\n\nHubungi: ${companyInfo.support_phone}\n\n*${companyInfo.name}*`;
            }

            const result = await this.sendNotification(phoneNumber, message, {
                notification_type: "installation_completed_customer",
                ...(messageData ? { meta_data: messageData } : {}),
            });
            if (result.success) {
                logger.info(
                    `Installation completed notification sent to customer ${phoneNumber}`,
                );
            }
            return result;
        } catch (error) {
            logger.error(
                `Error sending installation completed notification:`,
                error,
            );
            return { success: false, error: error.message };
        }
    }

    // Send ticket created notification
    async sendTicketCreatedNotification(phoneNumber, data = {}) {
        try {
            const template =
                await this.getTemplateFromDatabase("ticket_created");
            const customerId = data.customer_id || null;
            const companyInfo = await this.getCompanyInfo(customerId);

            let message,
                messageData = null;
            if (template) {
                const context = {
                    company: companyInfo,
                    customData: data,
                };
                messageData = this.resolveMessageData(
                    template.content,
                    context,
                );
                message = this.replaceTemplateVariables(
                    template.content,
                    messageData,
                );
            } else {
                message = `🎫 *TIKET SUPPORT BARU*\n\nHalo ${data.customer_name},\n\nTiket Anda telah dibuat:\n📝 Nomor: ${data.ticket_number}\n📋 Subjek: ${data.subject}\n📂 Kategori: ${data.category}\n⚡ Prioritas: ${data.priority}\n\nTim kami akan segera memproses.\n\n*${companyInfo.name}*\n\nHubungi: ${companyInfo.support_phone}`;
            }

            const result = await this.sendNotification(phoneNumber, message, {
                notification_type: "ticket_created",
                ...(messageData ? { meta_data: messageData } : {}),
            });
            if (result.success) {
                logger.info(
                    `Ticket created notification sent to ${phoneNumber}`,
                );
            }
            return result;
        } catch (error) {
            logger.error(`Error sending ticket created notification:`, error);
            return { success: false, error: error.message };
        }
    }

    // Send ticket updated notification
    async sendTicketUpdatedNotification(phoneNumber, data = {}) {
        try {
            const template =
                await this.getTemplateFromDatabase("ticket_updated");
            const customerId = data.customer_id || null;
            const companyInfo = await this.getCompanyInfo(customerId);

            let message,
                messageData = null;
            if (template) {
                const context = {
                    company: companyInfo,
                    customData: data,
                };
                messageData = this.resolveMessageData(
                    template.content,
                    context,
                );
                message = this.replaceTemplateVariables(
                    template.content,
                    messageData,
                );
            } else {
                message = `🔄 *UPDATE TIKET*\n\nHalo ${data.customer_name},\n\nTiket Anda telah diperbarui:\n📝 Nomor: ${data.ticket_number}\n📊 Status Baru: ${data.new_status}\n\n${data.update_message}\n\nTerima kasih.\n\n*${companyInfo.name}*\n\nHubungi: ${companyInfo.support_phone}`;
            }

            const result = await this.sendNotification(phoneNumber, message, {
                notification_type: "ticket_updated",
                ...(messageData ? { meta_data: messageData } : {}),
            });
            if (result.success) {
                logger.info(
                    `Ticket updated notification sent to ${phoneNumber}`,
                );
            }
            return result;
        } catch (error) {
            logger.error(`Error sending ticket updated notification:`, error);
            return { success: false, error: error.message };
        }
    }

    // Update invoice_created to use company info and payment accounts
    async sendInvoiceCreatedNotificationWithDetails(customerId, invoiceId) {
        try {
            // Regenerate magic token for new billing cycle
            const CustomerTokenService = require("../services/customer-token-service");
            try {
                await CustomerTokenService.regenerateToken(customerId, "30d");
                logger.info(
                    `Magic token regenerated for customer ${customerId} on new invoice`,
                );
            } catch (tokenError) {
                logger.warn(
                    `Failed to regenerate magic token for customer ${customerId}: ${tokenError.message}`,
                );
                // Non-blocking - continue with notification even if token regeneration fails
            }

            const template =
                await this.getTemplateFromDatabase("invoice_created");
            const companyInfo = await this.getCompanyInfo(customerId); // Get fresh token in portal URL
            const paymentAccounts = await this.getPaymentAccounts();

            // Get customer and invoice data
            const customer = await billingManager.getCustomerById(customerId);
            const invoice = await billingManager.getInvoiceById(invoiceId);
            const packageData = await billingManager.getPackageById(
                invoice.package_id,
            );

            if (!customer || !invoice) {
                return {
                    success: false,
                    error: "Customer or Invoice not found",
                };
            }

            const service = await this.getServiceForCustomer(customerId, invoice?.service_number);

            const templateContent = template
                ? template.content
                : this.templates.invoice_created.template;
            const context = {
                customer,
                invoice,
                package: packageData,
                service,
                company: { ...companyInfo, payment_accounts: paymentAccounts },
            };
            const messageData = this.resolveMessageData(
                templateContent,
                context,
            );
            const message = this.replaceTemplateVariables(
                templateContent,
                messageData,
            );

            const result = await this.sendNotification(
                customer.phone,
                message,
                {
                    customer_id: customerId,
                    customer_name: customer.name || customer.username,
                    notification_type: "invoice_created",
                    meta_data: messageData,
                    billing_context: {
                        invoice_id: invoiceId,
                        invoice_number: invoice.invoice_number,
                    },
                },
            );
            if (result.success) {
                logger.info(
                    `Invoice notification sent to ${customer.name} (${customer.phone}) for invoice ${invoice.invoice_number}`,
                );
            }
            return result;
        } catch (error) {
            logger.error(`Error sending invoice notification:`, error);
            return { success: false, error: error.message };
        }
    }

    // ==================== ADMIN & TECHNICIAN NOTIFICATIONS ====================

    // Get admin phone numbers for notifications
    async getAdminPhoneNumbers() {
        try {
            const result = await query(`
                SELECT phone FROM users
                WHERE role IN ('administrator', 'superadmin')
                AND phone IS NOT NULL
                AND phone != ''
            `);
            return result.rows.map((row) => row.phone);
        } catch (error) {
            logger.error("Error getting admin phone numbers:", error);
            return [];
        }
    }

    // Get technician phone number by user ID
    async getTechnicianPhone(technicianId) {
        try {
            const result = await query(
                `
                SELECT phone FROM users
                WHERE id = $1 AND role = 'technician'
                AND phone IS NOT NULL AND phone != ''
            `,
                [technicianId],
            );
            return result.rows.length > 0 ? result.rows[0].phone : null;
        } catch (error) {
            logger.error("Error getting technician phone:", error);
            return null;
        }
    }

    async getTechnicianName(technicianId) {
        try {
            const result = await query(
                `SELECT name FROM users WHERE id = $1 AND role = 'technician'`,
                [technicianId],
            );
            return result.rows.length > 0 ? result.rows[0].name : null;
        } catch (error) {
            logger.error("Error getting technician name:", error);
            return null;
        }
    }

    // Send notification to all admins
    async sendToAdmins(message, options = {}) {
        try {
            const adminPhones = await this.getAdminPhoneNumbers();
            if (adminPhones.length === 0) {
                logger.warn("No admin phone numbers found for notification");
                return { success: false, error: "No admin phones found" };
            }

            const results = [];
            for (const phone of adminPhones) {
                const result = await this.sendNotification(
                    phone,
                    message,
                    options,
                );
                results.push({ phone, result });
            }

            const successCount = results.filter((r) => r.result.success).length;
            logger.info(
                `📱 Admin notification sent to ${successCount}/${adminPhones.length} admins`,
            );

            return {
                success: successCount > 0,
                sent: successCount,
                total: adminPhones.length,
                results,
            };
        } catch (error) {
            logger.error("Error sending admin notification:", error);
            return { success: false, error: error.message };
        }
    }

    // Notify admins about new ticket
    async notifyAdminsNewTicket(ticketData) {
        try {
            const companyInfo = await this.getCompanyInfo();
            const template = await this.getTemplateFromDatabase("ticket_created");

            let message, messageData;
            if (template) {
                const context = {
                    company: companyInfo,
                    customData: {
                        ticketNumber: ticketData.ticketNumber,
                        subject: ticketData.subject,
                        category: ticketData.category,
                    },
                };
                messageData = this.resolveMessageData(template.content, context);
                message = this.replaceTemplateVariables(template.content, messageData);
            } else {
                message = `🎫 *TIKET BARU*\n\n📝 *Nomor:* ${ticketData.ticketNumber}\n👤 *Customer:* ${ticketData.customerName}\n📋 *Subjek:* ${ticketData.subject}\n📂 *Kategori:* ${ticketData.category}\n\n${companyInfo.name}`;
            }

            return await this.sendToAdmins(message, {
                notification_type: "ticket_created",
                provider: "baileys",
                ...(messageData ? { meta_data: messageData } : {}),
            });
        } catch (error) {
            logger.error("Error notifying admins about new ticket:", error);
            return { success: false, error: error.message };
        }
    }

    // Notify admins about new registration
    async notifyAdminsNewRegistration(registrationData) {
        try {
            const companyInfo = await this.getCompanyInfo();
            const template = await this.getTemplateFromDatabase("admin_new_registration");

            let message, messageData;
            if (template) {
                const context = {
                    company: companyInfo,
                    customData: {
                        customerName: registrationData.customerName,
                        customerPhone: registrationData.customerPhone,
                        customerAddress: registrationData.address || "-",
                        packageName: registrationData.packageName || "-",
                        registrationDate: registrationData.registrationDate,
                        notes: registrationData.customerEmail ? `Email: ${registrationData.customerEmail}` : "-",
                    },
                };
                messageData = this.resolveMessageData(template.content, context);
                message = this.replaceTemplateVariables(template.content, messageData);
            } else {
                message = `📝 *REGISTRASI BARU*\n\n👤 *Nama:* ${registrationData.customerName}\n📱 *HP:* ${registrationData.customerPhone}\n📍 *Alamat:* ${registrationData.address || "-"}\n📅 *Tanggal:* ${registrationData.registrationDate}\n\n${companyInfo.name}`;
            }

            // Send to all admins
            const adminResult = await this.sendToAdmins(message, {
                notification_type: "admin_new_registration",
                provider: "baileys",
                ...(messageData ? { meta_data: messageData } : {}),
            });

            // Auto-detect mitra from address and forward notification to mitra's phone
            if (registrationData.address) {
                try {
                    const mitra = await this.detectMitraByAddress(registrationData.address);
                    if (mitra && mitra.phone) {
                        await this.sendNotification(mitra.phone, message, {
                            notification_type: "admin_new_registration",
                            provider: "baileys",
                            ...(messageData ? { meta_data: messageData } : {}),
                        });
                        logger.info(`[RegNotif] Sent new registration to mitra ${mitra.name} (${mitra.phone})`);
                    }
                } catch (mitraErr) {
                    logger.warn(`[Registrar] Mitra forward failed: ${mitraErr.message}`);
                }
            }

            return adminResult;
        } catch (error) {
            logger.error(
                "Error notifying admins about new registration:",
                error,
            );
            return { success: false, error: error.message };
        }
    }

    // Detect mitra by matching customer address against region names and mitra names
    async detectMitraByAddress(address) {
        try {
            const addr = String(address || "").toLowerCase();
            if (!addr) return null;

            // Alias keyword mapping from AGENTS.md
            let aliasKeyword = null;
            if (addr.includes("janaloka") || addr.includes("jagakarta")) aliasKeyword = "prima talaga sunda rt 67";
            else if (addr.includes("tatakang") || addr.includes("jagadita")) aliasKeyword = "prima talaga sunda rt 66";
            else if (addr.includes("jalatunda") || addr.includes("talaga raya")) aliasKeyword = "prima talaga sunda rt 68";
            else if (addr.includes("cibogo")) aliasKeyword = "cibogo";
            else if (addr.includes("kirana")) aliasKeyword = "kirana";
            else if (addr.includes("cilaja")) aliasKeyword = "bukit cilaja";
            else if (addr.includes("polandia") || addr.includes("pld")) aliasKeyword = "polandia";
            else if (addr.includes("poncol")) aliasKeyword = "poncol";

            const searchAddr = aliasKeyword || addr;

            const result = await query(`
                SELECT m.id, m.name as mitra_name, m.phone, r.name as region_name, r.district, r.regency, r.province
                FROM regions r
                JOIN mitra m ON m.id = r.mitra_id
                WHERE m.disabled_at IS NULL
                  AND m.phone IS NOT NULL AND m.phone != ''
            `);
            if (result.rows.length === 0) return null;

            // 1. Match region_name, mitra_name, or alias
            let matched = result.rows.find(r => {
                const regName = String(r.region_name || "").toLowerCase();
                const mitName = String(r.mitra_name || "").toLowerCase();
                return (regName && (searchAddr.includes(regName) || regName.includes(searchAddr)))
                    || (mitName && (searchAddr.includes(mitName) || mitName.includes(searchAddr)));
            });

            // 2. Token match fallback
            if (!matched) {
                const tokens = searchAddr.split(/[\s,.-]+/).filter(t => t.length >= 4);
                matched = result.rows.find(r => {
                    const regName = String(r.region_name || "").toLowerCase();
                    const mitName = String(r.mitra_name || "").toLowerCase();
                    return tokens.some(t => regName.includes(t) || mitName.includes(t));
                });
            }

            if (matched) {
                logger.info(`[RegNotif] Detected mitra ${matched.mitra_name} (${matched.phone}) for address "${address}"`);
                return { id: matched.id, name: matched.mitra_name, phone: matched.phone };
            }

            logger.warn(`[RegNotif] No mitra matched for address: "${address}"`);
            return null;
        } catch (error) {
            logger.warn(`Error detecting mitra by address: ${error.message}`);
            return null;
        }
    }

    // Notify technician about new installation task
    async notifyTechnicianNewTask(technicianId, taskData) {
        try {
            const phone = await this.getTechnicianPhone(technicianId);
            if (!phone) {
                logger.warn(
                    `No phone number found for technician ${technicianId}`,
                );
                return { success: false, error: "Technician phone not found" };
            }

            const companyInfo = await this.getCompanyInfo();
            const technicianName = await this.getTechnicianName(technicianId);
            const template = await this.getTemplateFromDatabase("technician_new_installation");

            let message, messageData;
            if (template) {
                const context = {
                    company: companyInfo,
                    customData: {
                        technicianName: technicianName || "Teknisi",
                        customerName: taskData.customerName,
                        customerPhone: taskData.customerPhone,
                        customerAddress: taskData.address || "-",
                        packageName: taskData.packageName,
                        packageSpeed: taskData.packageSpeed,
                        installationDate: taskData.scheduleDate || "-",
                        installationTime: taskData.scheduleTime || "-",
                        notes: `ID: ${taskData.installationId}`,
                    },
                };
                messageData = this.resolveMessageData(template.content, context);
                message = this.replaceTemplateVariables(template.content, messageData);
            } else {
                const scheduleInfo = taskData.scheduleDate
                    ? `\n📅 *Jadwal:* ${taskData.scheduleDate}` +
                      (taskData.scheduleTime
                          ? `\n⏰ *Jam:* ${taskData.scheduleTime}`
                          : "")
                    : "";
                message = `🔧 *TUGAS INSTALASI BARU*\n\n👤 *Customer:* ${taskData.customerName}\n📱 *HP:* ${taskData.customerPhone}\n📍 *Alamat:* ${taskData.address || "-"}${scheduleInfo}\n\n📦 *Paket:* ${taskData.packageName} (${taskData.packageSpeed})\n\n*${companyInfo.name}*`;
            }

            const result = await this.sendNotification(phone, message, {
                notification_type: "technician_new_installation",
                provider: "baileys",
                ...(messageData ? { meta_data: messageData } : {}),
            });
            if (result.success) {
                logger.info(
                    `📱 Technician notified about new task: ${taskData.installationId}`,
                );
            }
            return result;
        } catch (error) {
            logger.error("Error notifying technician about new task:", error);
            return { success: false, error: error.message };
        }
    }

    // Notify technician about ticket assignment
    async notifyTechnicianTicketAssignment(technicianId, ticketData) {
        try {
            const phone = await this.getTechnicianPhone(technicianId);
            if (!phone) {
                logger.warn(
                    `No phone number found for technician ${technicianId}`,
                );
                return { success: false, error: "Technician phone not found" };
            }

            const companyInfo = await this.getCompanyInfo();
            const technicianName = await this.getTechnicianName(technicianId);
            const template = await this.getTemplateFromDatabase("ticket_assigned");

            let message, messageData;
            if (template) {
                const context = {
                    company: companyInfo,
                    customData: {
                        technicianName: technicianName || "Teknisi",
                        ticketNumber: ticketData.ticketNumber,
                        customerName: ticketData.customerName,
                        customerPhone: ticketData.customerPhone,
                        customerAddress: ticketData.customerAddress || "-",
                        category: ticketData.category || "General",
                        description: ticketData.description || "-",
                    },
                };
                messageData = this.resolveMessageData(template.content, context);
                message = this.replaceTemplateVariables(template.content, messageData);
            } else {
                message = `🎫 *TICKET DITUGASKAN*\n\n👤 *Customer:* ${ticketData.customerName}\n📱 *HP:* ${ticketData.customerPhone}\n📋 *Subjek:* ${ticketData.subject}\n\n🎫 *ID Tiket:* ${ticketData.ticketNumber}\n\nSilakan login untuk menindaklanjuti.`;
            }

            const result = await this.sendNotification(phone, message, {
                notification_type: "ticket_assigned",
                provider: "baileys",
                ...(messageData ? { meta_data: messageData } : {}),
            });
            if (result.success) {
                logger.info(
                    `📱 Technician notified about ticket ${ticketData.ticketNumber}`,
                );
            }
            return result;
        } catch (error) {
            logger.error(
                "Error notifying technician about ticket assignment:",
                error,
            );
            return { success: false, error: error.message };
        }
    }

    /**
     * Send voucher delivered notification
     * Sends hotspot voucher credentials to customer after successful payment
     */
    async sendVoucherDeliveredNotification(phone, data) {
        try {
            const {
                customer_name = "Pelanggan",
                voucher_code,
                username,
                password,
                duration_hours,
                speed_limit,
            } = data;

            const message = `🎫 *VOUCHER HOTSPOT ANDA*

Halo ${customer_name},

Berikut voucher hotspot Anda:

🔑 *Kode Voucher:* ${voucher_code}
👤 *Username:* ${username}
🔒 *Password:* ${password}
⏱️ *Durasi:* ${duration_hours} jam
🚀 *Speed:* ${speed_limit || "As paket"}

*Cara pakai:*
1. Connect ke WiFi/Kabel "Kilusi-Hotspot"
2. Browser akan otomatis ke login page
3. Masukkan username & password di atas
4. Klik Login

Selamat menikmati internet!

Hubungi ${getSetting("support_phone", "0812-3456-7890")} jika ada kendala.

*${getSetting("company_name", "Kilusi ISP")}*`;

            const result = await this.sendNotification(phone, message);
            if (result.success) {
                logger.info(`📱 Voucher sent to ${phone}: ${voucher_code}`);
            }
            return result;
        } catch (error) {
            logger.error("Error sending voucher notification:", error);
            return { success: false, error: error.message };
        }
    }

    lastQR = null;
    qrCodeData = null;

    setSock(sock) {
        this.sock = sock;
        this.sock.ev.on("connection.update", (update) => {
            const { qr } = update;
            if (qr) {
                this.lastQR = qr;
                this.qrCodeData = qr;
            }
        });
    }

    async requestPairingCode(phoneNumber) {
        if (!this.sock) throw new Error("Socket not initialized");
        return await this.sock.requestPairingCode(phoneNumber);
    }
}

const whatsappNotificationManager = new WhatsAppNotificationManager();
module.exports = whatsappNotificationManager;
