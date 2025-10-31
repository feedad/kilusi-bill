# RADIUS Server Dependencies Update

## Dependencies yang Perlu Ditambahkan

Tambahkan ke `package.json` di section `dependencies`:

```json
{
  "dependencies": {
    "@hapi/boom": "^10.0.1",
    "@whiskeysockets/baileys": "^6.7.17",
    "axios": "^1.6.7",
    "dotenv": "^16.3.1",
    "ejs": "^3.1.10",
    "express": "^4.18.2",
    "express-session": "^1.18.1",
    "leaflet": "^1.9.4",
    "multer": "^2.0.1",
    "mysql2": "^3.9.7",
    "node-routeros": "^1.6.9",
    "pino": "^8.11.0",
    "qrcode-terminal": "^0.12.0",
    "winston": "^3.8.2",
    "sqlite3": "^5.1.7",
    "radius": "^1.1.4"
  }
}
```

## Installation Command

```bash
cd d:\Project\kilusi-bill
npm install sqlite3 radius --save
```

## Verify Installation

Check `package.json` after installation:

```bash
npm list sqlite3
npm list radius
```

Expected output:
```
├── sqlite3@5.1.7
└── radius@1.1.4
```

## Alternative: Manual Update

If npm install fails, manually add to package.json then run:

```bash
npm install
```

## Dependencies Info

### sqlite3
- **Version**: ^5.1.7 or latest
- **Purpose**: SQLite database driver for Node.js
- **License**: BSD-3-Clause
- **Repository**: https://github.com/TryGhost/node-sqlite3

### radius
- **Version**: ^1.1.4 or latest
- **Purpose**: RADIUS protocol implementation
- **License**: MIT
- **Repository**: https://github.com/retailnext/node-radius

## Build Requirements

### Windows
- Python 2.7 or 3.x
- Visual Studio Build Tools
- Node.js native addon build tools

Install with:
```bash
npm install --global windows-build-tools
```

Or use:
```bash
npm install --global node-gyp
```

### Linux
```bash
sudo apt-get install build-essential python3
```

### macOS
```bash
xcode-select --install
```

## Troubleshooting

### Error: node-gyp rebuild failed

Solution:
```bash
npm install --global node-gyp
npm config set python python3
npm install sqlite3 radius --save
```

### Error: Permission denied

Solution (Linux/Mac):
```bash
sudo npm install sqlite3 radius --save
```

Windows (Run as Administrator):
```bash
npm install sqlite3 radius --save
```

### Error: Package not found

Solution:
```bash
npm cache clean --force
npm install sqlite3 radius --save
```

## Verification

After successful installation, verify:

```javascript
// Test SQLite
const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database(':memory:');
console.log('✅ SQLite3 loaded successfully');

// Test RADIUS
const radius = require('radius');
console.log('✅ RADIUS loaded successfully');
```

Save as `test-deps.js` and run:
```bash
node test-deps.js
```

Expected output:
```
✅ SQLite3 loaded successfully
✅ RADIUS loaded successfully
```

## Package Sizes

- **sqlite3**: ~5 MB (includes native binaries)
- **radius**: ~100 KB

Total additional size: ~5.1 MB

## Production Deployment

For production, use:

```bash
npm install --production
```

Or specify exact versions in package.json:

```json
{
  "dependencies": {
    "sqlite3": "5.1.7",
    "radius": "1.1.4"
  }
}
```

## Docker Deployment

If using Docker, add to Dockerfile:

```dockerfile
RUN npm install sqlite3 radius --build-from-source
```

## Notes

1. **sqlite3** may need to rebuild for your platform
2. **radius** is pure JavaScript, no native dependencies
3. Both packages are stable and actively maintained
4. Compatible with Node.js 14.x and above

---

**Last Updated**: October 24, 2025
**Status**: Ready for installation
