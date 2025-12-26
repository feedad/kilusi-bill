# 📋 Configuration Guide

## File Konfigurasi yang Tersedia

### Backend Configuration

1. **settings.json.backup** - Backup file settings asli (HATI-HATI: mengandung data sensitif!)
2. **../backend/.env.example** - Template konfigurasi environment variables untuk backend
3. **../backend/settings.example.json** - Template konfigurasi settings untuk backend

### Frontend Configuration

1. **frontend.env.backup** - Backup file .env.local asli (HATI-HATI: mengandung data sensitif!)
2. **../frontend/.env.example** - Template konfigurasi environment variables untuk frontend

## ⚠️ **PERINGATAN KEAMANAN**

File-file `.backup` mengandung informasi SENSITIF seperti:
- Password database
- API keys
- Nomor WhatsApp asli
- Informasi payment gateway
- Konfigurasi RADIUS

**JANGAN** pernah mengupload file-file ini ke repository publik atau membagikannya!

## 🚀 Cara Setup Konfigurasi

### Backend Setup

1. Copy template environment variables:
   ```bash
   cp backend/.env.example backend/.env
   ```

2. Copy template settings:
   ```bash
   cp backend/settings.example.json backend/settings.json
   ```

3. Edit kedua file tersebut dengan konfigurasi yang sesuai

### Frontend Setup

1. Copy template environment variables:
   ```bash
   cp frontend/.env.example frontend/.env.local
   ```

2. Edit file tersebut dengan konfigurasi yang sesuai

## 🔧 Konfigurasi Utama yang Harus Diubah

### Backend (.env)
- `POSTGRES_PASSWORD` - Password database PostgreSQL
- `RADIUS_PASSWORD` - Password database RADIUS
- `API_SECRET` - Secret key untuk API
- `JWT_SECRET` - Secret key untuk JWT
- `SESSION_SECRET` - Secret key untuk session

### Backend (settings.json)
- `admin_password` - Password admin default
- `postgres_password` - Password PostgreSQL
- `radius_password` - Password RADIUS
- `mikrotik_password` - Password Mikrotik
- `genieacs_password` - Password GenieACS
- Nomor WhatsApp di `admin_numbers` dan `technician_numbers`
- Payment accounts

### Frontend (.env.local)
- `NEXT_PUBLIC_API_URL` - URL API backend

## 🛡️ Best Practices

1. **Gunakan password yang kuat** untuk semua konfigurasi
2. **Jangan gunakan password default** di production
3. **Generate secret keys yang panjang dan random** untuk JWT dan session
4. **Limit akses** ke file-file konfigurasi
5. **Backup file konfigurasi** di tempat yang aman
6. **Use environment variables** untuk sensitive data di production

## 📝 Contoh Generate Random Secret

```bash
# Generate 64-character random string untuk JWT/Session secret
openssl rand -base64 64

# Atau menggunakan Node.js
node -e "console.log(require('crypto').randomBytes(64).toString('base64'))"
```

## 🔍 Troubleshooting

### Error: Database connection failed
- Periksa konfigurasi PostgreSQL di `.env` dan `settings.json`
- Pastikan database server berjalan
- Verifikasi user dan password

### Error: RADIUS authentication failed
- Periksa konfigurasi RADIUS di kedua file
- Pastikan RADIUS server berjalan
- Verifikasi NAS clients configuration

### Error: WhatsApp not working
- Periksa nomor WhatsApp di settings.json
- Pastikan format nomor benar (dengan kode negara, tanpa +/0)
- Restart aplikasi setelah mengubah konfigurasi