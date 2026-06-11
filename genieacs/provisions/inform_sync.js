// Skrip Provision: inform_sync
// Berjalan otomatis saat ONU melakukan Inform (Boot/Periodic Inform)

// Ambil waktu sekarang untuk memicu refresh
const NOW = Date.now();

// 1. Ambil Informasi Dasar Perangkat
declare("InternetGatewayDevice.DeviceInfo.SoftwareVersion", {value: NOW});
declare("InternetGatewayDevice.DeviceInfo.ModelName", {value: NOW});
declare("InternetGatewayDevice.DeviceInfo.HardwareVersion", {value: NOW});
declare("InternetGatewayDevice.DeviceInfo.Manufacturer", {value: NOW});

// 2. Ambil Status Koneksi WAN (IP Address + PPPoE)
declare("InternetGatewayDevice.WANDevice.*.WANConnectionDevice.*.WANPPPConnection.*.ExternalIPAddress", {value: NOW});
declare("InternetGatewayDevice.WANDevice.*.WANConnectionDevice.*.WANPPPConnection.*.ConnectionStatus", {value: NOW});
declare("InternetGatewayDevice.WANDevice.*.WANConnectionDevice.*.WANPPPConnection.*.Username", {value: NOW});
declare("InternetGatewayDevice.WANDevice.*.WANConnectionDevice.*.WANPPPConnection.*.MACAddress", {value: NOW});
declare("InternetGatewayDevice.WANDevice.*.WANConnectionDevice.*.WANPPPConnection.*.Uptime", {value: NOW});

// 3. Ambil Informasi Sinyal Optik (RX Power + Suhu)
// Format: InternetGatewayDevice.WANDevice.*.<vendor_path>

// CMCC (H1s-3, GM220-S, MQ220)
declare("InternetGatewayDevice.WANDevice.*.X_CMCC_EponInterfaceConfig.RXPower", {value: NOW});
declare("InternetGatewayDevice.WANDevice.*.X_CMCC_EponInterfaceConfig.TransceiverTemperature", {value: NOW});
declare("InternetGatewayDevice.WANDevice.*.X_CMCC_GponInterfaceConfig.RXPower", {value: NOW});
declare("InternetGatewayDevice.WANDevice.*.X_CMCC_GponInterfaceConfig.TransceiverTemperature", {value: NOW});

// CT-COM (GM220-S, Huawei variant)
declare("InternetGatewayDevice.WANDevice.*.X_CT-COM_EponInterfaceConfig.RXPower", {value: NOW});
declare("InternetGatewayDevice.WANDevice.*.X_CT-COM_EponInterfaceConfig.TransceiverTemperature", {value: NOW});
declare("InternetGatewayDevice.WANDevice.*.X_CT-COM_GponInterfaceConfig.RXPower", {value: NOW});
declare("InternetGatewayDevice.WANDevice.*.X_CT-COM_GponInterfaceConfig.TransceiverTemperature", {value: NOW});

// ZTE COM
declare("InternetGatewayDevice.WANDevice.*.X_ZTE-COM_WANPONInterfaceConfig.RXPower", {value: NOW});
declare("InternetGatewayDevice.WANDevice.*.X_ZTE-COM_WANPONInterfaceConfig.TransceiverTemperature", {value: NOW});

// Huawei
declare("InternetGatewayDevice.WANDevice.*.X_GponInterafceConfig.RXPower", {value: NOW});
declare("InternetGatewayDevice.WANDevice.*.X_GponInterafceConfig.TransceiverTemperature", {value: NOW});

// FiberHome
declare("InternetGatewayDevice.WANDevice.*.X_FH_GponInterfaceConfig.RXPower", {value: NOW});
declare("InternetGatewayDevice.WANDevice.*.X_FH_GponInterfaceConfig.TransceiverTemperature", {value: NOW});

// China Unicom (F477, F663N)
declare("InternetGatewayDevice.WANDevice.*.X_CU_WANEPONInterfaceConfig.OpticalTransceiver.RXPower", {value: NOW});
declare("InternetGatewayDevice.WANDevice.*.X_CU_WANEPONInterfaceConfig.OpticalTransceiver.Temperature", {value: NOW});
declare("InternetGatewayDevice.WANDevice.*.X_CU_WANGPONInterfaceConfig.OpticalTransceiver.RXPower", {value: NOW});
declare("InternetGatewayDevice.WANDevice.*.X_CU_WANGPONInterfaceConfig.OpticalTransceiver.Temperature", {value: NOW});

// Nokia / Alcatel
declare("InternetGatewayDevice.WANDevice.*.X_ALU_OntOpticalParam.RXPower", {value: NOW});
declare("InternetGatewayDevice.WANDevice.*.X_ALU_OntOpticalParam.Temperature", {value: NOW});

// Standard TR-098 / TR-181 (generic)
declare("InternetGatewayDevice.WANDevice.*.WANPONInterfaceConfig.RXPower", {value: NOW});
declare("InternetGatewayDevice.WANDevice.*.WANPONInterfaceConfig.TXPower", {value: NOW});
declare("Device.XPON.Interface.1.Stats.RXPower", {value: NOW});

// 4. Ambil Konfigurasi Wireless (SSID + Password)
declare("InternetGatewayDevice.LANDevice.*.WLANConfiguration.*.SSID", {value: NOW});
declare("InternetGatewayDevice.LANDevice.*.WLANConfiguration.*.KeyPassphrase", {value: NOW});
declare("InternetGatewayDevice.LANDevice.*.WLANConfiguration.*.PreSharedKey.1.PreSharedKey", {value: NOW});
declare("InternetGatewayDevice.LANDevice.*.WLANConfiguration.*.TotalAssociations", {value: NOW});
declare("InternetGatewayDevice.LANDevice.*.WLANConfiguration.*.WLAN_AssociatedDeviceNumberOfEntries", {value: NOW});

// 5. Informasi Perangkat Lainnya
declare("InternetGatewayDevice.LANDevice.*.WLANConfiguration.*.MACAddress", {value: NOW});
declare("InternetGatewayDevice.LANDevice.*.LANHostConfigManagement.MACAddress", {value: NOW});
declare("InternetGatewayDevice.LANDevice.*.Hosts.Host.*.MACAddress", {value: NOW});

// 6. Tipe PON (EPON/GPON)
declare("InternetGatewayDevice.WANDevice.*.WANCommonInterfaceConfig.WANAccessType", {value: NOW});

log("Inform Sync: Data dipicu untuk diperbarui otomatis.");
