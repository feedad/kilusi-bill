const express = require('express');
const router = express.Router();
const { logger } = require('../../../config/logger');
const { query } = require('../../../config/database');
const { asyncHandler } = require('../../../middleware/response');
const acs = require('../../../config/kilusi_acs');

function enrichWithCustomer(devices) {
    const ids = devices.filter(d => d.pppoe_username && d.pppoe_username !== '-');
    if (ids.length === 0) return;
    const placeholders = ids.map((_, i) => `$${i + 1}`);
    const values = ids.map(d => d.pppoe_username.split('@')[0]);
    return query(
        `SELECT c.id, c.name, c.phone, s.service_number, s.isolir_date,
                td.pppoe_username
         FROM services s
         JOIN customers c ON c.id = s.customer_id
         LEFT JOIN technical_details td ON td.service_id = s.id
         WHERE td.pppoe_username IS NOT NULL
           AND REPLACE(td.pppoe_username, '@weconnect.id', '') = ANY($1)`,
        [values]
    ).then(r => {
        const map = {};
        r.rows.forEach(row => {
            const key = row.pppoe_username.split('@')[0];
            map[key] = row;
        });
        devices.forEach(d => {
            const key = d.pppoe_username?.split('@')[0];
            const c = map[key];
            if (c) {
                d.customer_name = c.name;
                d.customer_phone = c.phone;
                d.service_number = c.service_number;
                d.isolir_date = c.isolir_date;
                d.customerId = c.id;
                d.customer = {
                    name: c.name,
                    pppoe_username: d.pppoe_username,
                    phone: c.phone
                };
            }
        });
    }).catch(err => logger.error('Failed to enrich customer data:', err));
}

function deviceToListItem(dev) {
    const lastInform = dev.last_inform ? new Date(dev.last_inform).getTime() : 0;
    const now = Date.now();
    const diffMin = (now - lastInform) / 60000;
    const status = diffMin > 10 ? 'offline' : diffMin > 5 ? 'warning' : 'online';

    // Extract params for list display
    const params = dev.params || {};
    let ssid = '-', password = '-', rxPower = '-', userKonek = 0;
    for (const [key, val] of Object.entries(params)) {
        const lastDot = key.lastIndexOf('.');
        const suffix = lastDot >= 0 ? key.slice(lastDot + 1) : key;
        if (suffix === 'SSID' && !key.includes('SSIDHide') && !key.includes('SSIDIndex')) ssid = val;
        if (suffix === 'KeyPassphrase') password = val;
        if (suffix === 'TotalAssociations') userKonek = parseInt(val) || 0;
        if (suffix === 'RXPower' || suffix === 'RxPower') rxPower = val;
    }

    return {
        _id: dev.id,
        id: dev.id,
        serial: dev.sn,
        serialNumber: dev.sn,
        model: dev.product_class,
        productClass: dev.product_class,
        manufacturer: dev.manufacturer,
        oui: dev.oui,
        hardware_version: dev.hardware_version || '-',
        software_version: dev.software_version || '-',
        ip_address: dev.ip_address || '-',
        mac_address: dev.mac_address || '-',
        lastInform: dev.last_inform || new Date().toISOString(),
        pppoeUsername: dev.pppoe_username || '-',
        ssid,
        password,
        userKonek,
        rxPower,
        tag: dev.pppoe_username || '-',
        customerId: dev.customerId || null,
        customerName: dev.customer_name || '-',
        tags: [],
        connectionState: status === 'online' ? 'connected' : 'disconnected',
        customer: dev.customerId ? {
            name: dev.customer_name,
            pppoe_username: dev.pppoe_username,
            phone: dev.customer_phone
        } : undefined,
        device_status: status
    };
}

function enrichDeviceDetail(dev) {
    const lastInform = dev.last_inform ? new Date(dev.last_inform).getTime() : 0;
    const now = Date.now();
    const diffMin = (now - lastInform) / 60000;
    const status = diffMin > 10 ? 'offline' : diffMin > 5 ? 'warning' : 'online';

    // Extract WAN/WiFi/optical from raw params blob if available
    const params = dev.params || {};
    const wanConns = [];
    const wifiConfigs = [];
    let rxPower, txPower, temperature, ponMode;

    for (const [key, val] of Object.entries(params)) {
        const lastDot = key.lastIndexOf('.');
        const suffix = lastDot >= 0 ? key.slice(lastDot + 1) : key;

        // Optical
        if (suffix === 'RXPower' || suffix === 'RxPower') rxPower = val;
        if (suffix === 'TXPower' || suffix === 'TxPower') txPower = val;
        if (suffix === 'Temperature' || suffix === 'temperature') temperature = val;
        if ((suffix === 'PON' || suffix === 'pon') && !key.includes('Interface')) ponMode = val;

        // WAN
        const wanMatch = key.match(/WAN(?:PPP|IP)Connection\.(\d+)\./);
        if (wanMatch) {
            const idx = parseInt(wanMatch[1]);
            if (!wanConns[idx]) wanConns[idx] = { wan_index: idx };
            if (suffix === 'Username') wanConns[idx].username = val;
            if (suffix === 'ExternalIPAddress') wanConns[idx].ip_address = val;
            if (suffix === 'MACAddress') wanConns[idx].mac_address = val;
            if (suffix === 'ConnectionType') wanConns[idx].connection_type = val;
            if (suffix === 'Uptime') wanConns[idx].uptime = parseInt(val) || 0;
            if (key.includes('VLANID')) wanConns[idx].vlan_id = parseInt(val) || 0;
        }

        // WiFi
        const wifiMatch = key.match(/WLANConfiguration\.(\d+)\./);
        if (wifiMatch) {
            const idx = parseInt(wifiMatch[1]);
            if (!wifiConfigs[idx]) wifiConfigs[idx] = { ssid_index: idx };
            if (suffix === 'SSID' && !key.includes('SSIDHide') && !key.includes('SSIDIndex')) wifiConfigs[idx].ssid = val;
            if (suffix === 'KeyPassphrase') wifiConfigs[idx].password = val;
            if (suffix === 'Enable') wifiConfigs[idx].enabled = val === '1' || val === 'true';
            if (suffix === 'BeaconType') wifiConfigs[idx].security_mode = val;
            if (suffix === 'Channel') wifiConfigs[idx].channel = parseInt(val) || 0;
            if (suffix === 'TotalAssociations') wifiConfigs[idx].active_clients = parseInt(val) || 0;
        }
    }

    return {
        ...dev,
        status,
        device_status: status,
        connectionState: status === 'online' ? 'connected' : 'disconnected',
        rx_power: rxPower || dev.rx_power,
        tx_power: txPower || dev.tx_power,
        temperature: temperature || dev.temperature,
        pon_mode: ponMode || dev.pon_mode,
        wifi_configs: wifiConfigs.filter(Boolean),
        wan_connections: wanConns.filter(Boolean),
    };
}

router.get('/devices', asyncHandler(async (req, res) => {
    const { search, status, limit = '100', offset = '0' } = req.query;

    let acsData;
    try {
        acsData = await acs.getDevices({ search, status, limit, offset });
    } catch (err) {
        logger.error('Failed to fetch from Kilusi-ACS:', err.message);
        return res.sendSuccess({
            devices: [],
            stats: { total_devices: 0, online_devices: 0, offline_devices: 0, warning_devices: 0, total_customers: 0 }
        }, { error: 'Kilusi-ACS connection failed' });
    }

    const devices = (acsData.devices || []).map(deviceToListItem);

    await enrichWithCustomer(devices);

    const stats = {
        total_devices: acsData.total || devices.length,
        online_devices: devices.filter(d => d.device_status === 'online').length,
        offline_devices: devices.filter(d => d.device_status === 'offline').length,
        warning_devices: devices.filter(d => d.device_status === 'warning').length,
        total_customers: devices.filter(d => d.customerId).length
    };

    let filtered = devices;
    if (status && status !== 'all') {
        filtered = filtered.filter(d => d.device_status === status);
    }

    return res.sendSuccess({ devices: filtered, stats }, {
        limit: parseInt(limit), search: search || undefined, status: status || undefined
    });
}));

router.get('/devices/:id', asyncHandler(async (req, res) => {
    const { id } = req.params;

    try {
        const detail = await acs.getDevice(id);
        const device = detail.device || detail;
        const vendor = detail.vendor || null;
        const enriched = enrichDeviceDetail(device);

        // Attach vendor info
        enriched.vendor_info = vendor;

        // Fetch sub-resource data to supplement params-parsed data
        const [optical, wifi, wan, lan, hosts] = await Promise.all([
            acs.getDeviceOptical(id, 1).catch(() => ({ stats: [] })),
            acs.getDeviceWiFi(id).catch(() => ({ wifi: [] })),
            acs.getDeviceWAN(id).catch(() => ({ wan: [] })),
            acs.getDeviceLAN(id).catch(() => ({ lan: null })),
            acs.getDeviceHosts(id).catch(() => ({ hosts: [] }))
        ]);

        // Only override with sub-resource data if there's actual data
        // (params-parsed data takes precedence when sub-resources are empty)
        const optStats = optical.stats || [];
        if (optStats.length > 0) {
            enriched.rx_power = optStats[0].rx_power;
            enriched.tx_power = optStats[0].tx_power;
            enriched.temperature = optStats[0].temperature;
            enriched.pon_mode = optStats[0].pon_mode;
        }

        if (wifi.wifi && wifi.wifi.length > 0 && wifi.wifi.some(w => w.ssid && w.ssid !== '-')) enriched.wifi_configs = wifi.wifi;
        if (wan.wan && wan.wan.length > 0 && wan.wan.some(w => w.username)) enriched.wan_connections = wan.wan;
        enriched.lan_config = lan.lan;
        if (hosts.hosts && hosts.hosts.length > 0) enriched.hosts = hosts.hosts;

        if (enriched.pppoe_username) {
            const svcQuery = await query(
                `SELECT c.name as customer_name, c.phone as customer_phone,
                        s.service_number, s.isolir_date
                 FROM technical_details td
                 JOIN services s ON s.id = td.service_id
                 JOIN customers c ON c.id = s.customer_id
                 WHERE td.pppoe_username = $1`,
                [enriched.pppoe_username]
            );
            if (svcQuery.rows.length > 0) {
                const row = svcQuery.rows[0];
                enriched.customer_name = row.customer_name;
                enriched.customer_phone = row.customer_phone;
                enriched.service_number = row.service_number;
                enriched.isolir_date = row.isolir_date;
            }
        }

        return res.sendSuccess(enriched, { device_id: id });
    } catch (err) {
        logger.error(`Failed to fetch device ${id}:`, err.message);
        return res.sendSuccess({
            id, sn: id, product_class: '-', manufacturer: 'Unknown',
            oui: '-', status: 'offline', last_inform: new Date().toISOString(),
            hosts: [], wifi_configs: [], wan_connections: [], lan_config: null
        }, { device_id: id, error: err.message });
    }
}));

router.post('/devices/:id/refresh', asyncHandler(async (req, res) => {
    const { id } = req.params;
    try {
        const result = await acs.connectionRequest(id);
        return res.sendSuccess(result, { device_id: id });
    } catch (err) {
        logger.error(`Failed to refresh device ${id}:`, err.message);
        return res.sendError('EXTERNAL_SERVICE_ERROR', 'Failed to refresh device',
            [{ field: 'device', message: err.message, value: id }]);
    }
}));

router.post('/devices/:id/reboot', asyncHandler(async (req, res) => {
    const { id } = req.params;
    try {
        const result = await acs.reboot(id);
        return res.sendSuccess(result, { device_id: id });
    } catch (err) {
        logger.error(`Failed to reboot device ${id}:`, err.message);
        return res.sendError('EXTERNAL_SERVICE_ERROR', 'Failed to reboot device',
            [{ field: 'device', message: err.message, value: id }]);
    }
}));

router.post('/devices/:id/factory-reset', asyncHandler(async (req, res) => {
    const { id } = req.params;
    try {
        const result = await acs.factoryReset(id);
        return res.sendSuccess(result, { device_id: id });
    } catch (err) {
        logger.error(`Failed to factory reset device ${id}:`, err.message);
        return res.sendError('EXTERNAL_SERVICE_ERROR', 'Failed to factory reset device',
            [{ field: 'device', message: err.message, value: id }]);
    }
}));

router.get('/devices/:id/optical', asyncHandler(async (req, res) => {
    const { id } = req.params;
    try {
        const data = await acs.getDeviceOptical(id, parseInt(req.query.limit) || 50);
        return res.sendSuccess(data, { device_id: id });
    } catch (err) {
        return res.sendSuccess({ stats: [] }, { device_id: id, error: err.message });
    }
}));

router.get('/devices/:id/wifi', asyncHandler(async (req, res) => {
    const { id } = req.params;
    try {
        const data = await acs.getDeviceWiFi(id);
        return res.sendSuccess(data, { device_id: id });
    } catch (err) {
        return res.sendSuccess({ wifi: [] }, { device_id: id, error: err.message });
    }
}));

router.put('/devices/:id/wifi', asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { ssid_index, ssid, password, enabled, security_mode, channel } = req.body;
    try {
        const body = {};
        if (ssid_index !== undefined) body.ssid_index = ssid_index;
        if (ssid !== undefined) body.ssid = ssid;
        if (password !== undefined) body.password = password;
        if (enabled !== undefined) body.enabled = enabled;
        if (security_mode !== undefined) body.security_mode = security_mode;
        if (channel !== undefined) body.channel = channel;
        const result = await acs.updateDeviceWiFi(id, body);
        return res.sendSuccess(result, { device_id: id });
    } catch (err) {
        logger.error(`Failed to update WiFi for ${id}:`, err.message);
        return res.sendError('EXTERNAL_SERVICE_ERROR', 'Failed to update WiFi',
            [{ field: 'device', message: err.message, value: id }]);
    }
}));

router.put('/devices/:deviceId/wifi/:ssidIndex', asyncHandler(async (req, res) => {
    const { deviceId, ssidIndex } = req.params;
    const { ssid, password, enabled, security_mode, channel } = req.body;
    try {
        const body = { ssid_index: parseInt(ssidIndex) };
        if (ssid !== undefined) body.ssid = ssid;
        if (password !== undefined) body.password = password;
        if (enabled !== undefined) body.enabled = enabled;
        if (security_mode !== undefined) body.security_mode = security_mode;
        if (channel !== undefined) body.channel = channel;
        const result = await acs.updateDeviceWiFi(deviceId, body);
        return res.sendSuccess(result, { device_id: deviceId, ssid_index: ssidIndex });
    } catch (err) {
        return res.sendError('EXTERNAL_SERVICE_ERROR', 'Failed to update WiFi',
            [{ field: 'device', message: err.message, value: deviceId }]);
    }
}));

router.get('/devices/:id/wan', asyncHandler(async (req, res) => {
    const { id } = req.params;
    try {
        const data = await acs.getDeviceWAN(id);
        return res.sendSuccess(data, { device_id: id });
    } catch (err) {
        return res.sendSuccess({ wan: [] }, { device_id: id, error: err.message });
    }
}));

router.put('/devices/:id/lan', asyncHandler(async (req, res) => {
    const { id } = req.params;
    const body = req.body;
    try {
        const result = await acs.command(id, {
            command: 'set_parameter_values',
            params: Object.entries(body)
                .filter(([, v]) => v !== undefined && v !== null)
                .map(([name, value]) => ({ name, value: String(value) }))
        });
        return res.sendSuccess(result, { device_id: id });
    } catch (err) {
        return res.sendError('EXTERNAL_SERVICE_ERROR', 'Failed to update LAN config',
            [{ field: 'device', message: err.message, value: id }]);
    }
}));

router.get('/devices/:id/lan', asyncHandler(async (req, res) => {
    const { id } = req.params;
    try {
        const data = await acs.getDeviceLAN(id);
        return res.sendSuccess(data, { device_id: id });
    } catch (err) {
        return res.sendSuccess({ lan: null }, { device_id: id, error: err.message });
    }
}));

router.get('/devices/:id/hosts', asyncHandler(async (req, res) => {
    const { id } = req.params;
    try {
        const data = await acs.getDeviceHosts(id);
        return res.sendSuccess(data, { device_id: id });
    } catch (err) {
        return res.sendSuccess({ hosts: [] }, { device_id: id, error: err.message });
    }
}));

router.get('/devices/:id/wifi-info', asyncHandler(async (req, res) => {
    const { id } = req.params;
    try {
        const data = await acs.getDeviceWiFi(id);
        const configs = data.wifi || [];
        const wifiInfo = {
            ssid2_4g: null, password2_4g: null,
            ssid5g: null, password5g: null,
            enabled: false, clients: []
        };
        configs.forEach(cfg => {
            if (cfg.ssid_index === 0) {
                wifiInfo.ssid2_4g = cfg.ssid;
                wifiInfo.password2_4g = cfg.password;
            } else if (cfg.ssid_index === 1) {
                wifiInfo.ssid5g = cfg.ssid;
                wifiInfo.password5g = cfg.password;
            }
            if (cfg.enabled) wifiInfo.enabled = true;
        });
        const hosts = await acs.getDeviceHosts(id).catch(() => ({ hosts: [] }));
        wifiInfo.clients = (hosts.hosts || []).map(h => ({
            macAddress: h.mac_address,
            ipAddress: h.ip_address,
            signalStrength: h.interface_type === 'WiFi' ? '-45 dBm' : '-'
        }));
        return res.sendSuccess({ wifiInfo }, { device_id: id });
    } catch (err) {
        return res.sendSuccess({
            wifiInfo: {
                ssid2_4g: null, password2_4g: null,
                ssid5g: null, password5g: null,
                enabled: false, clients: []
            }
        }, { device_id: id, error: err.message });
    }
}));

router.get('/devices/:id/performance', asyncHandler(async (req, res) => {
    const { id } = req.params;
    try {
        const [detail, optical] = await Promise.all([
            acs.getDevice(id).catch(() => ({ device: {} })),
            acs.getDeviceOptical(id, 1).catch(() => ({ stats: [] }))
        ]);
        const dev = detail.device || detail;
        const opt = (optical.stats || [])[0] || {};
        const lastInform = dev.last_inform ? new Date(dev.last_inform).getTime() : 0;
        const diffMin = (Date.now() - lastInform) / 60000;
        const connectionStatus = diffMin > 10 ? 'offline' : diffMin > 5 ? 'warning' : 'online';
        return res.sendSuccess({
            performance: {
                rxPower: opt.rx_power != null ? `${opt.rx_power} dBm` : null,
                txPower: opt.tx_power != null ? `${opt.tx_power} dBm` : null,
                temperature: opt.temperature != null ? `${opt.temperature}°C` : null,
                uptime: dev.last_boot ? formatUptime((Date.now() - new Date(dev.last_boot).getTime()) / 1000) : null,
                connectionStatus
            }
        }, { device_id: id });
    } catch (err) {
        return res.sendSuccess({
            performance: { rxPower: null, txPower: null, temperature: null, uptime: null, connectionStatus: 'unknown' }
        }, { device_id: id, error: err.message });
    }
}));

router.post('/devices/:id/wifi-config', asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { ssid, password, ssid5g, password5g } = req.body;
    try {
        if (ssid || password) {
            await acs.updateDeviceWiFi(id, {
                ssid_index: 0,
                ...(ssid && { ssid }),
                ...(password && { password }),
                enabled: true
            });
        }
        if (ssid5g || password5g) {
            await acs.updateDeviceWiFi(id, {
                ssid_index: 1,
                ...(ssid5g && { ssid: ssid5g }),
                ...(password5g && { password: password5g }),
                enabled: true
            });
        }
        return res.sendSuccess({ success: true }, { device_id: id });
    } catch (err) {
        return res.sendError('EXTERNAL_SERVICE_ERROR', 'Failed to update WiFi config',
            [{ field: 'device', message: err.message, value: id }]);
    }
}));

router.post('/action', asyncHandler(async (req, res) => {
    const { deviceId, action, parameters = {} } = req.body;

    if (!deviceId || !action) {
        return res.sendValidationErrors([
            ...(!deviceId ? [{ field: 'deviceId', message: 'Device ID is required' }] : []),
            ...(!action ? [{ field: 'action', message: 'Action is required' }] : [])
        ]);
    }

    let result;
    try {
        switch (action) {
            case 'reboot':
                result = await acs.reboot(deviceId);
                break;
            case 'resync':
                result = await acs.connectionRequest(deviceId);
                break;
            case 'factoryReset':
                result = await acs.factoryReset(deviceId);
                break;
            case 'configure':
                result = await acs.command(deviceId, {
                    command: 'set_parameter_values',
                    params: Object.entries(parameters).map(([name, value]) => ({ name, value }))
                });
                break;
            case 'diagnostics': {
                const detail = await acs.getDevice(deviceId).catch(() => ({ device: {} }));
                const dev = detail.device || detail;
                const lastInform = dev.last_inform ? new Date(dev.last_inform) : new Date();
                const minutesSince = Math.round((Date.now() - lastInform.getTime()) / 60000);
                const isOnline = minutesSince < 10;
                let healthScore = 100;
                if (!isOnline) healthScore -= 30;
                if (minutesSince > 5) healthScore -= 10;
                healthScore = Math.max(0, healthScore);
                result = {
                    status: isOnline ? 'online' : 'offline',
                    isOnline,
                    lastInform: dev.last_inform,
                    minutesSinceLastInform: minutesSince,
                    parameterCount: 0,
                    manufacturer: dev.manufacturer || '-',
                    productClass: dev.product_class || '-',
                    serialNumber: dev.sn || '-',
                    softwareVersion: dev.software_version || '-',
                    hardwareVersion: dev.hardware_version || '-',
                    healthScore
                };
                break;
            }
            default:
                return res.sendValidationErrors([{
                    field: 'action',
                    message: 'Invalid action',
                    value: action,
                    valid_options: ['reboot', 'resync', 'factoryReset', 'configure', 'diagnostics']
                }]);
        }
        return res.sendSuccess(result, { device_id: deviceId, action });
    } catch (err) {
        logger.error(`Failed to perform ${action} on device ${deviceId}:`, err.message);
        return res.sendError('EXTERNAL_SERVICE_ERROR',
            `Terjadi kesalahan saat melakukan aksi ${action} pada perangkat`,
            [{ field: 'device_action', message: err.message, value: deviceId }],
            { device_id: deviceId, action, error_type: 'acs_service_error' });
    }
}));

router.post('/edit', asyncHandler(async (req, res) => {
    const { id, ssid, password } = req.body;
    if (!id) {
        return res.sendValidationErrors([{ field: 'id', message: 'Device ID is required' }]);
    }
    try {
        const params = [];
        if (ssid) params.push({ name: 'InternetGatewayDevice.LANDevice.1.WLANConfiguration.1.SSID', value: ssid });
        if (password) params.push({ name: 'InternetGatewayDevice.LANDevice.1.WLANConfiguration.1.KeyPassphrase', value: password });
        if (params.length > 0) {
            const result = await acs.command(id, { command: 'set_parameter_values', params });
            return res.sendSuccess(result, { device_id: id });
        }
        return res.sendSuccess({ success: true, message: 'No changes' }, { device_id: id });
    } catch (err) {
        return res.sendError('EXTERNAL_SERVICE_ERROR', 'Failed to update device',
            [{ field: 'device', message: err.message, value: id }]);
    }
}));

router.get('/stats', asyncHandler(async (req, res) => {
    try {
        const acsStats = await acs.getStats();
        const stats = {
            total_devices: acsStats.total_devices || 0,
            online_devices: acsStats.online_devices || 0,
            offline_devices: acsStats.offline_devices || 0,
            warning_devices: 0,
            manufacturers: {},
            models: {},
            last_updated: new Date().toISOString()
        };
        return res.sendSuccess({ stats }, {
            data_source: 'kilusi_acs_live',
            online_percentage: stats.total_devices > 0
                ? ((stats.online_devices / stats.total_devices) * 100).toFixed(1)
                : 0
        });
    } catch (err) {
        logger.error('Failed to fetch stats from Kilusi-ACS:', err.message);
        return res.sendSuccess({
            stats: {
                total_devices: 0, online_devices: 0, offline_devices: 0,
                warning_devices: 0, manufacturers: {}, models: {},
                last_updated: new Date().toISOString()
            }
        }, { data_source: 'fallback_empty' });
    }
}));

router.get('/locations', async (req, res) => {
    try {
        const fs = require('fs').promises;
        const path = require('path');
        let locations = [];
        try {
            const data = await fs.readFile(path.join(process.cwd(), 'logs', 'onu-locations.json'), 'utf8');
            locations = JSON.parse(data);
        } catch (err) {
            locations = [];
        }
        res.json({ success: true, data: { locations } });
    } catch (error) {
        logger.error('Error fetching device locations:', error);
        res.status(500).json({ success: false, message: 'Error fetching locations' });
    }
});

function formatUptime(seconds) {
    if (!seconds || seconds < 0) return 'N/A';
    const d = Math.floor(seconds / 86400);
    const h = Math.floor((seconds % 86400) / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    if (d > 0) return `${d}d ${h}h ${m}m`;
    return `${h}h ${m}m`;
}

module.exports = router;
