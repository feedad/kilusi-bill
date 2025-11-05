# 🚀 FreeRADIUS Production Deployment - SOLUSI MIKROTIK CONNECTION REFUSED

## 🔍 **Root Cause Analysis**

Berdasarkan investigasi mendalam, masalah "Connection refused" di MikroTik disebabkan oleh:

1. **Unknown Client Error**: FreeRADIUS tidak mengenali IP 172.22.10.156
2. **Configuration Loading Issues**: Masalah loading clients.conf
3. **Port Binding**: FreeRADIUS tidak binding ke interface yang benar
4. **SQL Module Conflict**: Konfigurasi SQL menyebabkan startup failure

## ✅ **SOLUTION: Production-Ready FreeRADIUS Setup**

### 1. Konfigurasi Client Final

```conf
# /home/kilusi-bill/freeradius-docker/clients-final.conf
client mikrotik_main {
    ipaddr = 172.22.10.156/32    # IP MikroTik Anda
    secret = testing123          # Secret key
    shortname = MT-156          # Identifier
    nastype = mikrotik          # Tipe NAS
}

client localhost {
    ipaddr = 127.0.0.1/32
    secret = testing123
    shortname = localhost
    nastype = other
}

# Allow any untuk testing (REMOVE DI PRODUCTION!)
client any_client {
    ipaddr = 0.0.0.0/0
    secret = testing123
    shortname = any
    nastype = other
}
```

### 2. Docker Container Production Command

```bash
# Stop semua container yang berjalan
docker stop $(docker ps -q --filter "ancestor=kilusi-freeradius:3.2.3")
docker rm $(docker ps -aq --filter "ancestor=kilusi-freeradius:3.2.3")

# Start production container
docker run -d --name kilusi-production \
  --restart unless-stopped \
  -p 1812:1812/udp \
  -p 1813:1813/udp \
  -p 3799:3799/udp \
  -v /home/kilusi-bill/freeradius-docker/clients-final.conf:/etc/freeradius/3.0/clients.conf \
  kilusi-freeradius:3.2.3
```

### 3. Konfigurasi MikroTik

**WINBOX → RADIUS → (+) Add:**
```
Service: PPP, Login
Address: 172.22.10.25    # IP server FreeRADIUS
Secret: testing123
Auth Port: 1812
Acc Port: 1813
Timeout: 300ms
Called ID: ""
Domain: ""
```

### 4. Testing Commands

```bash
# Test dari server
echo "User-Name=apptest,User-Password=1234567" | radclient 127.0.0.1:1812 auth testing123

# Test dari luar (ganti 172.22.10.25 dengan IP server)
echo "User-Name=apptest,User-Password=1234567" | radclient 172.22.10.25:1812 auth testing123

# Monitor traffic
tcpdump -i any -n host 172.22.10.156 and port 1812

# Cek container logs
docker logs kilusi-production -f
```

### 5. Verification Steps

1. **Container Status**:
   ```bash
   docker ps | grep kilusi-production
   # Harus menunjukkan status "Up"
   ```

2. **Port Listening**:
   ```bash
   netstat -ulnp | grep :1812
   # Harus menunjukkan port 1812 UDP listening
   ```

3. **Configuration Check**:
   ```bash
   docker exec kilusi-production freeradius -C
   # Harus "Configuration appears to be OK"
   ```

## 🚨 **IMPORTANT NOTES**

### Security:
- **REMOVE** `client any_client` di production!
- Ganti `testing123` dengan secret yang kuat
- Limit IP access dengan firewall

### Production:
- Gunakan `--restart unless-stopped`
- Monitor dengan docker logs
- Setup log rotation
- Backup konfigurasi

### Troubleshooting:
- Jika masih "unknown client", cek IP di clients.conf
- Jika timeout, cek firewall port 1812/1813
- Jika container crash, cek configuration dengan `freeradius -C`

## 📞 **Next Steps**

1. Deploy dengan command di atas
2. Test koneksi dari MikroTik
3. Verifikasi authentication works
4. Monitor logs untuk troubleshooting
5. Remove `client any_client` untuk production

**FreeRADIUS siap production dan akan menggantikan Node.js RADIUS server!**