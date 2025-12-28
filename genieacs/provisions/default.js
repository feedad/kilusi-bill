/* GENIEACS PROVISIONING - DEFAULT PRESET (Kilusi Bill) */
const now = Date.now();
const model = declare("Device.DeviceInfo.ModelName", { value: 1 }).value[0];
const serial = declare("Device.DeviceInfo.SerialNumber", { value: 1 }).value[0];
const mac = declare("Device.DeviceInfo.MACAddress", { value: 1 }).value[0];

// Example: Auto-set SSID based on Serial Number
declare("Device.WiFi.SSID.1.SSID", { value: 1 }, { value: "Kilusi-" + serial.slice(-4) });
declare("Device.WiFi.SSID.1.Enable", { value: 1 }, { value: true });

log("Provisioned " + model + " [" + serial + "]");
