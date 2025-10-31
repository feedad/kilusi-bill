# Install Dependencies untuk RADIUS Server

## Windows PowerShell

```powershell
cd d:\Project\kilusi-bill
npm install sqlite3 radius --save
```

## Command Prompt / Git Bash

```bash
cd d:\Project\kilusi-bill
npm install sqlite3 radius --save
```

## Verifikasi Instalasi

Setelah instalasi selesai, cek package.json untuk memastikan dependencies sudah ditambahkan:

```json
{
  "dependencies": {
    "sqlite3": "^5.x.x",
    "radius": "^1.x.x"
  }
}
```

## Jalankan Migration (Optional)

Jika Anda sudah memiliki customer data dan ingin menambahkan field RADIUS:

```bash
node scripts/migrate-customer-radius.js
```

## Jalankan Aplikasi

```bash
npm start
```

atau dengan PM2:

```bash
pm2 start app.js --name kilusi-bill
pm2 logs kilusi-bill
```

## Testing RADIUS Server

Untuk testing RADIUS server, Anda dapat menggunakan radtest:

```bash
# Install freeradius-utils (Linux)
sudo apt-get install freeradius-utils

# Test authentication
radtest username password localhost:1812 0 testing123

# Windows: Download NTRadPing
# https://www.ntsoftware.co.uk/
```

## Akses Management Interface

Buka browser:
```
http://localhost:3001/admin/radius
```

Login menggunakan admin credentials yang ada di settings.json
