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

type Device struct {
	ID               string    `json:"id"`
	SN               string    `json:"sn"`
	ProductClass     string    `json:"product_class"`
	Manufacturer     string    `json:"manufacturer"`
	OUI              string    `json:"oui"`
	HardwareVersion  string    `json:"hardware_version"`
	SoftwareVersion  string    `json:"software_version"`
	Status           string    `json:"status"`
	LastInform       time.Time `json:"last_inform"`
	LastBoot         time.Time `json:"last_boot"`
	ConnRequestURL   string    `json:"conn_request_url"`
	PeriodicInterval int       `json:"periodic_interval"`
	PPPoEUsername    string    `json:"pppoe_username"`
	IPAddress        string    `json:"ip_address"`
	MACAddress       string    `json:"mac_address"`
}

func (s *Store) UpsertDevice(d *Device) error {
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
		d.PPPoEUsername, d.IPAddress, d.MACAddress)
	return err
}

func (s *Store) ListDevices(search, vendorFilter, statusFilter string, limit, offset int) ([]Device, int, error) {
	query := "SELECT id, sn, product_class, manufacturer, oui, hardware_version, software_version, status, last_inform, last_boot, conn_request_url, periodic_interval, pppoe_username, ip_address, mac_address FROM acs_devices WHERE 1=1"
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

	var devices []Device
	for rows.Next() {
		var d Device
		if err := rows.Scan(&d.ID, &d.SN, &d.ProductClass, &d.Manufacturer, &d.OUI,
			&d.HardwareVersion, &d.SoftwareVersion, &d.Status, &d.LastInform, &d.LastBoot,
			&d.ConnRequestURL, &d.PeriodicInterval, &d.PPPoEUsername, &d.IPAddress, &d.MACAddress); err != nil {
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

func (s *Store) UpsertWiFiConfig(deviceID string, ssidIndex int, ssid, password, security string, enabled bool, channel, clients int) error {
	_, err := s.DB.Exec(`
		INSERT INTO acs_wifi_configs (device_id, ssid_index, ssid, password, security_mode, enabled, channel, active_clients)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
		ON CONFLICT (device_id, ssid_index) DO UPDATE SET
			ssid=$3, password=$4, security_mode=$5, enabled=$6, channel=$7, active_clients=$8`,
		deviceID, ssidIndex, ssid, password, security, enabled, channel, clients)
	return err
}

func (s *Store) UpsertWANConnection(deviceID string, wanIndex int, connType, username, ip, mac string, vlanID int, uptime int64) error {
	_, err := s.DB.Exec(`
		INSERT INTO acs_wan_connections (device_id, wan_index, connection_type, username, ip_address, mac_address, vlan_id, uptime)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
		ON CONFLICT (device_id, wan_index) DO UPDATE SET
			connection_type=$3, username=$4, ip_address=$5, mac_address=$6, vlan_id=$7, uptime=$8`,
		deviceID, wanIndex, connType, username, ip, mac, vlanID, uptime)
	return err
}
