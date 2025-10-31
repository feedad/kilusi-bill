# Quick Reference: OLT SNMP OID Testing

## Vendor Detection

```bash
# Auto-detect vendor
node detect-olt-vendor.js <OLT_IP> [community]

# Example
node detect-olt-vendor.js 192.168.1.1 public
```

## Manual Testing dengan snmpwalk

### ZTE OLT (C300/C320)
```bash
# System info
snmpwalk -v2c -c public <IP> system

# ONU status
snmpwalk -v2c -c public <IP> 1.3.6.1.4.1.3902.1012.3.28.2.1.3

# ONU count per PON
snmpwalk -v2c -c public <IP> 1.3.6.1.4.1.3902.1012.3.28.1.1.2

# ONU RX power
snmpwalk -v2c -c public <IP> 1.3.6.1.4.1.3902.1012.3.28.2.1.25
```

### Huawei OLT (MA5608T/MA5680T)
```bash
# System info
snmpwalk -v2c -c public <IP> system

# ONU status
snmpwalk -v2c -c public <IP> 1.3.6.1.4.1.2011.6.128.1.1.2.46.1.15

# ONU count
snmpwalk -v2c -c public <IP> 1.3.6.1.4.1.2011.6.128.1.1.2.43.1.3

# ONU RX power
snmpwalk -v2c -c public <IP> 1.3.6.1.4.1.2011.6.128.1.1.2.51.1.4
```

### C-Data OLT (FD1000 Series)
```bash
# System info
snmpwalk -v2c -c public <IP> system

# ONU status (1=online)
snmpwalk -v2c -c public <IP> 1.3.6.1.4.1.34592.1.3.4.1.5.1.1.2

# ONU count per PON
snmpwalk -v2c -c public <IP> 1.3.6.1.4.1.34592.1.3.4.1.2.1.1.13

# ONU RX power
snmpwalk -v2c -c public <IP> 1.3.6.1.4.1.34592.1.3.4.1.5.1.1.8

# ONU distance
snmpwalk -v2c -c public <IP> 1.3.6.1.4.1.34592.1.3.4.1.5.1.1.9

# PON interface index
snmpwalk -v2c -c public <IP> 1.3.6.1.4.1.34592.1.3.4.1.2.1.1.1
```

### HIOSO OLT
```bash
# System info
snmpwalk -v2c -c public <IP> system

# ONU status (1=online, 2=offline, 3=LOS)
snmpwalk -v2c -c public <IP> 1.3.6.1.4.1.6688.1.1.1.4.2.3.1.3

# ONU count
snmpwalk -v2c -c public <IP> 1.3.6.1.4.1.6688.1.1.1.4.2.1.1.8

# ONU RX power (dBm × 100)
snmpwalk -v2c -c public <IP> 1.3.6.1.4.1.6688.1.1.1.4.2.3.1.11

# ONU distance (meters)
snmpwalk -v2c -c public <IP> 1.3.6.1.4.1.6688.1.1.1.4.2.3.1.12

# PON description
snmpwalk -v2c -c public <IP> 1.3.6.1.4.1.6688.1.1.1.4.2.1.1.2
```

### HSGQ OLT (Guangzhou Shengxi)
```bash
# System info
snmpwalk -v2c -c public <IP> system

# ONU status (1=up, 2=down)
snmpwalk -v2c -c public <IP> 1.3.6.1.4.1.5875.800.128.30.1.3.3.1.4

# ONU count per slot/port
snmpwalk -v2c -c public <IP> 1.3.6.1.4.1.5875.800.128.30.1.3.2.1.5

# ONU RX power (dBm)
snmpwalk -v2c -c public <IP> 1.3.6.1.4.1.5875.800.128.30.1.3.3.1.15

# ONU distance (meters)
snmpwalk -v2c -c public <IP> 1.3.6.1.4.1.5875.800.128.30.1.3.3.1.13

# ONU type
snmpwalk -v2c -c public <IP> 1.3.6.1.4.1.5875.800.128.30.1.3.3.1.7
```

## Standard MIB-II (All Vendors)

```bash
# Interface list
snmpwalk -v2c -c public <IP> 1.3.6.1.2.1.2.2.1.2

# Interface status (1=up, 2=down)
snmpwalk -v2c -c public <IP> 1.3.6.1.2.1.2.2.1.8

# Interface traffic (32-bit)
snmpwalk -v2c -c public <IP> 1.3.6.1.2.1.2.2.1.10  # RX
snmpwalk -v2c -c public <IP> 1.3.6.1.2.1.2.2.1.16  # TX

# Interface traffic (64-bit)
snmpwalk -v2c -c public <IP> 1.3.6.1.2.1.31.1.1.1.6   # RX
snmpwalk -v2c -c public <IP> 1.3.6.1.2.1.31.1.1.1.10  # TX
```

## Enterprise OID Reference

| Vendor | Enterprise OID | Company |
|--------|---------------|---------|
| ZTE | 3902 | ZTE Corporation |
| Huawei | 2011 | Huawei Technologies |
| C-Data | 34592 | C-Data Technology |
| HIOSO | 6688 | HIOSO Technology |
| HSGQ | 5875 | Guangzhou Shengxi |
| Fiberhome | 5875 | FiberHome Networks |

## Common Issues

### Issue: "Timeout" error
```bash
# Test basic connectivity
ping <OLT_IP>

# Test SNMP port
nmap -sU -p 161 <OLT_IP>

# Test with snmpget
snmpget -v2c -c public <OLT_IP> system.sysDescr.0
```

### Issue: "No Such Instance" error
- OID tidak ada di device
- Cek vendor benar atau tidak
- Beberapa model OLT menggunakan OID berbeda

### Issue: "Authentication failure"
- SNMP community string salah
- Cek di konfigurasi OLT
- Default biasanya: `public` (read) atau `private` (write)

## Testing Workflow

1. **Detect vendor:**
   ```bash
   node detect-olt-vendor.js <IP> <community>
   ```

2. **Test basic info:**
   ```bash
   node test-olt-monitor.js <IP> <community> <vendor>
   ```

3. **Test specific OID:**
   ```bash
   snmpwalk -v2c -c <community> <IP> <OID>
   ```

4. **Add to monitoring:**
   - Go to http://localhost:3001/admin/olt
   - Click "Add OLT Device"
   - Fill in detected information
   - Add coordinates for map display

## Vendor-Specific Notes

### C-Data
- PON index format: `slot.port.onu`
- Status: 1=online, 0=offline
- RX power: dBm (negative values)
- Enterprise OID: 34592

### HIOSO
- Status: 1=online, 2=offline, 3=LOS
- RX power: dBm × 100 (divide by 100 to get actual dBm)
- Distance: in meters
- Enterprise OID: 6688

### HSGQ
- Slot/port architecture: slot/port/onu
- Status: 1=up, 2=down
- RX power: dBm (direct value)
- Distance: meters
- Enterprise OID: 5875

## Example Output Interpretation

### ONU Status Values

**ZTE/Huawei:**
- 1 = Online/Up
- 2 = Offline/Down
- 3+ = Various error states

**C-Data:**
- 1 = Online
- 0 = Offline

**HIOSO:**
- 1 = Online
- 2 = Offline
- 3 = LOS (Loss of Signal)

**HSGQ:**
- 1 = Up
- 2 = Down

### RX Power Values

**Normal Range:** -15 dBm to -27 dBm
**Warning:** < -27 dBm
**Critical:** < -30 dBm

**Note:** Some vendors return power × 100:
- Value: -2500 → Actual: -25.00 dBm

---

**Quick Reference Card**

| Command | Purpose |
|---------|---------|
| `snmpwalk -v2c -c public IP system` | Get system info |
| `node detect-olt-vendor.js IP` | Auto-detect vendor |
| `node test-olt-monitor.js IP public vendor` | Full test |
| `snmpget -v2c -c public IP OID` | Get single value |
| `snmpwalk -v2c -c public IP OID` | Get multiple values |

Save this file for reference when troubleshooting OLT connectivity!
