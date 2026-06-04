// Skrip Provision: inform_sync
// Berjalan otomatis saat ONU melakukan Inform (Boot/Periodic Inform)

// Ambil waktu sekarang untuk memicu refresh
const NOW = Date.now();

// 1. Ambil Informasi Dasar Perangkat
declare("InternetGatewayDevice.DeviceInfo.SoftwareVersion", {value: NOW});
declare("InternetGatewayDevice.DeviceInfo.ModelName", {value: NOW});

// 2. Ambil Status Koneksi WAN (IP Address)
declare("InternetGatewayDevice.WANDevice.*.WANConnectionDevice.*.WANPPPConnection.*.ExternalIPAddress", {value: NOW});
declare("InternetGatewayDevice.WANDevice.*.WANConnectionDevice.*.WANPPPConnection.*.ConnectionStatus", {value: NOW});

// 3. Ambil Informasi Sinyal (Jika tersedia di model umum)
// Catatan: Nama path ini mungkin bervariasi tergantung vendor ONU (ZTE/Huawei/Fiberhome)
declare("InternetGatewayDevice.WANDevice.*.WANConnectionDevice.*.WANEthernetLinkConfig.EthernetLinkStatus", {value: NOW});

// 4. Ambil Konfigurasi Wireless (SSID)
declare("InternetGatewayDevice.LANDevice.*.WLANConfiguration.*.SSID", {value: NOW});

log("Inform Sync: Data dipicu untuk diperbarui otomatis.");
