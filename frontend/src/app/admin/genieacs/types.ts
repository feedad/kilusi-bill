export interface ACSDevice {
  id: string
  sn: string
  product_class: string
  manufacturer: string
  oui: string
  hardware_version: string
  software_version: string
  status: 'online' | 'offline'
  last_inform: string
  last_boot: string
  conn_request_url: string
  periodic_interval: number
  pppoe_username: string
  ip_address: string
  mac_address: string
  // Extended info (customer data from billing)
  customer_name?: string
  customer_phone?: string
  service_number?: string
  isolir_date?: string
  // Optical
  rx_power?: number
  tx_power?: number
  temperature?: number
  pon_mode?: string
  // Uptime computed
  uptime_seconds?: number
  // Connected hosts
  hosts?: ACSHost[]
  // WiFi configs
  wifi_configs?: ACSWiFiConfig[]
  // WAN connections  
  wan_connections?: ACSWANConnection[]
  // LAN config
  lan_config?: ACSLanConfig
  // Raw params from GPV
  params?: Record<string, string>
}

export interface ACSHost {
  ip_address: string
  mac_address: string
  hostname: string
  interface_type: string
  last_seen: string
}

export interface ACSWiFiConfig {
  id: string
  ssid_index: number
  ssid: string
  password?: string
  enabled: boolean
  security_mode: string
  channel: number
  active_clients: number
  max_clients?: number
  hidden_ssid?: boolean
  bandwidth?: string
}

export interface ACSWANConnection {
  id: string
  wan_index: number
  connection_type: string
  username: string
  password?: string
  ip_address: string
  mac_address: string
  vlan_id?: number
  uptime: number
  nat_enabled?: boolean
  dns_servers?: string
  service_type?: string
  lan_bind?: number[]
  wifi_bind?: number[]
}

export interface ACSLanConfig {
  id: string
  gateway_ip: string
  subnet_mask: string
  mac_address: string
  dhcp_enabled: boolean
  dhcp_start_ip: string
  dhcp_end_ip: string
  dhcp_lease_time: number
  dns_servers: string
  bridge_mode?: boolean
}

export interface HotspotSettings {
  vlan_id: number
  vlan_priority: number
  connection_type: string
  ssid: string
  security: string
  password: string
  ssid_index: number
  wifi_bind_only: boolean
  lan_bind: number[]
  auto_enabled: boolean
}

export interface DeviceStats {
  total: number
  online: number
  offline: number
  vendors: Record<string, number>
}

// GenieACS-era device format used by list page and detail modal
export interface GenieACSDevice {
  _id?: string
  id: string
  serial?: string
  serialNumber?: string
  model?: string
  productClass?: string
  manufacturer?: string
  oui?: string
  lastInform?: string
  pppoeUsername?: string
  ssid?: string
  password?: string
  userKonek?: string
  rxPower?: string | number
  tag?: string
  customerId?: string | number
  customerName?: string
  customer?: {
    name?: string
    pppoe_username?: string
    phone?: string
  }
  tags?: string[]
  connectionState?: string
  device_status?: string
  parameters?: Record<string, any>
  customer_name?: string
  customer_phone?: string
  service_number?: string
  isolir_date?: string
}
