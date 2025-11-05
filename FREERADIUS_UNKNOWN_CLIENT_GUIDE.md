# Panduan Lengkap Perbaikan “unknown client” FreeRADIUS (Docker + PostgreSQL)

Dokumen ini memandu langkah lengkap memperbaiki error “Ignoring request from unknown client …” pada FreeRADIUS yang berjalan di Docker, dengan database PostgreSQL di 172.22.10.28. Contoh NAS terdampak: 172.22.10.156.

Tujuan:
- FreeRADIUS mengenali NAS 172.22.10.156 (tidak lagi “unknown client”).
- Otorisasi/akunting berfungsi dengan SQL PostgreSQL.
- Langkah verifikasi dan diagnosa cepat bila masih gagal.

---

## 1) Gejala dan Penyebab Umum

Gejala utama di log FreeRADIUS (mode `-X`):

- `Ignoring request from unknown client 172.22.10.156 port ...` → RADIUS menolak paket karena IP sumber tidak cocok dengan daftar klien yang dikenali.

Penyebab paling umum:
- File konfigurasi `clients.conf` di dalam container tidak memuat NAS kamu (volume tidak dimount atau path berbeda).
- Dynamic clients dari SQL tidak termuat karena:
  - Koneksi DB gagal saat startup.
  - Nama tabel/kolom tidak sesuai skema yang diharapkan FreeRADIUS (standar `nas`).
  - File `queries.conf` kustom tidak di-include, sehingga query default tidak cocok untuk tabel kustom.
- IP sumber yang masuk ke container bukan 172.22.10.156 (NAT/routing), sehingga entri client tidak cocok.

---

## 2) Perbaikan Cepat (Bypass sementara untuk validasi)

Gunakan file `clients.conf` yang memuat NAS 172.22.10.156 (dan opsional `0.0.0.0/0` untuk testing singkat).

Contoh isi `clients.conf` (sudah ada di repo):

```
client mikrotik-156 {
    ipaddr = 172.22.10.156
    secret = testing123
    shortname = Mikrotik-156
    nastype = mikrotik
}

# HANYA UNTUK TEST (hapus di produksi)
client any {
    ipaddr = 0.0.0.0/0
    secret = testing123
    shortname = any
    nastype = other
}
```

Mount file ini ke container di path yang dipakai versi FreeRADIUS kamu:
- FreeRADIUS 3.x: `/etc/freeradius/3.0/clients.conf`

Contoh (opsional) docker run:

```bash
# Sesuaikan: nama container, image, dan path host
docker run -d --name fr3 \
  -p 1812:1812/udp -p 1813:1813/udp \
  -v /home/kilusi-bill/freeradius-clients.conf:/etc/freeradius/3.0/clients.conf:ro \
  freeradius/freeradius-server:3.2.3
```

Reload atau jalankan debug:

```bash
docker exec -it fr3 radmin -e 'hup'  # reload
# atau debug foreground (lihat log detail)
docker exec -it fr3 freeradius -X
```

Jika “unknown client” hilang, maka masalah ada di dynamic clients (SQL) atau di mounting file sebelumnya. Lanjutkan ke langkah permanen di bawah.

---

## 3) Perbaikan Permanen (Dynamic Clients via SQL)

Di repo ini, file module SQL kamu (`freeradius-sql-mod.conf`) mengatur:
- `server = 172.22.10.28` (PostgreSQL)
- `read_clients = yes`
- `client_table = "nas_servers"` (tabel kustom)
- Include query default FreeRADIUS: `${modconfdir}/sql/main/${dialect}/queries.conf`

Masalah: Query default FreeRADIUS mengharapkan tabel standar `nas` (kolom `nasname`, `shortname`, `secret`, dll). Jika kamu memakai tabel kustom `nas_servers`, kamu wajib:
- Either menggunakan view `nas` yang memproyeksikan kolom dari `nas_servers` (paling mudah), atau
- Mengarahkan module SQL ke file `queries.conf` kustom yang memetakan kolom sesuai struktur `nas_servers`.

Kamu punya file kustom `freeradius-queries.conf` dengan `client_query`, tapi belum otomatis terpakai. Pilih salah satu opsi di bawah.

### Opsi A — Pakai skema standar `nas` (direkomendasikan)

1) Ganti `client_table` di module SQL menjadi `nas`.
2) Pastikan tabel `nas` ada dan memuat NAS kamu.

Contoh SQL (PostgreSQL):

```sql
CREATE TABLE IF NOT EXISTS nas (
  id SERIAL PRIMARY KEY,
  nasname VARCHAR(128) NOT NULL,
  shortname VARCHAR(32),
  type VARCHAR(30) DEFAULT 'other',
  ports INTEGER,
  secret VARCHAR(60) NOT NULL,
  server VARCHAR(64),
  community VARCHAR(50),
  description VARCHAR(200)
);

INSERT INTO nas (nasname, shortname, secret, type, description)
VALUES ('172.22.10.156', 'mikrotik-156', 'testing123', 'mikrotik', 'Mikrotik NAS 156')
ON CONFLICT DO NOTHING;
```

3) Pastikan module SQL mengarah ke DB kamu (sudah benar: 172.22.10.28) dan `read_clients = yes`.
4) Reload FreeRADIUS, lalu cek log startup: harus muncul `rlm_sql (sql): Read N clients`.

### Opsi B — Tetap pakai tabel kustom `nas_servers`

1) Pastikan module SQL meng-include file query kustom yang cocok dengan `nas_servers`.
   - Salin `freeradius-queries.conf` menjadi file queries path bawaan FreeRADIUS untuk PostgreSQL:
     - `/etc/freeradius/3.0/mods-config/sql/main/postgresql/queries.conf`
   - Atau ubah include di module SQL agar menunjuk ke file ini.

2) Pastikan `client_query` memetakan kolom yang benar. Minimal `nasname` harus berisi IP/hostname NAS dan ada `secret`. Contoh aman:

```sql
SELECT
  id,
  ip_address AS nasname,
  shortname,
  secret,
  COALESCE(type, 'other') AS type,
  server,
  description
FROM nas_servers;
```

3) Reload FreeRADIUS, cek log: `Read N clients`.

### Opsi C — Buat VIEW `nas` di atas `nas_servers` (tanpa ubah module SQL)

Jika kamu ingin tetap menggunakan include query default, buat view `nas` agar kompatibel:

```sql
CREATE OR REPLACE VIEW nas AS
SELECT
  id,
  ip_address AS nasname,
  shortname,
  COALESCE(type, 'other') AS type,
  NULL::integer AS ports,
  secret,
  server,
  NULL::varchar(50) AS community,
  description
FROM nas_servers;
```

Lalu set `client_table = "nas"` di module SQL, reload, dan cek `Read N clients`.

---

## 4) Pastikan modul SQL aktif di virtual server

Di FreeRADIUS 3.x, periksa file virtual server di container:
- `/etc/freeradius/3.0/sites-enabled/default`
- (dan biasanya) `/etc/freeradius/3.0/sites-enabled/inner-tunnel`

Pastikan blok berikut ada:

- `authorize { sql }`
- `accounting { sql }`
- `post-auth { sql }` (opsional)

Jika `sql` belum aktif di `mods-enabled`, buat symlink (atau mount file yang sudah tersymlink).

```bash
# Contoh di dalam container
ln -s /etc/freeradius/3.0/mods-available/sql /etc/freeradius/3.0/mods-enabled/sql || true
```

---

## 5) Mounting ke Docker (yang penting terbaca container)

Mount file-file berikut sesuai opsi yang kamu pilih:

- `clients.conf` → `/etc/freeradius/3.0/clients.conf`
- `mods-available/sql` → `/etc/freeradius/3.0/mods-available/sql` (pastikan ada symlink di `mods-enabled/sql`)
- Jika Opsi B: `queries.conf` kustom → `/etc/freeradius/3.0/mods-config/sql/main/postgresql/queries.conf`
- (Opsional) `sites-enabled/default` jika kamu perlu mengaktifkan `sql` di virtual server

Contoh (opsional) docker run pemakaian file-file lokal (ubah path host sesuai):

```bash
docker run -d --name fr3 \
  -p 1812:1812/udp -p 1813:1813/udp \
  -v /home/kilusi-bill/freeradius-clients.conf:/etc/freeradius/3.0/clients.conf:ro \
  -v /home/kilusi-bill/freeradius-sql-mod.conf:/etc/freeradius/3.0/mods-available/sql:ro \
  -v /home/kilusi-bill/freeradius-queries.conf:/etc/freeradius/3.0/mods-config/sql/main/postgresql/queries.conf:ro \
  freeradius/freeradius-server:3.2.3

# Aktifkan mod sql bila perlu:
docker exec -it fr3 sh -lc 'ln -sf /etc/freeradius/3.0/mods-available/sql /etc/freeradius/3.0/mods-enabled/sql && radmin -e "hup"'
```

Jika kamu memakai docker-compose, mount path yang sama pada service radius.

---

## 6) Verifikasi dan Diagnosa

1) Cek koneksi DB dari container:

```bash
docker exec -it fr3 sh -lc 'nc -zv 172.22.10.28 5432 || true'
```

2) Jalankan FreeRADIUS dalam mode debug:

```bash
docker exec -it fr3 freeradius -X
```

Pastikan terlihat:
- Koneksi ke PostgreSQL berhasil.
- `rlm_sql (sql): Read N clients` dengan N ≥ 1.
- Tidak ada error query pada `client_query`.

3) Pantau paket yang masuk dan IP sumber:

```bash
docker exec -it fr3 tcpdump -ni any udp port 1812 -vv
```

- Pastikan paket dari NAS benar-benar terlihat dan IP sumbernya 172.22.10.156. Jika berbeda, tambahkan entri client untuk IP yang sebenarnya, atau perbaiki NAT/routing.

4) Uji autentikasi (opsional) dari host lain:

```bash
# radtest format: radtest user pass RADIUS_SERVER RADIUS_AUTH_PORT NAS_SECRET
radtest apptest test123 127.0.0.1 0 testing123
```

Catatan: `radtest` menguji dari IP lokal container/host, bukan dari NAS 172.22.10.156. Ini berguna memvalidasi pipeline auth, bukan status “unknown client” dari IP NAS.

---

## 7) Checklist Cepat (urut yang disarankan)

- [ ] Jalankan `freeradius -X` di container → lihat apakah ada `Read N clients`.
- [ ] Jika `unknown client` masih muncul, mount `clients.conf` dengan `client 172.22.10.156` untuk bypass sementara. Jika berhasil, masalah ada di dynamic clients/mounting.
- [ ] Putuskan Opsi A (tabel `nas`), Opsi B (queries kustom untuk `nas_servers`), atau Opsi C (VIEW `nas`).
- [ ] Pastikan entri untuk 172.22.10.156 ada di tabel/view yang dipakai, dengan `secret` yang cocok dengan konfigurasi NAS.
- [ ] Pastikan `mods-enabled/sql` aktif dan `sites-enabled/default` memuat `authorize { sql }`.
- [ ] Reload (`radmin -e 'hup'`) dan ulangi debug.
- [ ] Jika paket masih tak terlihat atau IP sumber beda → cek routing/NAT; sesuaikan entri client.

---

## 8) Catatan Tambahan dan Pitfall

- Jangan gunakan `client any 0.0.0.0/0` di produksi; hanya untuk forensik cepat.
- Jika memakai `nas_servers`, pastikan `client_query` memetakan `ip_address AS nasname`. Mengalias `id AS nasname` adalah salah dan pasti gagal.
- Pada beberapa image, path konfigurasi bisa berbeda. Untuk FreeRADIUS 3.x resmi: `/etc/freeradius/3.0`.
- Pastikan `secret` di NAS dan di DB/clients.conf sama persis; jika berbeda, log akan menunjukkan kesalahan Message-Authenticator, bukan “unknown client”.

---

## 9) Informasi dari Repo Ini (konteks)

- File yang ada di repo:
  - `freeradius-sql-mod.conf`: PostgreSQL di 172.22.10.28, `read_clients = yes`, `client_table = "nas_servers"`.
  - `freeradius-queries.conf`: Mengandung `client_query` kustom untuk membaca dari `nas_servers` (perlu dimount ke path queries FreeRADIUS agar digunakan).
  - `freeradius-clients.conf`: Memuat `client mikrotik-156` dan `client any` (wajib dimount agar berlaku).

Ikuti salah satu jalur Opsi A/B/C, mount file yang tepat, dan verifikasi dengan `freeradius -X` hingga `unknown client` hilang.

---

## 10) Butuh Bantuan Lanjutan?

Jika kamu kirimkan:
- Cara menjalankan container sekarang (docker run / compose), dan
- Struktur tabel `nas_servers` saat ini (`\d+ nas_servers;` di psql)

maka kami bisa menuliskan potongan konfigurasi final (mount + isi file) yang 100% sesuai dengan lingkunganmu agar langsung hijau tanpa trial-and-error.
