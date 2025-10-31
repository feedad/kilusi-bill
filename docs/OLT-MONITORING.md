# OLT Monitoring via SNMP

## Overview

Fitur monitoring OLT (Optical Line Terminal) via SNMP yang terintegrasi dengan network mapping. Mendukung multiple OLT devices dari berbagai vendor.

## Features

### 1. **Multi-Vendor Support**
- ✅ ZTE OLT (C300/C320 series)
- ✅ Huawei OLT (MA5608T/MA5680T)
- ✅ C-Data OLT (FD1000 series)
- ✅ HIOSO OLT
- ✅ HSGQ OLT (Guangzhou Shengxi)
- ✅ Fiberhome OLT
- ✅ Generic SNMP (vendor lain)

### 2. **Real-time Monitoring**
- Device information (name, uptime, location)
- PON port status (up/down)
- Port traffic statistics
- Active port count
- ONU count per port (vendor-specific)

### 3. **Network Mapping Integration**
- OLT locations displayed on map
- Visual distinction (purple icon for OLT vs blue for ONU)
- Status indicator (green dot = online, red = offline)
- Click to view details
- Direct link to detailed monitoring page

### 4. **Management Features**
- Add/Edit/Delete OLT devices
- Configure SNMP settings per device
- Set geographic location for mapping
- Auto-refresh every 10 seconds

## Configuration

### Add OLT Device

1. **Via UI:**
   - Navigate to: `/admin/olt`
   - Click "Add OLT Device"
   - Fill in form:
     - Device Name: e.g., "OLT-Main"
     - IP Address: e.g., "192.168.1.1"
     - Vendor: ZTE/Huawei/Fiberhome/Generic
     - SNMP Community: default "public"
     - SNMP Port: default "161"
     - Location: physical location description
     - Latitude/Longitude: for map display

2. **Via settings.json:**

```json
{
  "olt_devices": [
    {
      "name": "OLT-Main",
      "host": "192.168.1.1",
      "vendor": "zte",
      "community": "public",
      "snmp_version": "2c",
      "snmp_port": "161",
      "location": "Tower A, Floor 2",
      "latitude": "-6.2088",
      "longitude": "106.8456"
    }
  ]
}
```

## API Endpoints

### Get OLT Devices List
```
GET /admin/olt/devices
```

**Response:**
```json
{
  "success": true,
  "devices": [
    {
      "id": 0,
      "name": "OLT-Main",
      "host": "192.168.1.1",
      "vendor": "zte",
      "location": "Tower A"
    }
  ]
}
```

### Get OLT Device Info
```
GET /admin/olt/:id/info
```

**Response:**
```json
{
  "success": true,
  "device": {
    "id": 0,
    "name": "OLT-Main",
    "deviceName": "ZTE-C320",
    "description": "ZTE C320 OLT",
    "location": "Tower A",
    "uptime": "45d 12h 30m",
    "uptimeSeconds": 3928800
  }
}
```

### Get PON Ports
```
GET /admin/olt/:id/ports
```

**Response:**
```json
{
  "success": true,
  "ports": [
    {
      "index": 1,
      "name": "gpon-olt_1/1/1",
      "status": "up",
      "operStatus": 1
    }
  ],
  "total": 16
}
```

### Get PON Port Traffic
```
GET /admin/olt/:id/port/:portIndex/traffic
```

**Response:**
```json
{
  "success": true,
  "rxBytes": 123456789,
  "txBytes": 987654321
}
```

### Get ONUs on Port
```
GET /admin/olt/:id/port/:portIndex/onus
```

**Response:**
```json
{
  "success": true,
  "onus": [
    {
      "id": "1",
      "status": "online",
      "portIndex": 1
    }
  ],
  "total": 5
}
```

### Get Complete Statistics
```
GET /admin/olt/:id/statistics
```

**Response:**
```json
{
  "success": true,
  "deviceId": 0,
  "deviceName": "OLT-Main",
  "device": {
    "deviceName": "ZTE-C320",
    "uptime": "45d 12h 30m"
  },
  "ports": [
    {
      "index": 1,
      "name": "gpon-olt_1/1/1",
      "status": "up",
      "rxBytes": 123456789,
      "txBytes": 987654321
    }
  ],
  "totalPorts": 16,
  "activePorts": 12
}
```

### Get OLT Devices for Map
```
GET /admin/map/olt-devices
```

**Response:**
```json
{
  "success": true,
  "devices": [
    {
      "id": 0,
      "type": "olt",
      "name": "OLT-Main",
      "host": "192.168.1.1",
      "vendor": "zte",
      "location": {
        "lat": -6.2088,
        "lng": 106.8456,
        "address": "Tower A, Floor 2"
      },
      "status": {
        "online": true,
        "uptime": "45d 12h 30m",
        "totalPorts": 16,
        "activePorts": 12
      }
    }
  ],
  "total": 1
}
```

### Add OLT Device
```
POST /admin/olt/device/add

Body:
{
  "name": "OLT-Main",
  "host": "192.168.1.1",
  "vendor": "zte",
  "community": "public",
  "snmp_version": "2c",
  "snmp_port": "161",
  "location": "Tower A",
  "latitude": "-6.2088",
  "longitude": "106.8456"
}
```

### Update OLT Device
```
POST /admin/olt/device/:id/update

Body: (same as add)
```

### Delete OLT Device
```
POST /admin/olt/device/:id/delete
```

## SNMP OIDs Used

### Standard MIB-II (all vendors)
- `1.3.6.1.2.1.1.1.0` - sysDescr (device description)
- `1.3.6.1.2.1.1.3.0` - sysUpTime (uptime)
- `1.3.6.1.2.1.1.5.0` - sysName (hostname)
- `1.3.6.1.2.1.1.6.0` - sysLocation (location)
- `1.3.6.1.2.1.2.2.1.2` - ifDescr (interface description)
- `1.3.6.1.2.1.2.2.1.8` - ifOperStatus (operational status)
- `1.3.6.1.2.1.31.1.1.1.6` - ifHCInOctets (64-bit RX counter)
- `1.3.6.1.2.1.31.1.1.1.10` - ifHCOutOctets (64-bit TX counter)

### ZTE-specific OIDs
- `1.3.6.1.4.1.3902.1012.3.28.1.1.2` - ONU count per port
- `1.3.6.1.4.1.3902.1012.3.28.2.1.3` - ONU status
- `1.3.6.1.4.1.3902.1012.3.28.2.1.25` - ONU RX power
- `1.3.6.1.4.1.3902.1012.3.28.2.1.8` - ONU distance

### Huawei-specific OIDs
- `1.3.6.1.4.1.2011.6.128.1.1.2.43.1.3` - ONU count
- `1.3.6.1.4.1.2011.6.128.1.1.2.46.1.15` - ONU status
- `1.3.6.1.4.1.2011.6.128.1.1.2.51.1.4` - ONU RX power
- `1.3.6.1.4.1.2011.6.128.1.1.2.53.1.1` - ONU distance

### C-Data-specific OIDs (FD1000 series)
- `1.3.6.1.4.1.34592.1.3.4.1.2.1.1.13` - ONU count per PON
- `1.3.6.1.4.1.34592.1.3.4.1.5.1.1.2` - ONU status (1=online)
- `1.3.6.1.4.1.34592.1.3.4.1.5.1.1.8` - ONU RX power
- `1.3.6.1.4.1.34592.1.3.4.1.5.1.1.9` - ONU distance

### HIOSO-specific OIDs
- `1.3.6.1.4.1.6688.1.1.1.4.2.1.1.8` - ONU count
- `1.3.6.1.4.1.6688.1.1.1.4.2.3.1.3` - ONU status (1=online, 2=offline, 3=los)
- `1.3.6.1.4.1.6688.1.1.1.4.2.3.1.11` - ONU RX power
- `1.3.6.1.4.1.6688.1.1.1.4.2.3.1.12` - ONU distance

### HSGQ-specific OIDs
- `1.3.6.1.4.1.5875.800.128.30.1.3.2.1.5` - ONU count per slot/port
- `1.3.6.1.4.1.5875.800.128.30.1.3.3.1.4` - ONU operational status
- `1.3.6.1.4.1.5875.800.128.30.1.3.3.1.15` - ONU RX power (dBm)
- `1.3.6.1.4.1.5875.800.128.30.1.3.3.1.13` - ONU distance (m)
- `1.3.6.1.4.1.5875.800.128.30.1.3.3.1.7` - ONU type

## Usage

### Access OLT Monitoring Dashboard
```
http://localhost:3001/admin/olt
```

### View on Network Map
```
http://localhost:3001/admin/map
```

OLT devices akan muncul dengan icon router (purple/red) dengan status indicator.

## Features Summary

| Feature | Status |
|---------|--------|
| Multiple OLT support | ✅ |
| SNMP v1/v2c/v3 | ✅ (v1/v2c) |
| Device info | ✅ |
| PON port status | ✅ |
| Port traffic stats | ✅ |
| ONU discovery (ZTE) | ✅ |
| ONU discovery (Huawei) | ✅ |
| Network mapping | ✅ |
| Real-time monitoring | ✅ |
| Auto-refresh | ✅ |
| Add/Edit/Delete | ✅ |

## Vendor Support

### ZTE OLT
- ✅ C300/C320 series
- ✅ PON port detection
- ✅ ONU status per port (1=online, other=offline)
- ✅ RX power monitoring
- ✅ ONU distance measurement

### Huawei OLT
- ✅ MA5608T/MA5680T series
- ✅ PON port detection
- ✅ ONU status per port (1=online, other=offline)
- ✅ RX power monitoring
- ✅ ONU distance measurement

### C-Data OLT
- ✅ FD1000 series (FD1104/FD1108/FD1116)
- ✅ PON interface detection
- ✅ ONU status per port (1=online, other=offline)
- ✅ RX power monitoring (dBm)
- ✅ ONU distance measurement (meters)
- ✅ PON interface index support

### HIOSO OLT
- ✅ HIOSO GPON OLT series
- ✅ PON port detection
- ✅ Enhanced ONU status (1=online, 2=offline, 3=LOS)
- ✅ RX power monitoring
- ✅ ONU distance measurement
- ✅ PON description support

### HSGQ OLT (Guangzhou Shengxi)
- ✅ HSGQ GPON/EPON series
- ✅ Slot/port based architecture
- ✅ ONU status per port (1=up, 2=down)
- ✅ RX power monitoring (dBm)
- ✅ ONU distance measurement (meters)
- ✅ ONU type detection

### Fiberhome OLT
- ✅ Basic device info
- ✅ PON port detection
- ⚠️ Limited ONU discovery (standard SNMP only)

### Generic/Other
- ✅ Basic device info
- ✅ Interface statistics
- ⚠️ Limited ONU discovery (requires vendor-specific MIBs)

## Troubleshooting

### OLT shows offline
1. Check SNMP connectivity: `snmpwalk -v2c -c public <OLT_IP> system`
2. Verify SNMP community string
3. Check firewall rules (UDP port 161)
4. Verify SNMP is enabled on OLT

### No PON ports detected
1. Check if OLT uses standard interface naming
2. Verify PON interfaces are present in ifDescr table
3. Try different SNMP version (1 vs 2c)

### ONU count shows 0 (vendor-specific)
1. Verify correct vendor selected (ZTE/Huawei/C-Data/HIOSO/HSGQ)
2. Check if OLT model supports standard OIDs
3. May need vendor-specific MIB file
4. Try SNMP walk to verify OID availability:
   ```bash
   # For C-Data
   snmpwalk -v2c -c public <OLT_IP> 1.3.6.1.4.1.34592.1.3.4.1.5.1.1.2
   
   # For HIOSO
   snmpwalk -v2c -c public <OLT_IP> 1.3.6.1.4.1.6688.1.1.1.4.2.3.1.3
   
   # For HSGQ
   snmpwalk -v2c -c public <OLT_IP> 1.3.6.1.4.1.5875.800.128.30.1.3.3.1.4
   ```

### Vendor-Specific Notes

**C-Data OLT:**
- Enterprise OID: 34592
- Supports FD1000 series (FD1104/FD1108/FD1116)
- PON index format: slot.port.onu
- Status values: 1=online, 0=offline

**HIOSO OLT:**
- Enterprise OID: 6688
- Status values: 1=online, 2=offline, 3=LOS (Loss of Signal)
- RX power in dBm × 100 (divide by 100)
- Distance in meters

**HSGQ OLT:**
- Enterprise OID: 5875
- Slot/port architecture (e.g., 1/1/1 = slot 1, port 1, ONU 1)
- Status values: 1=up, 2=down
- RX power in dBm
- Distance in meters

## Integration with GenieACS

OLT monitoring complements GenieACS ONU monitoring:

- **OLT level**: Port status, uplink traffic, device health
- **ONU level** (via GenieACS): Individual customer devices, RX power, distance

Together they provide complete FTTH network visibility.

---

**Implementation Date**: October 24, 2025  
**Module**: config/olt-snmp-monitor.js  
**Routes**: routes/adminOLT.js  
**View**: views/admin-olt.ejs  
**Status**: ✅ Production Ready
