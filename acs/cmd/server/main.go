package main

import (
	"encoding/json"
	"flag"
	"log"
	"net/http"
	"os"
	"strconv"
	"strings"
	"time"

	"github.com/feedad/kilusi-acs/internal/cwmp"
	"github.com/feedad/kilusi-acs/internal/db"
	"github.com/feedad/kilusi-acs/internal/vendor"
)

func main() {
	listenCWMP := flag.String("cwmp", ":7547", "CWMP server listen address")
	listenAPI := flag.String("api", ":7558", "API server listen address")
	dsn := flag.String("dsn", "", "PostgreSQL DSN (postgres://user:pass@host/db?sslmode=disable)")
	flag.Parse()

	if *dsn == "" {
		*dsn = os.Getenv("DATABASE_URL")
	}
	if *dsn == "" {
		log.Fatal("DATABASE_URL or -dsn required")
	}

	store, err := db.New(*dsn)
	if err != nil {
		log.Fatalf("Database: %v", err)
	}
	defer store.Close()

	if err := store.RunMigrations(); err != nil {
		log.Fatalf("Migrations: %v", err)
	}
	log.Println("Database migrations complete")

	crTimeout := 30 * time.Second
	if t := os.Getenv("CR_TIMEOUT"); t != "" {
		if d, err := time.ParseDuration(t); err == nil {
			crTimeout = d
		}
	}

	handler := cwmp.NewHandler(cwmp.ConnectionRequestConfig{
		Username: os.Getenv("CR_USERNAME"),
		Password: os.Getenv("CR_PASSWORD"),
		Timeout:  crTimeout,
	})

	// Wire up the database store for CWMP parameter persistence
	handler.Store = store

	handler.OnInform = func(data *cwmp.InformData) error {
		v := vendor.Detect(data.Manufacturer, data.ProductClass)
		vendorName := "unknown"
		if v != nil {
			vendorName = v.Manufacturer
		}
		log.Printf("ONU registered: SN=%s Vendor=%s Product=%s IP=%s Events=%v",
			data.SN, vendorName, data.ProductClass, data.IP, data.Events)

		// Upsert device into database
		device := &db.DeviceData{
			SN:           data.SN,
			OUI:          data.OUI,
			ProductClass: data.ProductClass,
			Manufacturer: data.Manufacturer,
			IPAddress:    data.IP,
			Status:       "online",
			LastInform:   time.Now(),
		}
		for _, p := range data.Params {
			if strings.HasSuffix(p.Name, "HardwareVersion") && device.HardwareVersion == "" {
				device.HardwareVersion = p.Value
			}
			if strings.HasSuffix(p.Name, "SoftwareVersion") && device.SoftwareVersion == "" {
				device.SoftwareVersion = p.Value
			}
			if strings.HasSuffix(p.Name, "FirmwareVersion") && device.SoftwareVersion == "" {
				device.SoftwareVersion = p.Value
			}
			if strings.HasSuffix(p.Name, "ConnectionRequestURL") {
				device.ConnRequestURL = p.Value
			}
		}
		if err := store.UpsertDevice(device); err != nil {
			log.Printf("CWMP: upsert device error for %s: %v", data.SN, err)
		}

		// Auto-GPV on BOOT events (0=BOOTSTRAP, 1=BOOT) or on first PERIODIC
		// for devices without any WAN data yet
		shouldGPV := isBootEvent(data.Events)
		if !shouldGPV {
			hasWANData, _ := store.HasWANConnections(data.SN)
			if !hasWANData {
				shouldGPV = true
			}
		}
		if shouldGPV {
			paramNames := buildAutoGPVPaths(v)
			log.Printf("CWMP: enqueuing auto-GPV for %s (vendor=%s, %d paths)",
				data.SN, vendorName, len(paramNames))
			handler.TaskQueue.Enqueue(data.SN, &cwmp.Task{
				ID:         "boot-gpv-" + data.SN,
				Type:       cwmp.CmdGetParameterValues,
				ParamNames: paramNames,
			})
		}

		return nil
	}

	handler.OnSaveParams = func(sn string, params []cwmp.ParameterValueStruct) error {
		var pppoeUsername string
		for _, p := range params {
			if len(p.Value) > 0 && len(p.Value) < 100 {
				log.Printf("  PARAM %s: %s = %s", sn, p.Name, p.Value)
			}
			// Extract PPPoE username from periodic Inform params
			if strings.HasSuffix(p.Name, "Username") &&
				!strings.Contains(p.Name, "ManagementServer") &&
				p.Value != "" {
				pppoeUsername = p.Value
			}
		}
		if pppoeUsername != "" {
			if err := store.UpdateDeviceField(sn, "pppoe_username", pppoeUsername); err != nil {
				log.Printf("CWMP: error updating PPPoE for %s: %v", sn, err)
			} else {
				log.Printf("CWMP: updated PPPoE username for %s: %s", sn, pppoeUsername)
			}
		}
		return nil
	}

	go func() {
		log.Printf("CWMP server listening on %s", *listenCWMP)
		if err := http.ListenAndServe(*listenCWMP, handler); err != nil {
			log.Fatalf("CWMP server: %v", err)
		}
	}()

	apiMux := http.NewServeMux()

	// Health
	apiMux.HandleFunc("/api/health", func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, map[string]string{"status": "ok"})
	})

	// Device list
	apiMux.HandleFunc("/api/devices", func(w http.ResponseWriter, r *http.Request) {
		if r.Method == "POST" {
			var d db.DeviceData
			if err := json.NewDecoder(r.Body).Decode(&d); err != nil {
				writeJSON(w, map[string]string{"error": err.Error()})
				return
			}
			d.LastInform = time.Now()
			d.Status = "pending"
			if err := store.UpsertDevice(&d); err != nil {
				writeJSON(w, map[string]string{"error": err.Error()})
				return
			}
			writeJSON(w, map[string]string{"status": "created"})
			return
		}

		search := r.URL.Query().Get("search")
		vendor := r.URL.Query().Get("vendor")
		status := r.URL.Query().Get("status")
		limit, _ := strconv.Atoi(r.URL.Query().Get("limit"))
		offset, _ := strconv.Atoi(r.URL.Query().Get("offset"))
		if limit <= 0 || limit > 100 {
			limit = 50
		}

		devices, total, err := store.ListDevices(search, vendor, status, limit, offset)
		if err != nil {
			writeJSON(w, map[string]string{"error": err.Error()})
			return
		}
		if devices == nil {
			devices = []db.DeviceData{}
		}
		writeJSON(w, map[string]interface{}{"total": total, "devices": devices})
	})

	// Device detail and sub-resources
	apiMux.HandleFunc("/api/devices/", func(w http.ResponseWriter, r *http.Request) {
		id := strings.TrimPrefix(r.URL.Path, "/api/devices/")
		id = strings.Split(id, "/")[0]
		if id == "" {
			http.NotFound(w, r)
			return
		}

		subPath := strings.TrimPrefix(r.URL.Path, "/api/devices/"+id)
		switch {
		case subPath == "" || subPath == "/":
			handleDeviceDetail(w, r, store, id)
		case subPath == "/optical":
			handleDeviceOptical(w, r, store)
		case subPath == "/wifi":
			handleDeviceWiFi(w, r, store, id, handler)
		case subPath == "/wan":
			handleDeviceWAN(w, r, store)
		case subPath == "/lan":
			handleDeviceLAN(w, r, store)
		case subPath == "/hosts":
			handleDeviceHosts(w, r, store)
		case subPath == "/command":
			handleDeviceCommand(w, r, store, id, handler)
		case subPath == "/connection-request":
			handleConnectionRequest(w, r, store, id, handler)
		default:
			http.NotFound(w, r)
		}
	})

	// Vendor registry info
	apiMux.HandleFunc("/api/vendors", func(w http.ResponseWriter, r *http.Request) {
		vendors := make([]string, 0, len(vendor.Registry))
		for name := range vendor.Registry {
			vendors = append(vendors, name)
		}
		writeJSON(w, map[string]interface{}{"vendors": vendors})
	})

	// Stats
	apiMux.HandleFunc("/api/stats", func(w http.ResponseWriter, r *http.Request) {
		_, total, _ := store.ListDevices("", "", "", 1, 0)
		online, _, _ := store.ListDevices("", "", "online", 10000, 0)
		offline, _, _ := store.ListDevices("", "", "offline", 10000, 0)
		pending, _, _ := store.ListDevices("", "", "pending", 10000, 0)
		writeJSON(w, map[string]interface{}{
			"total_devices":  total,
			"online_devices": len(online),
			"offline_devices": len(offline),
			"pending_devices": len(pending),
			"uptime":         time.Since(startTime).String(),
		})
	})

	log.Printf("API server listening on %s", *listenAPI)
	if err := http.ListenAndServe(*listenAPI, apiMux); err != nil {
		log.Fatalf("API server: %v", err)
	}
}

var startTime = time.Now()

func isBootEvent(events []cwmp.Event) bool {
	for _, e := range events {
		if e.EventCode == "0" || e.EventCode == "1" {
			return true
		}
	}
	return false
}

func buildAutoGPVPaths(v *vendor.VendorConfig) []string {
	paths := []string{
		"DeviceInfo.",
		"InternetGatewayDevice.WANDevice.1.",
		"InternetGatewayDevice.LANDevice.1.",
	}
	if v != nil {
		// Add vendor-specific optical paths
		if v.Optical.RXPower != "" {
			paths = append(paths, v.Optical.RXPower)
		}
		if v.Optical.Temperature != "" {
			paths = append(paths, v.Optical.Temperature)
		}
	}
	return paths
}

func handleDeviceDetail(w http.ResponseWriter, r *http.Request, store *db.Store, id string) {
	device, err := store.GetDeviceByID(id)
	if err != nil || device == nil {
		device, err = store.GetDeviceBySN(id)
		if err != nil {
			writeJSON(w, map[string]string{"error": err.Error()})
			return
		}
	}
	if device == nil {
		writeJSON(w, map[string]string{"error": "device not found"})
		return
	}

	// Get vendor info
	v := vendor.Detect(device.Manufacturer, device.ProductClass)
	vendorInfo := map[string]interface{}{"name": "unknown"}
	if v != nil {
		vendorInfo = map[string]interface{}{
			"name":      v.Manufacturer,
			"wan_index": v.WanIndex,
			"max_ssids": v.MaxSSIDs,
		}
	}

	writeJSON(w, map[string]interface{}{
		"device": device,
		"vendor": vendorInfo,
	})
}

func handleDeviceOptical(w http.ResponseWriter, r *http.Request, store *db.Store) {
	deviceID := extractDeviceIDFromPath(r.URL.Path, "/optical")
	limit, _ := strconv.Atoi(r.URL.Query().Get("limit"))
	stats, err := store.GetOpticalStats(deviceID, limit)
	if err != nil {
		writeJSON(w, map[string]string{"error": err.Error()})
		return
	}
	if stats == nil {
		stats = []db.OpticalStat{}
	}
	writeJSON(w, map[string]interface{}{"stats": stats})
}

func handleDeviceWiFi(w http.ResponseWriter, r *http.Request, store *db.Store, id string, handler *cwmp.Handler) {
	// Resolve device ID to SN
	device, _ := store.GetDeviceByID(id)
	if device == nil {
		device, _ = store.GetDeviceBySN(id)
	}
	if device == nil {
		writeJSON(w, map[string]string{"error": "device not found"})
		return
	}

	if r.Method == "PUT" {
		var cfg struct {
			SSIDIndex int    `json:"ssid_index"`
			SSID      string `json:"ssid"`
			Password  string `json:"password"`
			Enabled   *bool  `json:"enabled"`
		}
		if err := json.NewDecoder(r.Body).Decode(&cfg); err != nil {
			writeJSON(w, map[string]string{"error": err.Error()})
			return
		}

		v := vendor.Detect(device.Manufacturer, device.ProductClass)
		if v == nil {
			writeJSON(w, map[string]string{"error": "unknown vendor"})
			return
		}

		params := []cwmp.ParameterValueStruct{}
		if cfg.SSID != "" {
			params = append(params, cwmp.ParameterValueStruct{
				Name:  v.WifiPath("ssid", cfg.SSIDIndex),
				Value: cfg.SSID,
			})
		}
		if cfg.Password != "" {
			params = append(params, cwmp.ParameterValueStruct{
				Name:  v.WifiPath("password", cfg.SSIDIndex),
				Value: cfg.Password,
			})
		}
		if cfg.Enabled != nil {
			val := "0"
			if *cfg.Enabled {
				val = "1"
			}
			params = append(params, cwmp.ParameterValueStruct{
				Name:  v.WifiPath("enable", cfg.SSIDIndex),
				Value: val,
			})
		}

		if len(params) > 0 {
			task := &cwmp.Task{
				ID:       cwmp.GenCommandID(),
				DeviceID: device.SN,
				Type:     cwmp.CmdSetParameterValues,
				Params:   params,
				CreatedAt: time.Now(),
				Done:     make(chan *cwmp.TaskResult, 1),
			}
			handler.TaskQueue.Enqueue(device.SN, task)
			if device.ConnRequestURL != "" {
				go func() {
					crUser := os.Getenv("CR_USERNAME")
					crPass := os.Getenv("CR_PASSWORD")
					if err := handler.ConnectionRequest(device.ConnRequestURL, crUser, crPass); err != nil {
						log.Printf("CR trigger failed for %s: %v", device.SN, err)
					}
				}()
			}
			writeJSON(w, map[string]interface{}{"status": "queued", "task_id": task.ID})
			return
		}
		writeJSON(w, map[string]string{"error": "no parameters to update"})
		return
	}

	configs, err := store.GetWiFiConfigs(device.ID)
	if err != nil {
		writeJSON(w, map[string]string{"error": err.Error()})
		return
	}
	if configs == nil {
		configs = []db.WiFiConfig{}
	}
	writeJSON(w, map[string]interface{}{"wifi": configs})
}

func handleDeviceWAN(w http.ResponseWriter, r *http.Request, store *db.Store) {
	deviceID := extractDeviceIDFromPath(r.URL.Path, "/wan")
	conns, err := store.GetWANConnections(deviceID)
	if err != nil {
		writeJSON(w, map[string]string{"error": err.Error()})
		return
	}
	if conns == nil {
		conns = []db.WANConnection{}
	}
	writeJSON(w, map[string]interface{}{"wan": conns})
}

func handleDeviceLAN(w http.ResponseWriter, r *http.Request, store *db.Store) {
	deviceID := extractDeviceIDFromPath(r.URL.Path, "/lan")
	cfg, err := store.GetLANConfig(deviceID)
	if err != nil {
		writeJSON(w, map[string]string{"error": err.Error()})
		return
	}
	writeJSON(w, map[string]interface{}{"lan": cfg})
}

func handleDeviceHosts(w http.ResponseWriter, r *http.Request, store *db.Store) {
	deviceID := extractDeviceIDFromPath(r.URL.Path, "/hosts")
	hosts, err := store.GetConnectedHosts(deviceID)
	if err != nil {
		writeJSON(w, map[string]string{"error": err.Error()})
		return
	}
	if hosts == nil {
		hosts = []db.ConnectedHost{}
	}
	writeJSON(w, map[string]interface{}{"hosts": hosts})
}

func handleDeviceCommand(w http.ResponseWriter, r *http.Request, store *db.Store, id string, handler *cwmp.Handler) {
	if r.Method != "POST" {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req struct {
		Command    string   `json:"command"`
		ParamNames []string `json:"param_names"`
		Params     []struct {
			Name  string `json:"name"`
			Value string `json:"value"`
		} `json:"params"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, map[string]string{"error": err.Error()})
		return
	}

	device, err := store.GetDeviceByID(id)
	if err != nil || device == nil {
		device, err = store.GetDeviceBySN(id)
	}
	if device == nil {
		writeJSON(w, map[string]string{"error": "device not found"})
		return
	}

	task := &cwmp.Task{
		ID:        cwmp.GenCommandID(),
		DeviceID:  device.SN,
		CreatedAt: time.Now(),
		Done:      make(chan *cwmp.TaskResult, 1),
	}

	switch req.Command {
	case "get_parameter_values":
		task.Type = cwmp.CmdGetParameterValues
		task.ParamNames = req.ParamNames
		if len(task.ParamNames) == 0 {
			task.ParamNames = []string{"DeviceInfo."}
		}
	case "set_parameter_values":
		task.Type = cwmp.CmdSetParameterValues
		for _, p := range req.Params {
			task.Params = append(task.Params, cwmp.ParameterValueStruct{
				Name:  p.Name,
				Value: p.Value,
			})
		}
	case "reboot":
		task.Type = cwmp.CmdReboot
	default:
		writeJSON(w, map[string]string{"error": "unknown command: " + req.Command})
		return
	}

	handler.TaskQueue.Enqueue(device.SN, task)

	// Try CR to wake up the device
	if device.ConnRequestURL != "" {
		go func() {
			crUser := os.Getenv("CR_USERNAME")
			crPass := os.Getenv("CR_PASSWORD")
			if err := handler.ConnectionRequest(device.ConnRequestURL, crUser, crPass); err != nil {
				log.Printf("CR trigger failed for %s: %v", device.SN, err)
			}
		}()
	}

	// Wait for task result with timeout
	select {
	case result := <-task.Done:
		writeJSON(w, map[string]interface{}{
			"status": "completed",
			"result": result,
		})
	case <-time.After(60 * time.Second):
		writeJSON(w, map[string]interface{}{
			"status":   "timeout",
			"task_id":  task.ID,
		})
	}
}

func handleConnectionRequest(w http.ResponseWriter, r *http.Request, store *db.Store, id string, handler *cwmp.Handler) {
	device, err := store.GetDeviceByID(id)
	if err != nil || device == nil {
		device, err = store.GetDeviceBySN(id)
	}
	if device == nil {
		writeJSON(w, map[string]string{"error": "device not found"})
		return
	}
	if device.ConnRequestURL == "" {
		writeJSON(w, map[string]string{"error": "no connection request URL"})
		return
	}

	crUser := os.Getenv("CR_USERNAME")
	crPass := os.Getenv("CR_PASSWORD")
	if err := handler.ConnectionRequest(device.ConnRequestURL, crUser, crPass); err != nil {
		writeJSON(w, map[string]string{"error": err.Error()})
		return
	}
	writeJSON(w, map[string]interface{}{"status": "triggered"})
}

func extractDeviceIDFromPath(path, suffix string) string {
	// Path: /api/devices/{id}/optical
	id := strings.TrimPrefix(path, "/api/devices/")
	id = strings.TrimSuffix(id, suffix)
	id = strings.TrimSuffix(id, "/")
	return id
}

func writeJSON(w http.ResponseWriter, v interface{}) {
	w.Header().Set("Content-Type", "application/json")
	b, err := json.Marshal(v)
	if err != nil {
		w.Write([]byte(`{"error":"json marshal error"}`))
		return
	}
	w.Write(b)
}
