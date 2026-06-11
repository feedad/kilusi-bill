# Panduan Integrasi Autopay Middleware (Updated)

Dokumen ini adalah panduan teknis bagi tim pengembang sistem billing untuk mengintegrasikan pembayaran otomatis dengan Autopay.

## 1. Konsep Dasar
Autopay memantau mutasi bank secara real-time. Untuk aktivasi otomatis, sistem billing harus mengirimkan data tagihan ke Autopay. Autopay akan melakukan **Auto-Matching** berdasarkan nominal yang masuk.

## 2. API Endpoint: Registrasi Tagihan (Push Invoice)
Gunakan endpoint ini setiap kali ada tagihan baru (invoice) yang terbit di sistem billing.

**Endpoint:** `POST /api/v1/invoices`
**Header:** `X-API-Key: [API_KEY_ANDA]`

**Payload (JSON):**
```json
{
  "invoice_id": "INV-1001",
  "amount": 150123,
  "customer_name": "Feyadhitya",
  "expiry_date": "2026-05-20T23:59:59Z",
  "metadata": {
    "order_id": "ORD-55"
  }
}
```
*Tips: Gunakan 3 digit terakhir (123) sebagai kode unik agar matching 100% akurat.*

## 3. API Endpoint: Cek Status Tagihan
Gunakan ini untuk mengecek apakah sebuah tagihan sudah terverifikasi lunas di sisi Autopay.

**Endpoint:** `GET /api/v1/invoices?invoice_id=INV-1001`
**Header:** `X-API-Key: [API_KEY_ANDA]`

**Contoh Respon (Jika sudah lunas):**
```json
{
  "success": true,
  "data": {
    "status": "PAID",
    "matched_at": "2026-05-15T22:30:00.000Z",
    "amount": "150123.00"
  }
}
```

## 4. Webhook Callback (Autopay -> Billing)
Segera setelah matching berhasil, Autopay akan mengirimkan sinyal balik ke URL yang Anda tentukan.

**Rencana Payload Callback:**
```json
{
  "invoice_id": "INV-1001",
  "status": "PAID",
  "amount_received": 150123,
  "transaction_date": "2026-05-15T22:30:00Z",
  "bank_name": "OCBC",
  "sender_info": "AAN NURANITA"
}
```

## 5. Keamanan & Best Practices
- **Idempotency:** Sistem billing harus menangani jika menerima callback yang sama dua kali.
- **Data Integrity:** Gunakan tipe data string atau integer untuk `invoice_id`.

---
**Status Pengembangan Autopay:**
- [x] **Webhook Inbound (Email & Mobile Push):** Aktif.
- [x] **Matching Engine (Auto-Verify):** Aktif & Real-time.
- [x] **Invoice API (Push & Status Check):** Aktif (Siap digunakan).
- [ ] **Outgoing Webhook (Callback to Billing):** Menunggu URL Callback dari Tim Billing.
