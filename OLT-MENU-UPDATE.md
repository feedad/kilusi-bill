# OLT Menu Update - Sidebar Navigation

## Overview
Menu OLT Monitoring telah ditambahkan dan dioptimasi di sidebar admin panel dengan visual yang menarik dan mudah diakses.

## Changes Made

### 1. Enhanced OLT Menu Item
**Location:** `views/partials/admin-responsive-sidebar.ejs`

#### Visual Improvements:
- ✅ **Icon**: Changed to `bi-hdd-rack` (lebih representatif untuk OLT)
- ✅ **Color**: Purple gradient (`#667eea`) untuk highlight
- ✅ **Badge**: "NEW" badge untuk menarik perhatian
- ✅ **Border**: Left border purple untuk emphasis
- ✅ **Tooltip**: Hover tooltip dengan informasi vendor support

#### Menu Placement:
```
├── RADIUS Server
├── ─────────────────────
├── NETWORK MONITORING
│   ├── Router Monitor (SNMP)
│   └── OLT Monitoring ⭐ NEW
├── ─────────────────────
└── Billing
```

### 2. Section Grouping
Added "NETWORK MONITORING" section divider to group related monitoring menus:

```html
<div class="sidebar-section-title">
    <small class="text-muted">NETWORK MONITORING</small>
</div>
```

### 3. CSS Styling
Added custom CSS for section titles:

```css
.sidebar-section-title {
    padding: 16px 24px 8px 24px;
    margin-top: 12px;
    border-top: 1px solid rgba(255, 255, 255, 0.1);
}

.sidebar-section-title small {
    font-size: 0.7rem;
    font-weight: 600;
    letter-spacing: 1.5px;
    opacity: 0.6;
}
```

### 4. Menu Features

#### OLT Monitoring Menu:
- **Icon**: 🖥️ `bi-hdd-rack` (server rack icon)
- **Color**: Purple gradient background
- **Badge**: Blue "NEW" badge
- **URL**: `/admin/olt`
- **Active State**: Highlights when on OLT page
- **Tooltip**: Shows supported vendors on hover
- **Responsive**: Works on mobile and desktop

#### Renamed SNMP Menu:
- **Old**: "SNMP Monitor"
- **New**: "Router Monitor"
- **Reason**: More descriptive, differentiates from OLT monitoring

## Visual Preview

```
╔════════════════════════════════════╗
║  📊 Dashboard                      ║
║  📈 Analytics                      ║
║  🖧  GenieACS                       ║
║  🗺️  Map Monitoring                ║
║  🔗 Manajemen ODP                  ║
║  🌐 PPPoE                          ║
║  👤 Profile PPPoE                  ║
║  📡 Profile Hotspot                ║
║  📶 Hotspot                        ║
║  🎫 Voucher                        ║
║  🛡️  RADIUS Server                 ║
║  ────────────────────────────      ║
║  NETWORK MONITORING                ║
║  📊 Router Monitor                 ║
║  🖥️  OLT Monitoring [NEW]         ║ ← Enhanced!
║  ────────────────────────────      ║
║  🧾 Billing                        ║
║  ⚠️  Laporan Gangguan              ║
╚════════════════════════════════════╝
```

## Access Points

### Direct URL:
```
http://localhost:3001/admin/olt
```

### From Sidebar:
1. Login to admin panel
2. Look for "NETWORK MONITORING" section
3. Click "OLT Monitoring" (with purple background)

### From Map:
- Click on OLT markers (purple router icon)
- Click "View Details" in popup
- Redirects to OLT monitoring page

## Features Accessible from Menu

When clicking OLT Monitoring menu, users can:
- ✅ View all configured OLT devices
- ✅ See real-time status (Online/Offline)
- ✅ Monitor uptime and PON port statistics
- ✅ Add new OLT devices (ZTE, Huawei, C-Data, HIOSO, HSGQ)
- ✅ View detailed device information
- ✅ Check PON port status
- ✅ Monitor traffic per port

## Mobile Responsive

The menu works perfectly on mobile devices:
- Sidebar collapses to hamburger menu
- OLT menu item maintains styling
- Touch-friendly with proper spacing
- Badge remains visible on small screens

## Browser Support

- ✅ Chrome/Edge (latest)
- ✅ Firefox (latest)
- ✅ Safari (latest)
- ✅ Mobile browsers (iOS/Android)

## User Benefits

1. **Easy Access**: Single click from any admin page
2. **Visual Distinction**: Purple color makes it stand out
3. **New Feature Badge**: "NEW" badge attracts attention
4. **Grouped Logically**: Under "Network Monitoring" section
5. **Informative Tooltip**: Shows supported vendors
6. **Responsive Design**: Works on all devices

## Future Enhancements

Potential improvements:
- [ ] Add OLT count badge (e.g., "3 devices")
- [ ] Add status indicator (green/red dot)
- [ ] Quick stats tooltip (e.g., "12 PON ports active")
- [ ] Keyboard shortcut (e.g., Alt+O)
- [ ] Notification badge for OLT alerts

## Testing Checklist

- [x] Menu displays correctly on desktop
- [x] Menu displays correctly on mobile
- [x] Active state highlights properly
- [x] Tooltip shows on hover
- [x] Click navigates to /admin/olt
- [x] Badge "NEW" is visible
- [x] Purple gradient background renders
- [x] Section title shows correctly

## Summary

The OLT Monitoring menu is now:
✅ **Visible** - Prominent placement with eye-catching design
✅ **Accessible** - One click away from any admin page
✅ **Organized** - Grouped with related monitoring menus
✅ **Informative** - Tooltip explains functionality
✅ **Responsive** - Works on all screen sizes

Users can now easily access OLT monitoring features without searching!
