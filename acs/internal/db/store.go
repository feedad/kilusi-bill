package db

import (
	"database/sql"
	"fmt"
	"time"

	_ "github.com/lib/pq"
)

type Store struct {
	DB *sql.DB
}

func New(dsn string) (*Store, error) {
	db, err := sql.Open("postgres", dsn)
	if err != nil {
		return nil, fmt.Errorf("open db: %w", err)
	}
	if err := db.Ping(); err != nil {
		return nil, fmt.Errorf("ping db: %w", err)
	}
	db.SetMaxOpenConns(25)
	db.SetMaxIdleConns(5)
	db.SetConnMaxLifetime(5 * time.Minute)
	return &Store{DB: db}, nil
}

func (s *Store) Close() error {
	return s.DB.Close()
}

func (s *Store) RunMigrations() error {
	migrations := []string{
		`CREATE TABLE IF NOT EXISTS acs_devices (
			id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
			sn VARCHAR(64) NOT NULL UNIQUE,
			product_class VARCHAR(32),
			manufacturer VARCHAR(32),
			oui VARCHAR(12),
			hardware_version VARCHAR(32),
			software_version VARCHAR(64),
			spec_version VARCHAR(16),
			last_inform TIMESTAMPTZ,
			last_boot TIMESTAMPTZ,
			status VARCHAR(16) DEFAULT 'offline',
			conn_request_url VARCHAR(256),
			periodic_interval INT DEFAULT 200,
			pppoe_username VARCHAR(128),
			ip_address INET,
			mac_address MACADDR,
			created_at TIMESTAMPTZ DEFAULT NOW(),
			updated_at TIMESTAMPTZ DEFAULT NOW()
		)`,
		`CREATE TABLE IF NOT EXISTS acs_optical_stats (
			id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
			device_id UUID REFERENCES acs_devices(id) ON DELETE CASCADE,
			rx_power NUMERIC(8,2),
			tx_power NUMERIC(8,2),
			temperature NUMERIC(6,2),
			supply_voltage NUMERIC(8,2),
			bias_current NUMERIC(8,2),
			pon_mode VARCHAR(8),
			recorded_at TIMESTAMPTZ DEFAULT NOW()
		)`,
		`CREATE TABLE IF NOT EXISTS acs_wifi_configs (
			id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
			device_id UUID REFERENCES acs_devices(id) ON DELETE CASCADE,
			ssid_index INT NOT NULL,
			ssid VARCHAR(64),
			password VARCHAR(128),
			enabled BOOLEAN DEFAULT true,
			security_mode VARCHAR(32),
			channel INT DEFAULT 0,
			active_clients INT DEFAULT 0,
			UNIQUE(device_id, ssid_index)
		)`,
		`CREATE TABLE IF NOT EXISTS acs_wan_connections (
			id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
			device_id UUID REFERENCES acs_devices(id) ON DELETE CASCADE,
			wan_index INT NOT NULL,
			connection_type VARCHAR(32),
			username VARCHAR(128),
			ip_address INET,
			mac_address MACADDR,
			vlan_id INT,
			uptime BIGINT,
			UNIQUE(device_id, wan_index)
		)`,
		`CREATE TABLE IF NOT EXISTS acs_lan_configs (
			id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
			device_id UUID REFERENCES acs_devices(id) ON DELETE CASCADE UNIQUE,
			gateway_ip INET,
			subnet_mask INET,
			dhcp_enabled BOOLEAN DEFAULT true,
			dhcp_start_ip INET,
			dhcp_end_ip INET,
			dhcp_lease_time INT DEFAULT 86400,
			dns_servers VARCHAR(256)
		)`,
		`CREATE TABLE IF NOT EXISTS acs_connected_hosts (
			id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
			device_id UUID REFERENCES acs_devices(id) ON DELETE CASCADE,
			ip_address INET NOT NULL,
			mac_address MACADDR,
			hostname VARCHAR(128),
			interface_type VARCHAR(32),
			last_seen TIMESTAMPTZ DEFAULT NOW(),
			UNIQUE(device_id, mac_address)
		)`,
		`CREATE INDEX IF NOT EXISTS idx_acs_devices_sn ON acs_devices(sn)`,
		`CREATE INDEX IF NOT EXISTS idx_acs_devices_status ON acs_devices(status)`,
		`CREATE INDEX IF NOT EXISTS idx_acs_optical_device ON acs_optical_stats(device_id)`,
	}

	for _, m := range migrations {
		if _, err := s.DB.Exec(m); err != nil {
			return fmt.Errorf("migration: %w\nSQL: %s", err, m)
		}
	}
	return nil
}

type DeviceData struct {
	ID               string    `json:"id"`
	SN               string    `json:"sn"`
	ProductClass     string    `json:"product_class"`
	Manufacturer     string    `json:"manufacturer"`
	OUI              string    `json:"oui"`
	HardwareVersion  string    `json:"hardware_version"`
	SoftwareVersion  string    `json:"software_version"`
	SpecVersion      string    `json:"spec_version"`
	Status           string    `json:"status"`
	LastInform       time.Time `json:"last_inform"`
	LastBoot         time.Time `json:"last_boot"`
	ConnRequestURL   string    `json:"conn_request_url"`
	PeriodicInterval int       `json:"periodic_interval"`
	PPPoEUsername    string    `json:"pppoe_username"`
	IPAddress        string    `json:"ip_address"`
	MACAddress       string    `json:"mac_address"`
	CreatedAt        time.Time `json:"created_at"`
	UpdatedAt        time.Time `json:"updated_at"`
}

type OpticalStat struct {
	ID         string    `json:"id"`
	DeviceID   string    `json:"device_id"`
	RXPower    float64   `json:"rx_power"`
	TXPower    float64   `json:"tx_power"`
	Temperature float64  `json:"temperature"`
	Voltage    float64   `json:"supply_voltage"`
	BiasCurrent float64  `json:"bias_current"`
	PONMode    string    `json:"pon_mode"`
	RecordedAt time.Time `json:"recorded_at"`
}

type WiFiConfig struct {
	ID           string `json:"id"`
	DeviceID     string `json:"device_id"`
	SSIDIndex    int    `json:"ssid_index"`
	SSID         string `json:"ssid"`
	Password     string `json:"password"`
	Enabled      bool   `json:"enabled"`
	SecurityMode string `json:"security_mode"`
	Channel      int    `json:"channel"`
	ActiveClients int   `json:"active_clients"`
}

type WANConnection struct {
	ID             string `json:"id"`
	DeviceID       string `json:"device_id"`
	WANIndex       int    `json:"wan_index"`
	ConnectionType string `json:"connection_type"`
	Username       string `json:"username"`
	IPAddress      string `json:"ip_address"`
	MACAddress     string `json:"mac_address"`
	VLANID         int    `json:"vlan_id"`
	Uptime         int64  `json:"uptime"`
}

type LANConfig struct {
	ID          string `json:"id"`
	DeviceID    string `json:"device_id"`
	GatewayIP   string `json:"gateway_ip"`
	SubnetMask  string `json:"subnet_mask"`
	DHCPEnabled bool   `json:"dhcp_enabled"`
	DHCPStartIP string `json:"dhcp_start_ip"`
	DHCPEndIP   string `json:"dhcp_end_ip"`
	DHCPLease   int    `json:"dhcp_lease_time"`
	DNSServers  string `json:"dns_servers"`
}

type ConnectedHost struct {
	ID            string    `json:"id"`
	DeviceID      string    `json:"device_id"`
	IPAddress     string    `json:"ip_address"`
	MACAddress    string    `json:"mac_address"`
	Hostname      string    `json:"hostname"`
	InterfaceType string    `json:"interface_type"`
	LastSeen      time.Time `json:"last_seen"`
}

func (s *Store) GetDeviceIDBySN(sn string) (string, error) {
	var id string
	err := s.DB.QueryRow(`SELECT id FROM acs_devices WHERE sn = $1`, sn).Scan(&id)
	if err == sql.ErrNoRows {
		return "", nil
	}
	if err != nil {
		return "", err
	}
	return id, nil
}

func (s *Store) HasWANConnections(sn string) (bool, error) {
	var count int
	err := s.DB.QueryRow(`
		SELECT COUNT(*) FROM acs_wan_connections w
		JOIN acs_devices d ON d.id = w.device_id
		WHERE d.sn = $1`, sn).Scan(&count)
	if err != nil {
		return false, err
	}
	return count > 0, nil
}

func (s *Store) GetDeviceBySN(sn string) (*DeviceData, error) {
	d := &DeviceData{}
	err := s.DB.QueryRow(`
		SELECT id, sn, product_class, manufacturer, oui, hardware_version, software_version,
			COALESCE(spec_version,''), status, last_inform, last_boot, conn_request_url, periodic_interval,
			pppoe_username, COALESCE(ip_address::text,''), COALESCE(mac_address::text,''), created_at, updated_at
		FROM acs_devices WHERE sn = $1`, sn).Scan(
		&d.ID, &d.SN, &d.ProductClass, &d.Manufacturer, &d.OUI,
		&d.HardwareVersion, &d.SoftwareVersion, &d.SpecVersion,
		&d.Status, &d.LastInform, &d.LastBoot, &d.ConnRequestURL,
		&d.PeriodicInterval, &d.PPPoEUsername, &d.IPAddress, &d.MACAddress,
		&d.CreatedAt, &d.UpdatedAt)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return d, nil
}

func (s *Store) GetDeviceByID(id string) (*DeviceData, error) {
	d := &DeviceData{}
	err := s.DB.QueryRow(`
		SELECT id, sn, product_class, manufacturer, oui, hardware_version, software_version,
			COALESCE(spec_version,''), status, last_inform, last_boot, conn_request_url, periodic_interval,
			pppoe_username, COALESCE(ip_address::text,''), COALESCE(mac_address::text,''), created_at, updated_at
		FROM acs_devices WHERE id = $1`, id).Scan(
		&d.ID, &d.SN, &d.ProductClass, &d.Manufacturer, &d.OUI,
		&d.HardwareVersion, &d.SoftwareVersion, &d.SpecVersion,
		&d.Status, &d.LastInform, &d.LastBoot, &d.ConnRequestURL,
		&d.PeriodicInterval, &d.PPPoEUsername, &d.IPAddress, &d.MACAddress,
		&d.CreatedAt, &d.UpdatedAt)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return d, nil
}

func nilIfEmpty(s string) interface{} {
	if s == "" {
		return nil
	}
	return s
}

func (s *Store) UpsertDevice(d *DeviceData) error {
	_, err := s.DB.Exec(`
		INSERT INTO acs_devices (sn, product_class, manufacturer, oui, hardware_version, software_version,
			status, last_inform, last_boot, conn_request_url, periodic_interval, pppoe_username, ip_address, mac_address)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
		ON CONFLICT (sn) DO UPDATE SET
			product_class=$2, manufacturer=$3, oui=$4, hardware_version=$5, software_version=$6,
			status=$7, last_inform=$8, last_boot=$9, conn_request_url=$10, periodic_interval=$11,
			pppoe_username=$12, ip_address=$13, mac_address=$14, updated_at=NOW()`,
		d.SN, d.ProductClass, d.Manufacturer, d.OUI, d.HardwareVersion, d.SoftwareVersion,
		d.Status, d.LastInform, d.LastBoot, d.ConnRequestURL, d.PeriodicInterval,
		d.PPPoEUsername, nilIfEmpty(d.IPAddress), nilIfEmpty(d.MACAddress))
	return err
}

func (s *Store) ListDevices(search, vendorFilter, statusFilter string, limit, offset int) ([]DeviceData, int, error) {
	query := "SELECT id, sn, product_class, manufacturer, oui, hardware_version, software_version, COALESCE(spec_version,''), status, last_inform, last_boot, conn_request_url, periodic_interval, pppoe_username, COALESCE(ip_address::text,''), COALESCE(mac_address::text,''), created_at, updated_at FROM acs_devices WHERE 1=1"
	countQuery := "SELECT COUNT(*) FROM acs_devices WHERE 1=1"
	args := []interface{}{}
	argIdx := 1

	if search != "" {
		f := fmt.Sprintf(" AND (sn ILIKE $%d OR pppoe_username ILIKE $%d)", argIdx, argIdx)
		query += f
		countQuery += f
		args = append(args, "%"+search+"%")
		argIdx++
	}
	if vendorFilter != "" {
		f := fmt.Sprintf(" AND manufacturer = $%d", argIdx)
		query += f
		countQuery += f
		args = append(args, vendorFilter)
		argIdx++
	}
	if statusFilter != "" {
		f := fmt.Sprintf(" AND status = $%d", argIdx)
		query += f
		countQuery += f
		args = append(args, statusFilter)
		argIdx++
	}

	var total int
	if err := s.DB.QueryRow(countQuery, args...).Scan(&total); err != nil {
		return nil, 0, err
	}

	query += fmt.Sprintf(" ORDER BY last_inform DESC NULLS LAST LIMIT $%d OFFSET $%d", argIdx, argIdx+1)
	args = append(args, limit, offset)

	rows, err := s.DB.Query(query, args...)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()

	var devices []DeviceData
	for rows.Next() {
		var d DeviceData
		if err := rows.Scan(&d.ID, &d.SN, &d.ProductClass, &d.Manufacturer, &d.OUI,
			&d.HardwareVersion, &d.SoftwareVersion, &d.SpecVersion,
			&d.Status, &d.LastInform, &d.LastBoot,
			&d.ConnRequestURL, &d.PeriodicInterval, &d.PPPoEUsername,
			&d.IPAddress, &d.MACAddress, &d.CreatedAt, &d.UpdatedAt); err != nil {
			return nil, 0, err
		}
		devices = append(devices, d)
	}
	return devices, total, nil
}

func (s *Store) RecordOpticalStats(deviceID string, rx, tx float64, temp float64, pon string) error {
	_, err := s.DB.Exec(`
		INSERT INTO acs_optical_stats (device_id, rx_power, tx_power, temperature, pon_mode)
		VALUES ($1, $2, $3, $4, $5)`,
		deviceID, rx, tx, temp, pon)
	return err
}

func (s *Store) GetOpticalStats(deviceID string, limit int) ([]OpticalStat, error) {
	if limit <= 0 {
		limit = 50
	}
	rows, err := s.DB.Query(`
		SELECT id, device_id, rx_power, tx_power, temperature, supply_voltage, bias_current, pon_mode, recorded_at
		FROM acs_optical_stats WHERE device_id = $1 ORDER BY recorded_at DESC LIMIT $2`, deviceID, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var stats []OpticalStat
	for rows.Next() {
		var st OpticalStat
		if err := rows.Scan(&st.ID, &st.DeviceID, &st.RXPower, &st.TXPower, &st.Temperature,
			&st.Voltage, &st.BiasCurrent, &st.PONMode, &st.RecordedAt); err != nil {
			return nil, err
		}
		stats = append(stats, st)
	}
	return stats, nil
}

func (s *Store) UpsertWiFiConfig(deviceID string, ssidIndex int, ssid, password, security string, enabled bool, channel, clients int) error {
	_, err := s.DB.Exec(`
		INSERT INTO acs_wifi_configs (device_id, ssid_index, ssid, password, security_mode, enabled, channel, active_clients)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
		ON CONFLICT (device_id, ssid_index) DO UPDATE SET
			ssid=$3, password=$4, security_mode=$5, enabled=$6, channel=$7, active_clients=$8`,
		deviceID, ssidIndex, ssid, password, security, enabled, channel, clients)
	return err
}

func (s *Store) GetWiFiConfigs(deviceID string) ([]WiFiConfig, error) {
	rows, err := s.DB.Query(`
		SELECT id, device_id, ssid_index, ssid, password, enabled, security_mode, channel, active_clients
		FROM acs_wifi_configs WHERE device_id = $1 ORDER BY ssid_index`, deviceID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var configs []WiFiConfig
	for rows.Next() {
		var c WiFiConfig
		if err := rows.Scan(&c.ID, &c.DeviceID, &c.SSIDIndex, &c.SSID, &c.Password,
			&c.Enabled, &c.SecurityMode, &c.Channel, &c.ActiveClients); err != nil {
			return nil, err
		}
		configs = append(configs, c)
	}
	return configs, nil
}

func (s *Store) UpsertWANConnection(deviceID string, wanIndex int, connType, username, ip, mac string, vlanID int, uptime int64) error {
	_, err := s.DB.Exec(`
		INSERT INTO acs_wan_connections (device_id, wan_index, connection_type, username, ip_address, mac_address, vlan_id, uptime)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
		ON CONFLICT (device_id, wan_index) DO UPDATE SET
			connection_type=$3, username=$4, ip_address=$5, mac_address=$6, vlan_id=$7, uptime=$8`,
		deviceID, wanIndex, connType, username, nilIfEmpty(ip), nilIfEmpty(mac), vlanID, uptime)
	return err
}

func (s *Store) GetWANConnections(deviceID string) ([]WANConnection, error) {
	rows, err := s.DB.Query(`
		SELECT id, device_id, wan_index, connection_type, username, ip_address, mac_address, vlan_id, uptime
		FROM acs_wan_connections WHERE device_id = $1 ORDER BY wan_index`, deviceID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var conns []WANConnection
	for rows.Next() {
		var c WANConnection
		if err := rows.Scan(&c.ID, &c.DeviceID, &c.WANIndex, &c.ConnectionType,
			&c.Username, &c.IPAddress, &c.MACAddress, &c.VLANID, &c.Uptime); err != nil {
			return nil, err
		}
		conns = append(conns, c)
	}
	return conns, nil
}

func (s *Store) UpsertLANConfig(deviceID string, gateway, subnet string, dhcpEnabled bool, dhcpStart, dhcpEnd string, leaseTime int, dns string) error {
	_, err := s.DB.Exec(`
		INSERT INTO acs_lan_configs (device_id, gateway_ip, subnet_mask, dhcp_enabled, dhcp_start_ip, dhcp_end_ip, dhcp_lease_time, dns_servers)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
		ON CONFLICT (device_id) DO UPDATE SET
			gateway_ip=$2, subnet_mask=$3, dhcp_enabled=$4, dhcp_start_ip=$5, dhcp_end_ip=$6, dhcp_lease_time=$7, dns_servers=$8`,
		deviceID, gateway, subnet, dhcpEnabled, dhcpStart, dhcpEnd, leaseTime, dns)
	return err
}

func (s *Store) GetLANConfig(deviceID string) (*LANConfig, error) {
	c := &LANConfig{}
	err := s.DB.QueryRow(`
		SELECT id, device_id, gateway_ip, subnet_mask, dhcp_enabled, dhcp_start_ip, dhcp_end_ip, dhcp_lease_time, dns_servers
		FROM acs_lan_configs WHERE device_id = $1`, deviceID).Scan(
		&c.ID, &c.DeviceID, &c.GatewayIP, &c.SubnetMask, &c.DHCPEnabled,
		&c.DHCPStartIP, &c.DHCPEndIP, &c.DHCPLease, &c.DNSServers)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return c, nil
}

func (s *Store) RecordConnectedHost(deviceID, ip, mac, hostname, iface string) error {
	_, err := s.DB.Exec(`
		INSERT INTO acs_connected_hosts (device_id, ip_address, mac_address, hostname, interface_type)
		VALUES ($1,$2,$3,$4,$5)
		ON CONFLICT (device_id, mac_address) DO UPDATE SET
			ip_address=$2, hostname=$4, interface_type=$5, last_seen=NOW()`,
		deviceID, nilIfEmpty(ip), nilIfEmpty(mac), hostname, iface)
	return err
}

func (s *Store) UpdateDeviceField(sn, field, value string) error {
	if value == "" {
		return nil
	}
	q := fmt.Sprintf(`UPDATE acs_devices SET %s = $2, updated_at = NOW() WHERE sn = $1`, field)
	_, err := s.DB.Exec(q, sn, value)
	return err
}

func (s *Store) GetConnectedHosts(deviceID string) ([]ConnectedHost, error) {
	rows, err := s.DB.Query(`
		SELECT id, device_id, ip_address, mac_address, hostname, interface_type, last_seen
		FROM acs_connected_hosts WHERE device_id = $1 ORDER BY last_seen DESC`, deviceID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var hosts []ConnectedHost
	for rows.Next() {
		var h ConnectedHost
		if err := rows.Scan(&h.ID, &h.DeviceID, &h.IPAddress, &h.MACAddress,
			&h.Hostname, &h.InterfaceType, &h.LastSeen); err != nil {
			return nil, err
		}
		hosts = append(hosts, h)
	}
	return hosts, nil
}
