// TypeScript interfaces for RADIUS/NAS management

export interface NAS {
    id: string
    shortname: string
    nasname: string
    secret: string
    type: string
    description: string
    ports: number
    status: 'online' | 'offline' | 'unknown'
    last_seen?: string
    priority: number
    is_active: boolean
    snmp_community?: string
    snmp_community_trap?: string
    snmp_version?: string
    snmp_port?: number
    snmp_enabled?: boolean
    snmp_username?: string
    snmp_auth_protocol?: string
    snmp_auth_password?: string
    snmp_priv_protocol?: string
    snmp_priv_password?: string
    snmp_security_level?: string
    created_at: string
    updated_at: string
}

export interface NASGroup {
    id: string
    name: string
    description: string
    nas_servers: NAS[]
    load_balancing_method: 'round_robin' | 'least_connections' | 'weighted' | 'failover'
    health_check_enabled: boolean
    health_check_interval: number
    created_at: string
    updated_at: string
}

export interface SNMPStats {
    uptime?: number
    cpu_usage?: number
    memory_usage?: number
    interface_count?: number
    active_connections?: number
    last_checked?: string
}

export interface SNMPSystemInfo {
    name: string
    description: string
    uptime: number
    uptimeFormatted: string
    contact: string
    location: string
    // Basic metrics from SNMP
    cpuUsage: number
    memoryUsage: number
    interfaceCount: number
    activeConnections: number
    // Mikrotik specific (may be N/A)
    routerOsVersion: string
    boardName: string
    architecture: string
    cpuCount: number
    licenseLevel: string
    cpuTemperature: number | null
    boardTemperature: number | null
    systemVoltage: number | null
}

export interface SNMPResources {
    cpuUsage: number
    memory: {
        total: number
        used: number
        usedPct: number
    }
    storage: Array<{
        name: string
        total: number
        used: number
        usedPct: number
    }>
}

export interface SNMPInterface {
    index: number
    name: string
    description: string
    status: 'up' | 'down'
    adminStatus: 'up' | 'down'
    speed: number
    speedFormatted: string
    mac: string
    mtu: number
    type: string
    rxBytes: number
    txBytes: number
    rxBytesFormatted: string
    txBytesFormatted: string
    rxRate: number
    txRate: number
    rxRateFormatted?: string
    txRateFormatted?: string
}

export interface SNMPDetail {
    enabled: boolean
    message?: string
    system?: SNMPSystemInfo
    resources?: SNMPResources
    interfaces?: SNMPInterface[]
    lastUpdated?: string
}

export interface NASFormData {
    shortname: string
    nasname: string
    secret: string
    type: string
    description: string
    priority: number
    snmp_enabled: boolean
    snmp_community: string
    snmp_community_trap: string
    snmp_version: string
    snmp_port: number
    snmp_username: string
    snmp_auth_protocol: string
    snmp_auth_password: string
    snmp_priv_protocol: string
    snmp_priv_password: string
    snmp_security_level: string
}

export const DEFAULT_FORM_DATA: NASFormData = {
    shortname: '',
    nasname: '',
    secret: '',
    type: 'mikrotik',
    description: '',
    priority: 1,
    snmp_enabled: false,
    snmp_community: 'kilusibill',
    snmp_community_trap: 'kilusibill',
    snmp_version: '2c',
    snmp_port: 161,
    snmp_username: '',
    snmp_auth_protocol: 'SHA',
    snmp_auth_password: '',
    snmp_priv_protocol: 'AES',
    snmp_priv_password: '',
    snmp_security_level: 'authPriv'
}
