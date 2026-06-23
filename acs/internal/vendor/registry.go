package vendor

import "fmt"

type VendorConfig struct {
	Manufacturer string
	ProductMatch []string
	WanIndex     int
	MaxSSIDs     int
	Optical      OpticalPaths
	WiFi         WiFiPaths
	WAN          WANPaths
	LAN          LANPaths
}

type OpticalPaths struct {
	RXPower     string
	TXPower     string
	Temperature string
	Voltage     string
	BiasCurrent string
	PONMode     string
}

type WiFiPaths struct {
	SSID       string
	Password   string
	Enable     string
	Security   string
	Channel    string
	Bandwidth  string
	HiddenSSID string
	MaxClients string
	ClientsNow string
}

type WANPaths struct {
	Username    string
	Password    string
	IPAddress   string
	MACAddress  string
	Uptime      string
	ConnType    string
	NATEnabled  string
	DNSServers  string
	VLANID      string
	VLANPrio    string
	ServiceList string
	LANBind     string
	WiFiBind    string
	RemoteAddr  string
	Status      string
	Name        string
}

type LANPaths struct {
	GatewayIP  string
	SubnetMask string
	MACAddress string
	DHCPEnable string
	DHCPStart  string
	DHCPEnd    string
	LeaseTime  string
	DNSServers string
	BridgeMode string
}

var Registry = map[string]*VendorConfig{
	"CIOT": {
		Manufacturer: "CIOT",
		ProductMatch: []string{"GM220", "MQ220"},
		WanIndex:     2,
		MaxSSIDs:     4,
		Optical: OpticalPaths{
			RXPower:     "InternetGatewayDevice.WANDevice.1.X_CT-COM_EponInterfaceConfig.RXPower",
			Temperature: "InternetGatewayDevice.WANDevice.1.X_CT-COM_EponInterfaceConfig.TransceiverTemperature",
		},
		WiFi: WiFiPaths{
			SSID:       "InternetGatewayDevice.LANDevice.1.WLANConfiguration.%d.SSID",
			Password:   "InternetGatewayDevice.LANDevice.1.WLANConfiguration.%d.KeyPassphrase",
			Enable:     "InternetGatewayDevice.LANDevice.1.WLANConfiguration.%d.Enable",
			Security:   "InternetGatewayDevice.LANDevice.1.WLANConfiguration.%d.BeaconType",
			Channel:    "InternetGatewayDevice.LANDevice.1.WLANConfiguration.%d.Channel",
		},
		WAN: WANPaths{
			Username:   "InternetGatewayDevice.WANDevice.1.WANConnectionDevice.2.WANPPPConnection.%d.Username",
			Password:   "InternetGatewayDevice.WANDevice.1.WANConnectionDevice.2.WANPPPConnection.%d.Password",
			IPAddress:  "InternetGatewayDevice.WANDevice.1.WANConnectionDevice.2.WANPPPConnection.%d.ExternalIPAddress",
			MACAddress: "InternetGatewayDevice.WANDevice.1.WANConnectionDevice.2.WANPPPConnection.%d.MACAddress",
			Uptime:     "InternetGatewayDevice.WANDevice.1.WANConnectionDevice.2.WANPPPConnection.%d.Uptime",
			ConnType:   "InternetGatewayDevice.WANDevice.1.WANConnectionDevice.2.WANPPPConnection.%d.ConnectionType",
			VLANID:     "InternetGatewayDevice.WANDevice.1.WANConnectionDevice.2.X_CT-COM_WANEponLinkConfig.VLANIDMark",
		},
		LAN: LANPaths{
			DHCPEnable: "InternetGatewayDevice.LANDevice.1.LANHostConfigManagement.DHCPServerEnable",
			DHCPStart:  "InternetGatewayDevice.LANDevice.1.LANHostConfigManagement.MinAddress",
			DHCPEnd:    "InternetGatewayDevice.LANDevice.1.LANHostConfigManagement.MaxAddress",
			LeaseTime:  "InternetGatewayDevice.LANDevice.1.LANHostConfigManagement.DHCPLeaseTime",
			GatewayIP:  "InternetGatewayDevice.LANDevice.1.LANHostConfigManagement.IPRouters",
		},
	},
	"CMDC": {
		Manufacturer: "CMDC",
		ProductMatch: []string{"H1s"},
		WanIndex:     1,
		MaxSSIDs:     4,
		Optical: OpticalPaths{
			RXPower:     "InternetGatewayDevice.WANDevice.1.X_CMCC_EponInterfaceConfig.RXPower",
			Temperature: "InternetGatewayDevice.WANDevice.1.X_CMCC_EponInterfaceConfig.TransceiverTemperature",
		},
		WiFi: WiFiPaths{
			SSID:       "InternetGatewayDevice.LANDevice.1.WLANConfiguration.%d.SSID",
			Password:   "InternetGatewayDevice.LANDevice.1.WLANConfiguration.%d.KeyPassphrase",
			ClientsNow: "InternetGatewayDevice.LANDevice.1.WLANConfiguration.%d.TotalAssociations",
		},
		WAN: WANPaths{
			Username:   "InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANPPPConnection.%d.Username",
			Password:   "InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANPPPConnection.%d.Password",
			IPAddress:  "InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANPPPConnection.%d.ExternalIPAddress",
			MACAddress: "InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANPPPConnection.%d.MACAddress",
			Uptime:     "InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANPPPConnection.%d.Uptime",
			ConnType:   "InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANPPPConnection.%d.ConnectionType",
		},
		LAN: LANPaths{
			DHCPEnable: "InternetGatewayDevice.LANDevice.1.LANHostConfigManagement.DHCPServerEnable",
			DHCPStart:  "InternetGatewayDevice.LANDevice.1.LANHostConfigManagement.MinAddress",
			DHCPEnd:    "InternetGatewayDevice.LANDevice.1.LANHostConfigManagement.MaxAddress",
			GatewayIP:  "InternetGatewayDevice.LANDevice.1.LANHostConfigManagement.IPRouters",
		},
	},
	"ZTE": {
		Manufacturer: "ZTE",
		ProductMatch: []string{"F660", "F663", "F609"},
		WanIndex:     1,
		MaxSSIDs:     8,
		Optical: OpticalPaths{
			RXPower:     "InternetGatewayDevice.WANDevice.1.X_ZTE-COM_WANPONInterfaceConfig.RXPower",
			Temperature: "InternetGatewayDevice.WANDevice.1.X_ZTE-COM_WANPONInterfaceConfig.TransceiverTemperature",
		},
		WiFi: WiFiPaths{
			SSID:       "InternetGatewayDevice.LANDevice.1.WLANConfiguration.%d.SSID",
			Password:   "InternetGatewayDevice.LANDevice.1.WLANConfiguration.%d.KeyPassphrase",
			Security:   "InternetGatewayDevice.LANDevice.1.WLANConfiguration.%d.BeaconType",
			Channel:    "InternetGatewayDevice.LANDevice.1.WLANConfiguration.%d.Channel",
			Bandwidth:  "InternetGatewayDevice.LANDevice.1.WLANConfiguration.%d.X_ZTE-COM_BandWidth",
			HiddenSSID: "InternetGatewayDevice.LANDevice.1.WLANConfiguration.%d.X_ZTE-COM_WlanHidden",
			Enable:     "InternetGatewayDevice.LANDevice.1.WLANConfiguration.%d.Enable",
		},
		WAN: WANPaths{
			Username:  "InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANPPPConnection.%d.Username",
			Password:  "InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANPPPConnection.%d.Password",
			IPAddress: "InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANPPPConnection.%d.ExternalIPAddress",
			VLANID:    "InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANPPPConnection.%d.X_ZTE-COM_VLANID",
		},
		LAN: LANPaths{
			GatewayIP:  "InternetGatewayDevice.LANDevice.1.LANHostConfigManagement.IPRouters",
			DHCPEnable: "InternetGatewayDevice.LANDevice.1.LANHostConfigManagement.DHCPServerEnable",
			DHCPStart:  "InternetGatewayDevice.LANDevice.1.LANHostConfigManagement.MinAddress",
			DHCPEnd:    "InternetGatewayDevice.LANDevice.1.LANHostConfigManagement.MaxAddress",
			LeaseTime:  "InternetGatewayDevice.LANDevice.1.LANHostConfigManagement.DHCPLeaseTime",
		},
	},
	"Huawei": {
		Manufacturer: "Huawei",
		ProductMatch: []string{"HG", "EG"},
		WanIndex:     1,
		MaxSSIDs:     8,
		Optical: OpticalPaths{
			RXPower:     "InternetGatewayDevice.WANDevice.1.X_GponInterafceConfig.RXPower",
			Temperature: "InternetGatewayDevice.WANDevice.1.X_GponInterafceConfig.TransceiverTemperature",
		},
		WiFi: WiFiPaths{
			SSID:       "InternetGatewayDevice.LANDevice.1.WLANConfiguration.%d.SSID",
			Password:   "InternetGatewayDevice.LANDevice.1.WLANConfiguration.%d.KeyPassphrase",
			Security:   "InternetGatewayDevice.LANDevice.1.WLANConfiguration.%d.BeaconType",
			Channel:    "InternetGatewayDevice.LANDevice.1.WLANConfiguration.%d.Channel",
			Bandwidth:  "InternetGatewayDevice.LANDevice.1.WLANConfiguration.%d.X_HW_BandWidth",
			HiddenSSID: "InternetGatewayDevice.LANDevice.1.WLANConfiguration.%d.X_HW_WlanHidden",
			Enable:     "InternetGatewayDevice.LANDevice.1.WLANConfiguration.%d.Enable",
		},
		WAN: WANPaths{
			Username:  "InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANPPPConnection.%d.Username",
			Password:  "InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANPPPConnection.%d.Password",
			IPAddress: "InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANPPPConnection.%d.ExternalIPAddress",
			VLANID:    "InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANPPPConnection.%d.X_HW_VLANID",
		},
		LAN: LANPaths{
			GatewayIP:  "InternetGatewayDevice.LANDevice.1.LANHostConfigManagement.IPRouters",
			DHCPEnable: "InternetGatewayDevice.LANDevice.1.LANHostConfigManagement.DHCPServerEnable",
			DHCPStart:  "InternetGatewayDevice.LANDevice.1.LANHostConfigManagement.MinAddress",
			DHCPEnd:    "InternetGatewayDevice.LANDevice.1.LANHostConfigManagement.MaxAddress",
			LeaseTime:  "InternetGatewayDevice.LANDevice.1.LANHostConfigManagement.DHCPLeaseTime",
			DNSServers: "InternetGatewayDevice.LANDevice.1.LANHostConfigManagement.DNSServers",
		},
	},
	"FiberHome": {
		Manufacturer: "FiberHome",
		ProductMatch: []string{},
		WanIndex:     1,
		MaxSSIDs:     4,
		Optical: OpticalPaths{
			RXPower:     "InternetGatewayDevice.WANDevice.1.X_FH_GponInterfaceConfig.RXPower",
			Temperature: "InternetGatewayDevice.WANDevice.1.X_FH_GponInterfaceConfig.TransceiverTemperature",
		},
		WiFi: WiFiPaths{
			SSID:       "InternetGatewayDevice.LANDevice.1.WLANConfiguration.%d.SSID",
			Password:   "InternetGatewayDevice.LANDevice.1.WLANConfiguration.%d.KeyPassphrase",
		},
	},
	"Nokia": {
		Manufacturer: "Nokia",
		ProductMatch: []string{},
		WanIndex:     1,
		MaxSSIDs:     4,
		Optical: OpticalPaths{
			RXPower: "InternetGatewayDevice.X_ALU_OntOpticalParam.RXPower",
		},
		WiFi: WiFiPaths{
			SSID:     "InternetGatewayDevice.LANDevice.1.WLANConfiguration.%d.SSID",
			Password: "InternetGatewayDevice.LANDevice.1.WLANConfiguration.%d.KeyPassphrase",
		},
	},
}

func Detect(manufacturer, productClass string) *VendorConfig {
	for _, v := range Registry {
		if manufacturer == v.Manufacturer {
			return v
		}
	}
	for _, v := range Registry {
		for _, m := range v.ProductMatch {
			if len(m) > 0 && len(productClass) >= len(m) && productClass[:len(m)] == m {
				return v
			}
		}
	}
	return nil
}

func (v *VendorConfig) WifiPath(field string, ssidIndex int) string {
	switch field {
	case "ssid":
		return formatPath(v.WiFi.SSID, ssidIndex)
	case "password":
		return formatPath(v.WiFi.Password, ssidIndex)
	case "enable":
		return formatPath(v.WiFi.Enable, ssidIndex)
	case "security":
		return formatPath(v.WiFi.Security, ssidIndex)
	case "channel":
		return formatPath(v.WiFi.Channel, ssidIndex)
	case "bandwidth":
		return formatPath(v.WiFi.Bandwidth, ssidIndex)
	case "hidden":
		return formatPath(v.WiFi.HiddenSSID, ssidIndex)
	case "max_clients":
		return formatPath(v.WiFi.MaxClients, ssidIndex)
	case "clients_now":
		return formatPath(v.WiFi.ClientsNow, ssidIndex)
	}
	return ""
}

func (v *VendorConfig) WanPath(field string, wanIndex int) string {
	switch field {
	case "username":
		return formatPath(v.WAN.Username, wanIndex)
	case "password":
		return formatPath(v.WAN.Password, wanIndex)
	case "ip":
		return formatPath(v.WAN.IPAddress, wanIndex)
	case "mac":
		return formatPath(v.WAN.MACAddress, wanIndex)
	case "uptime":
		return formatPath(v.WAN.Uptime, wanIndex)
	case "conn_type":
		return formatPath(v.WAN.ConnType, wanIndex)
	case "vlan_id":
		return formatPath(v.WAN.VLANID, wanIndex)
	case "nat":
		return formatPath(v.WAN.NATEnabled, wanIndex)
	}
	return ""
}

func (v *VendorConfig) LanPath(field string) string {
	switch field {
	case "gateway":
		return v.LAN.GatewayIP
	case "dhcp_enable":
		return v.LAN.DHCPEnable
	case "dhcp_start":
		return v.LAN.DHCPStart
	case "dhcp_end":
		return v.LAN.DHCPEnd
	case "lease_time":
		return v.LAN.LeaseTime
	case "dns":
		return v.LAN.DNSServers
	case "subnet":
		return v.LAN.SubnetMask
	}
	return ""
}

func formatPath(template string, index int) string {
	if template == "" {
		return ""
	}
	return fmt.Sprintf(template, index)
}


