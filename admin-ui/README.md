# Kilusi Admin UI (POC)

POC React (Vite) untuk memanfaatkan API SNMP yang sudah ada di server Express.

## Menjalankan

1. Jalankan server Express Anda (port 3000).
2. Buka terminal di folder `admin-ui/` lalu:

```powershell
npm install
npm run dev
```

Akan muncul dev server di http://localhost:5173. Semua request ke path `/admin/*` otomatis di-proxy ke server Express.

Halaman POC:
- `/snmp/devices` — menampilkan daftar perangkat dari `/admin/snmp/devices/json`.
- `/snmp/monitor` — ambil info perangkat dari `/admin/snmp/device-info?host=...` setiap 5 detik.

## Catatan
- Ini hanya POC minimal. Hardening (auth, routing guard, styling) bisa ditambahkan kemudian.
- Untuk production, jalankan `npm run build` lalu deploy hasil `dist/` via reverse proxy atau static host.
