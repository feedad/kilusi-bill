#!/usr/bin/env pwsh

# Simple API test script with proper login

Write-Host "🧪 Testing SNMP API Endpoints`n" -ForegroundColor Cyan

# Step 1: Login
Write-Host "🔐 Step 1: Login..." -ForegroundColor Yellow
try {
    $loginResponse = Invoke-WebRequest -Uri "http://localhost:3001/admin/login" `
        -Method POST `
        -Body @{username="admin"; password="admin"} `
        -SessionVariable session `
        -UseBasicParsing
    Write-Host "✅ Login successful`n" -ForegroundColor Green
} catch {
    Write-Host "❌ Login failed: $_" -ForegroundColor Red
    exit 1
}

# Step 2: Test device info
Write-Host "📊 Step 2: Testing /admin/snmp/device-info..." -ForegroundColor Yellow
try {
    $deviceResponse = Invoke-WebRequest -Uri "http://localhost:3001/admin/snmp/device-info" `
        -WebSession $session `
        -UseBasicParsing
    $deviceData = $deviceResponse.Content | ConvertFrom-Json
    
    if ($deviceData.success) {
        Write-Host "✅ Device Info:" -ForegroundColor Green
        Write-Host "   Name: $($deviceData.sysName)"
        Write-Host "   Description: $($deviceData.sysDescr)"
        Write-Host "   Uptime: $($deviceData.uptime)"
        Write-Host "   CPU Load: $($deviceData.cpuLoad)%`n"
    } else {
        Write-Host "❌ Failed: $($deviceData.message)`n" -ForegroundColor Red
    }
} catch {
    Write-Host "❌ Request failed: $_`n" -ForegroundColor Red
}

# Step 3: Test interfaces list
Write-Host "📡 Step 3: Testing /admin/snmp/interfaces..." -ForegroundColor Yellow
try {
    $ifaceResponse = Invoke-WebRequest -Uri "http://localhost:3001/admin/snmp/interfaces" `
        -WebSession $session `
        -UseBasicParsing
    $ifaceData = $ifaceResponse.Content | ConvertFrom-Json
    
    if ($ifaceData.success) {
        Write-Host "✅ Found $($ifaceData.interfaces.Count) interfaces:" -ForegroundColor Green
        foreach ($iface in $ifaceData.interfaces) {
            $status = if ($iface.operStatus -eq 1) { "[UP]" } else { "[DOWN]" }
            Write-Host "   $status $($iface.index): $($iface.name)"
        }
        Write-Host ""
    } else {
        Write-Host "❌ Failed: $($ifaceData.message)`n" -ForegroundColor Red
    }
} catch {
    Write-Host "❌ Request failed: $_`n" -ForegroundColor Red
}

# Step 4: Test traffic data
Write-Host "📊 Step 4: Testing /admin/snmp/traffic?interface=sfp-sfpplus1..." -ForegroundColor Yellow
try {
    $trafficResponse = Invoke-WebRequest -Uri "http://localhost:3001/admin/snmp/traffic?interface=sfp-sfpplus1" `
        -WebSession $session `
        -UseBasicParsing
    $trafficData = $trafficResponse.Content | ConvertFrom-Json
    
    if ($trafficData.success) {
        Write-Host "✅ Traffic Data:" -ForegroundColor Green
        Write-Host "   Interface: $($trafficData.interface)"
        Write-Host "   RX: $([math]::Round($trafficData.rx / 1000000, 2)) Mbps"
        Write-Host "   TX: $([math]::Round($trafficData.tx / 1000000, 2)) Mbps"
        Write-Host "   Timestamp: $($trafficData.timestamp)`n"
    } else {
        Write-Host "❌ Failed: $($trafficData.message)`n" -ForegroundColor Red
    }
} catch {
    Write-Host "❌ Request failed: $_`n" -ForegroundColor Red
}

# Step 5: Test dashboard traffic API
Write-Host "📈 Step 5: Testing /api/dashboard/traffic?interface=sfp-sfpplus1..." -ForegroundColor Yellow
try {
    $dashResponse = Invoke-WebRequest -Uri "http://localhost:3001/api/dashboard/traffic?interface=sfp-sfpplus1" `
        -WebSession $session `
        -UseBasicParsing
    $dashData = $dashResponse.Content | ConvertFrom-Json
    
    if ($dashData.success) {
        Write-Host "✅ Dashboard Traffic:" -ForegroundColor Green
        Write-Host "   Interface: $($dashData.interface)"
        Write-Host "   Mode: $($dashData.mode)"
        Write-Host "   RX: $([math]::Round($dashData.rx / 1000000, 2)) Mbps"
        Write-Host "   TX: $([math]::Round($dashData.tx / 1000000, 2)) Mbps`n"
    } else {
        Write-Host "❌ Failed: $($dashData.message)`n" -ForegroundColor Red
    }
} catch {
    Write-Host "❌ Request failed: $_`n" -ForegroundColor Red
}

# Step 6: Test dashboard interfaces API
Write-Host "📋 Step 6: Testing /api/dashboard/interfaces..." -ForegroundColor Yellow
try {
    $dashIfaceResponse = Invoke-WebRequest -Uri "http://localhost:3001/api/dashboard/interfaces" `
        -WebSession $session `
        -UseBasicParsing
    $dashIfaceData = $dashIfaceResponse.Content | ConvertFrom-Json
    
    if ($dashIfaceData.success) {
        $totalCount = $dashIfaceData.interfaces.Count
        Write-Host "Dashboard Interfaces: $totalCount total" -ForegroundColor Green
        $upCount = ($dashIfaceData.interfaces | Where-Object { $_.running -eq $true }).Count
        $downCount = $totalCount - $upCount
        Write-Host "   [UP]: $upCount interfaces"
        Write-Host "   [DOWN]: $downCount interfaces`n"
        
        # Show first 5 interfaces as sample
        Write-Host "   Sample (first 5):"
        $dashIfaceData.interfaces | Select-Object -First 5 | ForEach-Object {
            $status = if ($_.running) { "[UP]" } else { "[DOWN]" }
            Write-Host "     $status $($_.name)"
        }
        Write-Host ""
    } else {
        Write-Host "❌ Failed: $($dashIfaceData.message)`n" -ForegroundColor Red
    }
} catch {
    Write-Host "❌ Request failed: $_`n" -ForegroundColor Red
}

Write-Host "=" * 60 -ForegroundColor Cyan
Write-Host "✅ API Testing Complete!" -ForegroundColor Green
Write-Host "=" * 60 -ForegroundColor Cyan
Write-Host "`nIf all tests passed, open browser and test:`n"
Write-Host "  Dashboard: http://localhost:3001/admin/dashboard" -ForegroundColor Yellow
Write-Host "  SNMP Page: http://localhost:3001/admin/snmp" -ForegroundColor Yellow
Write-Host "`nPress F12 and check Console tab for any JavaScript errors.`n"
