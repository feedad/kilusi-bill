# SNMP Device Edit & Navigation Features

## Fitur yang Ditambahkan

### 1. Edit SNMP Settings dari Device List
**Lokasi:** `/admin/snmp/devices`

#### Fitur:
- ✅ Tombol Edit (ikon pensil) di setiap baris perangkat
- ✅ Modal popup untuk edit SNMP settings per-device
- ✅ Field yang dapat diedit:
  - SNMP Community (custom atau kosongkan untuk global)
  - SNMP Version (v1, v2c, v3, atau default global)
  - SNMP Port (custom atau default 161)
- ✅ Auto-refresh list setelah update
- ✅ Penyimpanan langsung ke database (nas_servers atau mikrotik_servers)

#### Cara Penggunaan:
1. Buka `/admin/snmp/devices`
2. Klik tombol dengan ikon pensil (✏️) di kolom Aksi
3. Modal edit akan muncul menampilkan:
   - Nama perangkat (readonly)
   - IP Address (readonly)
   - SNMP Community (editable)
   - SNMP Version dropdown (editable)
   - SNMP Port (editable)
4. Ubah nilai sesuai kebutuhan
5. Klik "Simpan"
6. List akan refresh otomatis dengan settings baru

#### API Endpoints Baru:
- `POST /admin/snmp/devices/update-nas/:id` - Update NAS server SNMP settings
- `POST /admin/snmp/devices/update-mikrotik/:id` - Update Mikrotik server SNMP settings

**Request Body:**
```json
{
  "snmp_community": "private",
  "snmp_version": "2c",
  "snmp_port": 161
}
```

**Response:**
```json
{
  "success": true,
  "message": "SNMP settings updated"
}
```

---

### 2. Navigasi Back to Devices dari Monitor
**Lokasi:** `/admin/snmp/monitor?host=...`

#### Fitur:
- ✅ Breadcrumb bar di bagian atas halaman monitor
- ✅ Tombol "Kembali ke Daftar Perangkat" yang prominent
- ✅ Menampilkan host yang sedang dimonitor
- ✅ Link cepat ke Diagnostics page
- ✅ Visual styling yang jelas dengan background color

#### Layout Breadcrumb:
```
┌──────────────────────────────────────────────────────┐
│ [← Kembali ke Daftar Perangkat]  Monitoring: 192... │ [🛠️ Diagnostics]
└──────────────────────────────────────────────────────┘
```

---

### 3. Quick SNMP Settings di Monitor Page
**Lokasi:** `/admin/snmp/monitor?host=...`

#### Fitur:
- ✅ Tombol "SNMP Settings" di navbar monitor
- ✅ Modal untuk override SNMP settings sementara
- ✅ Apply via query parameters (tidak permanen)
- ✅ Reload otomatis dengan settings baru
- ✅ Info box menjelaskan settings sementara vs permanen

#### Cara Penggunaan:
1. Dari halaman monitor, klik tombol "SNMP Settings" (⚙️)
2. Modal akan muncul dengan field:
   - SNMP Community
   - SNMP Version
   - SNMP Port
3. Isi nilai yang diinginkan
4. Klik "Terapkan & Reload"
5. Halaman akan reload dengan query params baru:
   ```
   /admin/snmp/monitor?host=192.168.1.1&community=private&version=2c&port=161
   ```

**Catatan:** Settings ini hanya berlaku untuk sesi browsing saat ini. Untuk perubahan permanen, gunakan Edit di halaman Devices.

---

## File yang Dimodifikasi

### 1. `views/admin-snmp-devices.ejs`
**Perubahan:**
- Menambahkan tombol Edit di kolom Aksi
- Menambahkan modal `editDeviceModal` dengan form SNMP settings
- Menambahkan fungsi JavaScript `editDevice()` dan `saveDeviceSettings()`
- Bootstrap modal integration

### 2. `views/admin-snmp-monitor.ejs`
**Perubahan:**
- Menambahkan breadcrumb bar dengan tombol Back dan link Diagnostics
- Menambahkan tombol "SNMP Settings" di navbar
- Menambahkan modal `quickSettingsModal` untuk quick override
- Menambahkan fungsi `openQuickSettings()` dan `applyQuickSettings()`
- CSS untuk styling breadcrumb bar

### 3. `routes/adminSnmp.js`
**Perubahan:**
- Menambahkan endpoint `POST /snmp/devices/update-nas/:id`
- Menambahkan endpoint `POST /snmp/devices/update-mikrotik/:id`
- Validasi dan update database untuk SNMP settings
- Error handling dan logging

---

## Keuntungan Fitur Ini

### User Experience:
1. **Easy Configuration:** Admin bisa langsung edit SNMP settings dari web UI tanpa perlu SSH
2. **Per-Device Settings:** Setiap device bisa punya SNMP credentials berbeda
3. **Quick Testing:** Modal Quick Settings di monitor page untuk testing tanpa commit ke DB
4. **Clear Navigation:** Tombol back yang jelas memudahkan workflow

### Technical Benefits:
1. **Persistent Storage:** Settings disimpan di database, tidak hilang saat restart
2. **Backward Compatible:** Fallback ke global settings jika per-device tidak diset
3. **Flexible Override:** Query parameter override untuk troubleshooting
4. **Secure:** Authentication required, validated input

---

## Workflow Rekomendasi

### Setup Awal:
1. Masuk ke `/admin/nas` atau `/admin/mikrotik-servers`
2. Tambah device dengan SNMP settings (jika belum ada)
3. Buka `/admin/snmp/devices` untuk melihat list semua perangkat

### Monitor Device:
1. Dari devices list, klik "Monitor" pada device
2. Monitor page akan terbuka dengan 4 tab (Dashboard, Interface, PPPoE, Hotspot)
3. Jika SNMP gagal, klik "SNMP Settings" untuk quick override

### Edit SNMP Settings:
1. Dari devices list, klik tombol Edit (pensil) pada device
2. Update community/version/port sesuai kebutuhan
3. Simpan, lalu klik "Monitor" untuk verifikasi

### Kembali ke List:
1. Dari monitor page, klik "Kembali ke Daftar Perangkat" di breadcrumb
2. Atau gunakan sidebar menu untuk navigasi

---

## Testing Checklist

- [ ] Edit SNMP settings NAS device berhasil save ke database
- [ ] Edit SNMP settings Mikrotik device berhasil save ke database
- [ ] Modal edit menampilkan data device dengan benar
- [ ] Tombol "Kembali ke Daftar Perangkat" berfungsi dari monitor page
- [ ] Quick Settings modal apply query params dengan benar
- [ ] Breadcrumb menampilkan host yang sedang dimonitor
- [ ] Settings kosong fallback ke global settings
- [ ] Error handling jika device tidak ditemukan
- [ ] Refresh list setelah edit berhasil
- [ ] Bootstrap modal open/close dengan smooth

---

## Screenshots

### Devices List dengan Tombol Edit
```
┌──────────────────────────────────────────────────────────┐
│ Nama Router │ Tipe │ IP      │ Aksi                      │
├──────────────────────────────────────────────────────────┤
│ Router-1    │ MT   │ 192...  │ [Monitor] [✏️] [🔍]      │
└──────────────────────────────────────────────────────────┘
```

### Edit Modal
```
┌────────────────────────────────────┐
│ ✏️ Edit SNMP Settings             │
├────────────────────────────────────┤
│ Nama: Router-1                     │
│ IP: 192.168.1.1                    │
│ ───────────────────────────────    │
│ SNMP Community: [private____]      │
│ SNMP Version: [v2c ▼]              │
│ SNMP Port: [161_____]              │
│                                    │
│            [Batal] [Simpan]        │
└────────────────────────────────────┘
```

### Monitor Page Breadcrumb
```
┌──────────────────────────────────────────────────┐
│ [← Kembali ke Daftar] Monitoring: 192.168.1.1  │ [🛠️ Diagnostics]
├──────────────────────────────────────────────────┤
│ [DASHBOARD] [INTERFACE] [PPPOE] [HOTSPOT]  [⚙️ Settings] [🔴 REBOOT] │
└──────────────────────────────────────────────────┘
```

---

## Future Enhancements

1. **Bulk Edit:** Select multiple devices dan edit SNMP settings sekaligus
2. **Templates:** SNMP settings templates untuk quick apply
3. **Test Connection:** Tombol test SNMP connection sebelum save
4. **History Log:** Track perubahan SNMP settings
5. **Auto-detect:** Auto-detect SNMP version dari device
6. **SNMPv3 Auth:** Support untuk USM authentication jika menggunakan v3

---

## Troubleshooting

### Edit tidak tersimpan
- Cek console browser untuk error
- Verify database schema memiliki kolom snmp_community, snmp_version, snmp_port
- Pastikan user memiliki permission adminAuth

### Modal tidak muncul
- Pastikan Bootstrap JS sudah loaded
- Cek console untuk JavaScript errors
- Verify Bootstrap version compatibility

### Back button tidak berfungsi
- Pastikan link href sudah benar: `/admin/snmp/devices`
- Cek routing di app.js sudah mount adminSnmp

### Settings tidak apply
- Verify endpoint menerima POST request dengan benar
- Cek database updated_at column ter-update
- Refresh cache jika ada caching layer

