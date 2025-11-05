# 📋 STRUKTUR TABEL PELANGGAN LENGKAP

## 🗃️ Database Table: `customers`

### 📊 Kolom Database (27 Total)

| No | Database Column | Type | Frontend Display | Description | Wajib |
|---|-----------------|------|-----------------|-------------|------|
| 1 | `id` | VARCHAR(5) | **ID Pelanggan** 🏷️ | Database ID (00001-99999) | ✅ |
| 2 | `username` | VARCHAR(255) | **Username Backend** | Hidden, 5 digit ID | ❌ |
| 3 | `name` | VARCHAR(255) | **Nama Pelanggan** | Nama lengkap pelanggan | ✅ |
| 4 | `phone` | VARCHAR(50) | **No HP** 📞👤 | WhatsApp + Username Portal | ✅ |
| 5 | `pppoe_username` | VARCHAR(255) | **Username PPPoE** | Auto-generate YYMMDD+ID | ❌ |
| 6 | `pppoe_password` | VARCHAR(255) | **Password PPPoE** | Default: 1234567 | ❌ |
| 7 | `email` | VARCHAR(255) | **Email** | Email pelanggan | ❌ |
| 8 | `address` | TEXT | **Alamat** | Lokasi layanan | ❌ |
| 9 | `latitude` | NUMERIC | **Latitude** | Koordinat GPS | ❌ |
| 10 | `longitude` | NUMERIC | **Longitude** | Koordinat GPS | ❌ |
| 11 | `package_id` | INTEGER | **Paket** | Foreign key ke packages | ❌ |
| 12 | `pppoe_profile` | VARCHAR(100) | **PPPoE Profile** | Profile PPPoE | ❌ |
| 13 | `status` | VARCHAR(50) | **Status** | Active/Inactive | ❌ |
| 14 | `install_date` | TIMESTAMP | **Tanggal Daftar** | Tanggal pendaftaran | ❌ |
| 15 | `cable_type` | VARCHAR(50) | **Jenis Kabel** | Tipe kabel jaringan | ❌ |
| 16 | `cable_length` | INTEGER | **Panjang Kabel** | Panjang kabel (meter) | ❌ |
| 17 | `port_number` | INTEGER | **Nomor Port** | Port di perangkat | ❌ |
| 18 | `cable_status` | VARCHAR(50) | **Status Kabel** | Connected/Disconnected | ❌ |
| 19 | `cable_notes` | TEXT | **Catatan Kabel** | Keterangan teknis | ❌ |
| 20 | `device_id` | VARCHAR(255) | **Device ID** | ID perangkat | ❌ |
| 21 | `area` | VARCHAR(100) | **Area Layanan** | Area 1-5 | ❌ |
| 22 | `payment_status` | VARCHAR(50) | **Status Pembayaran** | Paid/Unpaid | ❌ |
| 23 | `active_date` | TIMESTAMP | **Tanggal Aktif** | Tanggal aktivasi layanan | ❌ |
| 24 | `isolir_date` | TIMESTAMP | **Tanggal Isolir** | Tanggal isolir | ❌ |
| 25 | `enable_isolir` | BOOLEAN | **Auto-Isolir** | Enable/disable auto-isolir | ❌ |
| 26 | `created_at` | TIMESTAMP | **Created At** | Timestamp creation | ❌ |
| 27 | `updated_at` | TIMESTAMP | **Updated At** | Timestamp update | ❌ |

---

## 🎨 Frontend Table Display

### Tabel Manajemen Pelanggan (16 Kolom + Aksi)

| No | Frontend Column | Database Column | Visual | Function |
|---|----------------|----------------|--------|----------|
| 1 | ✅ Checkbox | JavaScript | `[ ]` | Select multiple |
| 2 | 🟢 Status Online | RADIUS API | `🔴🟡🟢` | Connection status |
| 3 | 🏷️ ID Pelanggan | `id` | `00001` | Database ID |
| 4 | 👤 Nama Pelanggan | `name` | Text | Customer name |
| 5 | 📍 Alamat | `address` | Text | Service location |
| 6 | 📞👤 No HP | `phone` | `0812345678 👤` | WhatsApp + Login |
| 7 | 📦 Paket | `package.name` | Text | Service package |
| 8 | 💰 Harga Paket | `package.price` | `Rp 100.000` | Package price |
| 9 | 🔐 Username PPPoE | `pppoe_username` | `25110100001@kilusi.id` | Internet username |
| 10 | 🔑 Password PPPoE | `pppoe_password` | `1234567` | Internet password |
| 11 | 📅 Tanggal Daftar | `install_date` | `01-11-2025` | Registration date |
| 12 | ✅ Tanggal Aktif | `active_date` | `01-11-2025` | Activation date |
| 13 | ⚠️ Tanggal Isolir | `isolir_date` | `01-12-2025` | Suspension date |
| 14 | 💳 Status Pembayaran | `payment_status` | `Lunas/Belum Lunas` | Payment status |
| 15 | 🗺️ Area Layanan | `area` | `Area 1` | Service area |
| 16 | ⚙️ Aksi | JavaScript | `[✏️👁️🧾🗑️]` | Operations |

---

## 🔗 Data Flow & Integration

### 📱 Login Systems
- **Admin Portal**: Admin credentials
- **Customer Portal**: `phone` (No HP) as username
- **PPPoE Internet**: `pppoe_username` + `pppoe_password`

### 🔄 Auto-Generation
1. **ID Pelanggan**: Sequential 5-digit (00001-99999)
2. **Username PPPoE**: Format `YYMMDD + 5digitID + suffix`
3. **Password PPPoE**: Default `1234567`

### 📡 Integration Points
- **📡 RADIUS**: PPPoE credentials sync
- **💬 WhatsApp Bot**: Notifikasi ke No HP
- **🧾 Invoice**: Tagihan otomatis
- **🛡️ Auto-Isolir**: Suspended otomatis

---

## 🎯 Key Differences

### Database ID vs No HP
| Aspect | 🏷️ Database ID | 📞 No HP |
|--------|-------------|-------|
| **Purpose** | Identitas internal data | Login + WhatsApp |
| **Format** | 00001-99999 | 081234567890 |
| **Usage** | Management system | Customer portal |
| **Changeable** | ❌ No | ✅ Yes |
| **Frontend** | ✅ Visible | ✅ Visible |
| **Backend** | ✅ ID field | ✅ Username field |

### Frontend Implementation
- **ID Pelanggan**: Badge gradient biru 🏷️
- **No HP**: Link WhatsApp + icon user 👤
- **Status**: Dot berwarna + text 🟢🟡🔴
- **PPPoE**: Code block background 🌙

---

## 📊 Sample Data Structure

```json
{
  "id": "00006",
  "username": "00006",
  "name": "Test Customer",
  "phone": "628123456789",
  "address": "Test Address 123",
  "area": "Area 1",
  "package_id": 1,
  "package_name": "Basic Package",
  "package_price": 100000,
  "pppoe_username": "25110100006@kilusi.id",
  "pppoe_password": "1234567",
  "install_date": "2025-11-01T05:30:00Z",
  "active_date": "2025-11-01T05:30:00Z",
  "isolir_date": null,
  "payment_status": "unpaid",
  "status": "active",
  "enable_isolir": true,
  "connection_status": "online"
}
```

---

## 🔧 Database Constraints

### Primary Keys
- `id` (VARCHAR(5)) - Primary Key

### Unique Constraints
- `username` - No duplicate usernames
- `phone` - No duplicate phone numbers

### Foreign Keys
- `package_id` → `packages.id`

### Default Values
- `status` = 'active'
- `payment_status` = 'unpaid'
- `enable_isolir` = true
- `install_date` = CURRENT_TIMESTAMP
- `created_at` = CURRENT_TIMESTAMP
- `updated_at` = CURRENT_TIMESTAMP

---

## 📱 Mobile Responsive

- **Desktop**: Full table with all columns
- **Tablet**: Collapsible some columns
- **Mobile**: Horizontal scroll with essential columns only

**Essential Mobile Columns**:
- Status, ID Pelanggan, Nama, No HP, Paket, Aksi

---

## 📝 **Perubahan Terkini (November 2025)**

### ✅ **Perubahan Struktur:**

1. **Frontend Display Changes:**
   - Kolom ID Pelanggan sekarang menampilkan `id` (Database ID)
   - Kolom `username` disembunyikan dari frontend
   - Tooltip diperbarui untuk clarity

2. **Login System Separation:**
   - **Database ID**: Untuk management system admin
   - **No HP**: Untuk login customer portal
   - **Username Backend**: Hidden, diwakili oleh No HP

3. **Visual Updates:**
   - Header tabel: "ID Pelanggan 🏷️ (Database ID pelanggan)"
   - Info panel: Penjelasan tentang Database ID vs Username Backend
   - Modal forms: Informasi yang lebih jelas

### 🔍 **Current Structure Mapping:**

| Frontend Column | Database Field | Description |
|-----------------|---------------|-------------|
| ID Pelanggan | `id` | Database ID (visible) |
| No HP | `phone` | WhatsApp + Username Portal |
| Nama | `name` | Customer name |
| ... | ... | ... |

### 📋 **Backend Fields Status:**

| Field | Frontend | Status | Usage |
|-------|----------|--------|-------|
| `id` | ✅ Visible | Primary display ID |
| `username` | ❌ Hidden | Backend reference only |
| `phone` | ✅ Visible | Login + WhatsApp |

Perubahan ini membuat struktur lebih logis dengan memisahkan antara identitas database (ID) dan kredensial login (No HP). 🎯