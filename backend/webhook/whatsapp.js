const whatsappAPI = require('../services/whatsapp-cloud-api');

/**
 * Send billing notification to customer
 * @param {string} to - Phone number with country code
 * @param {Object} billingData - Billing information
 * @returns {Promise<Object>} Send result
 */
async function sendBillingNotification(to, billingData) {
  try {
    const { invoice_number, amount, due_date, customer_name, customer_id } = billingData;

    const message = `📄 *TAGIHAN INTERNET PT KILUSI*

Halo ${customer_name || 'Pelanggan'},

Berikut detail tagihan Anda:
🆔 ID Pelanggan: ${customer_id || 'N/A'}
📋 No. Invoice: ${invoice_number}
💰 Jumlah: Rp ${Number(amount).toLocaleString('id-ID')}
📅 Jatuh Tempo: ${new Date(due_date).toLocaleDateString('id-ID')}

Silakan melakukan pembayaran sebelum tanggal jatuh tempo untuk menghindari gangguan layanan.

Metode Pembayaran:
🏦 Transfer Bank
📱 E-Wallet (OVO, GoPay, Dana)
📷 QRIS

Terima kasih atas kepercayaan Anda! 🙏

Pt. Kilusi Digital Network
📞 (021) 1234-5678
🌐 www.kilusi.id`;

    const result = await whatsappAPI.sendTextMessage(to, message);

    return {
      success: true,
      message: 'Billing notification sent successfully',
      data: result
    };
  } catch (error) {
    console.error('Error sending billing notification:', error);
    return {
      success: false,
      message: 'Failed to send billing notification',
      error: error.message
    };
  }
}

/**
 * Send payment confirmation to customer
 * @param {string} to - Phone number with country code
 * @param {Object} paymentData - Payment information
 * @returns {Promise<Object>} Send result
 */
async function sendPaymentConfirmation(to, paymentData) {
  try {
    const { invoice_number, amount, payment_method, payment_date, customer_name, customer_id } = paymentData;

    const message = `✅ *KONFIRMASI PEMBAYARAN*

Halo ${customer_name || 'Pelanggan'},

Pembayaran Anda telah kami terima! 🎉

Detail Pembayaran:
🆔 ID Pelanggan: ${customer_id || 'N/A'}
📋 No. Invoice: ${invoice_number}
💰 Jumlah: Rp ${Number(amount).toLocaleString('id-ID')}
💳 Metode: ${payment_method}
📅 Tanggal: ${new Date(payment_date).toLocaleDateString('id-ID')}
📝 Status: LUNAS

Terima kasih atas pembayaran tepat waktu Anda!

Layanan internet Anda akan tetap aktif.
Jika ada pertanyaan, silakan hubungi kami.

Pt. Kilusi Digital Network
📞 (021) 1234-5678
🌐 www.kilusi.id`;

    const result = await whatsappAPI.sendTextMessage(to, message);

    return {
      success: true,
      message: 'Payment confirmation sent successfully',
      data: result
    };
  } catch (error) {
    console.error('Error sending payment confirmation:', error);
    return {
      success: false,
      message: 'Failed to send payment confirmation',
      error: error.message
    };
  }
}

/**
 * Send overdue payment reminder
 * @param {string} to - Phone number with country code
 * @param {Object} overdueData - Overdue payment information
 * @returns {Promise<Object>} Send result
 */
async function sendOverdueReminder(to, overdueData) {
  try {
    const { invoice_number, amount, days_overdue, customer_name, customer_id } = overdueData;

    const message = `⚠️ *PENGINGAT TELAT BAYAR*

Halo ${customer_name || 'Pelanggan'},

Kami ingin mengingatkan bahwa tagihan Anda terlambat:

🆔 ID Pelanggan: ${customer_id || 'N/A'}
📋 No. Invoice: ${invoice_number}
💰 Jumlah: Rp ${Number(amount).toLocaleString('id-ID')}
📅 Terlambat: ${days_overdue} hari

Segera lakukan pembayaran untuk menghindari:
🚫 Suspended layanan internet
📊 Denda keterlambatan

Hubungi kami jika ada kendala:
📞 (021) 1234-5678
📱 WhatsApp: 62819-XXXX-XXXX

Pt. Kilusi Digital Network`;

    const result = await whatsappAPI.sendTextMessage(to, message);

    return {
      success: true,
      message: 'Overdue reminder sent successfully',
      data: result
    };
  } catch (error) {
    console.error('Error sending overdue reminder:', error);
    return {
      success: false,
      message: 'Failed to send overdue reminder',
      error: error.message
    };
  }
}

/**
 * Send service notification
 * @param {string} to - Phone number with country code
 * @param {Object} serviceData - Service information
 * @returns {Promise<Object>} Send result
 */
async function sendServiceNotification(to, serviceData) {
  try {
    const { type, title, message: serviceMessage, scheduled_time, customer_id } = serviceData;

    const notification = `🔧 *INFORMASI LAYANAN*

${title}

${serviceMessage}

📅 Jadwal: ${new Date(scheduled_time).toLocaleDateString('id-ID')}
⏰ Waktu: ${new Date(scheduled_time).toLocaleTimeString('id-ID')}

Mohon maaf atas ketidaknyamanannya.
Jika ada pertanyaan, hubungi kami.

Pt. Kilusi Digital Network
📞 (021) 1234-5678`;

    const result = await whatsappAPI.sendTextMessage(to, notification);

    return {
      success: true,
      message: 'Service notification sent successfully',
      data: result
    };
  } catch (error) {
    console.error('Error sending service notification:', error);
    return {
      success: false,
      message: 'Failed to send service notification',
      error: error.message
    };
  }
}

/**
 * Send welcome message to new customer
 * @param {string} to - Phone number with country code
 * @param {Object} customerData - Customer information
 * @returns {Promise<Object>} Send result
 */
async function sendWelcomeMessage(to, customerData) {
  try {
    const { customer_name, package_name, installation_date, username, password } = customerData;

    const message = `🎉 *SELAMAT DATANG DI KILUSI*

Halo ${customer_name || 'Pelanggan'},

Terima kasih telah berlangganan layanan internet Kilusi! 🚀

Detail Layanan Anda:
📦 Paket: ${package_name}
📅 Instalasi: ${new Date(installation_date).toLocaleDateString('id-ID')}

Login Portal Pelanggan:
🌐 www.kilusi.id/customer
👤 Username: ${username}
🔑 Password: ${password}

Fasilitas Portal:
📊 Cek penggunaan internet
💰 Lihat tagihan dan bayar
🎫 Ajukan tiket support
📶 Kelola WiFi

Dapatkan bantuan:
📞 (021) 1234-5678
📱 WhatsApp: 62819-XXXX-XXXX
🌐 www.kilusi.id

Selamat menikmati internet cepat dan stabil! 🌟`;

    const result = await whatsappAPI.sendTextMessage(to, message);

    return {
      success: true,
      message: 'Welcome message sent successfully',
      data: result
    };
  } catch (error) {
    console.error('Error sending welcome message:', error);
    return {
      success: false,
      message: 'Failed to send welcome message',
      error: error.message
    };
  }
}

/**
 * Send ticket creation confirmation
 * @param {string} to - Phone number with country code
 * @param {Object} ticketData - Ticket information
 * @returns {Promise<Object>} Send result
 */
async function sendTicketConfirmation(to, ticketData) {
  try {
    const { ticket_number, subject, priority, customer_name } = ticketData;

    const message = `🎫 *TIKET DIBUAT*

Halo ${customer_name || 'Pelanggan'},

Tiket bantuan Anda telah kami terima!

Detail Tiket:
🎫 No. Tiket: ${ticket_number}
📝 Subjek: ${subject}
🔴 Prioritas: ${priority}

Tim kami akan segera merespon dalam waktu 1x24 jam.
Anda dapat melihat status tiket di portal pelanggan.

Tracking tiket:
🌐 www.kilusi.id/customer/support
📞 (021) 1234-5678

Pt. Kilusi Digital Network`;

    const result = await whatsappAPI.sendTextMessage(to, message);

    return {
      success: true,
      message: 'Ticket confirmation sent successfully',
      data: result
    };
  } catch (error) {
    console.error('Error sending ticket confirmation:', error);
    return {
      success: false,
      message: 'Failed to send ticket confirmation',
      error: error.message
    };
  }
}

module.exports = {
  sendBillingNotification,
  sendPaymentConfirmation,
  sendOverdueReminder,
  sendServiceNotification,
  sendWelcomeMessage,
  sendTicketConfirmation
};