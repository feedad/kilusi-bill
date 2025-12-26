
export interface GenieACSDevice {
    _id: string
    id: string
    serial: string
    serialNumber: string
    productClass: string
    model: string
    manufacturer: string
    oui: string
    lastInform: string
    connectionState: 'connected' | 'disconnected' | 'unknown'
    parameters?: {
        InternetGatewayDevice?: {
            DeviceInfo?: {
                ManufacturerOUI?: string
                ModelName?: string | { _value: string }
                Description?: string
                ProductClass?: string
                SerialNumber?: string
                HardwareVersion?: string | { _value: string }
                SoftwareVersion?: string | { _value: string }
                ProvisioningCode?: string
                UpTime?: string
            }
            WANDevice?: {
                [key: string]: {
                    WANConnectionDevice?: {
                        [key: string]: {
                            ExternalIPAddress?: string | { _value: string }
                            MACAddress?: string | { _value: string }
                        }
                    }
                }
            }
            LANDevice?: {
                [key: string]: {
                    Hosts?: {
                        Host?: any[]
                    }
                }
            }
        }
    }
    ip: string
    mac: string
    uptime: string
    customer?: {
        id: string
        name: string
        pppoe_username: string
        address?: string
        phone?: string
    }
    pppoeUsername?: string
    pppoePassword?: string // Added pppoePassword
    ssid?: string
    password?: string
    userKonek?: number
    rxPower?: string | number
    tag?: string
    tags?: string[]
}
