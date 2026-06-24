const axios = require('axios');

const ACS_API_URL = process.env.KILUSI_ACS_URL || 'http://localhost:7558';

const api = axios.create({
    baseURL: ACS_API_URL,
    timeout: 30000,
    headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' }
});

const kilusiAcs = {
    async getDevices(params = {}) {
        const res = await api.get('/api/devices', { params });
        return res.data;
    },

    async getDevice(id) {
        const res = await api.get(`/api/devices/${encodeURIComponent(id)}`);
        return res.data;
    },

    async getDeviceOptical(id, limit = 1) {
        const res = await api.get(`/api/devices/${encodeURIComponent(id)}/optical`, { params: { limit } });
        return res.data;
    },

    async getDeviceWiFi(id) {
        const res = await api.get(`/api/devices/${encodeURIComponent(id)}/wifi`);
        return res.data;
    },

    async updateDeviceWiFi(id, body) {
        const res = await api.put(`/api/devices/${encodeURIComponent(id)}/wifi`, body);
        return res.data;
    },

    async getDeviceWAN(id) {
        const res = await api.get(`/api/devices/${encodeURIComponent(id)}/wan`);
        return res.data;
    },

    async getDeviceLAN(id) {
        const res = await api.get(`/api/devices/${encodeURIComponent(id)}/lan`);
        return res.data;
    },

    async getDeviceHosts(id) {
        const res = await api.get(`/api/devices/${encodeURIComponent(id)}/hosts`);
        return res.data;
    },

    async getStats() {
        const res = await api.get('/api/stats');
        return res.data;
    },

    async getVendors() {
        const res = await api.get('/api/vendors');
        return res.data;
    },

    async command(id, body) {
        const res = await api.post(`/api/devices/${encodeURIComponent(id)}/command`, body);
        return res.data;
    },

    async connectionRequest(id) {
        const res = await api.post(`/api/devices/${encodeURIComponent(id)}/connection-request`);
        return res.data;
    },

    async reboot(id) {
        return this.command(id, { command: 'reboot' });
    },

    async getParameterValues(id, paramNames) {
        return this.command(id, { command: 'get_parameter_values', param_names: paramNames });
    },

    async setParameterValues(id, params) {
        return this.command(id, { command: 'set_parameter_values', params });
    },

    async factoryReset(id) {
        return this.command(id, { command: 'factory_reset' });
    },

    async setWiFiSSID(id, ssid, password) {
        return this.updateDeviceWiFi(id, { ssid_index: 0, ssid, password, enabled: true });
    }
};

module.exports = kilusiAcs;
