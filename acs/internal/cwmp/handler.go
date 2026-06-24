package cwmp

import (
	"encoding/xml"
	"fmt"
	"log"
	"net/http"
	"strings"
	"sync"
	"time"
)

type ConnectionRequestConfig struct {
	Username string
	Password string
	Timeout  time.Duration
}

type Handler struct {
	sessions     sync.Map
	crConfig     ConnectionRequestConfig
	OnInform     func(*InformData) error
	OnSaveParams func(sn string, params []ParameterValueStruct) error
	TaskQueue    *TaskQueue
	Store        Store
}

type Store interface {
	GetDeviceIDBySN(sn string) (string, error) // returns device_id or ""
	RecordOpticalStats(deviceID string, rx, tx, temp float64, pon string) error
	UpsertWiFiConfig(deviceID string, ssidIndex int, ssid, password, security string, enabled bool, channel, clients int) error
	UpsertWANConnection(deviceID string, wanIndex int, connType, username, ip, mac string, vlanID int, uptime int64) error
}

type InformData struct {
	SN           string
	OUI          string
	ProductClass string
	Manufacturer string
	IP           string
	Events       []Event
	RetryCount   int
	Params       []ParameterValueStruct
}

type Task struct {
	ID         string
	DeviceID   string
	Type       CommandType
	Params     []ParameterValueStruct
	ParamNames []string
	Done       chan *TaskResult
	CreatedAt  time.Time
}

type TaskResult struct {
	Params []ParameterValueStruct
	Status int
	Error  error
}

type TaskQueue struct {
	mu    sync.Mutex
	tasks map[string][]*Task
}

func NewTaskQueue() *TaskQueue {
	return &TaskQueue{tasks: make(map[string][]*Task)}
}

func (q *TaskQueue) Enqueue(deviceID string, task *Task) {
	q.mu.Lock()
	defer q.mu.Unlock()
	q.tasks[deviceID] = append(q.tasks[deviceID], task)
}

func (q *TaskQueue) Dequeue(deviceID string) *Task {
	q.mu.Lock()
	defer q.mu.Unlock()
	tasks, ok := q.tasks[deviceID]
	if !ok || len(tasks) == 0 {
		return nil
	}
	task := tasks[0]
	q.tasks[deviceID] = tasks[1:]
	if len(q.tasks[deviceID]) == 0 {
		delete(q.tasks, deviceID)
	}
	return task
}

func (q *TaskQueue) Peek(deviceID string) *Task {
	q.mu.Lock()
	defer q.mu.Unlock()
	tasks, ok := q.tasks[deviceID]
	if !ok || len(tasks) == 0 {
		return nil
	}
	return tasks[0]
}

func (q *TaskQueue) PendingCount(deviceID string) int {
	q.mu.Lock()
	defer q.mu.Unlock()
	return len(q.tasks[deviceID])
}

func NewHandler(crConfig ConnectionRequestConfig) *Handler {
	return &Handler{
		crConfig:  crConfig,
		TaskQueue: NewTaskQueue(),
	}
}

func (h *Handler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	body, err := ReadBody(r.Body)
	if err != nil {
		log.Printf("CWMP: read body error: %v", err)
		http.Error(w, "Bad request", http.StatusBadRequest)
		return
	}
	defer r.Body.Close()

	if len(body) == 0 {
		h.handleEmptyBody(w, r)
		return
	}

	env, err := ParseEnvelope(body)
	if err != nil {
		log.Printf("CWMP: parse envelope error: %v, body=%s", err, string(body[:min(len(body), 200)]))
		http.Error(w, "Bad request", http.StatusBadRequest)
		return
	}

	switch {
	case env.Body.Inform != nil:
		h.handleInform(w, r, env)
	case env.Body.GetRPCMethods != nil:
		h.handleGetRPCMethods(w, r, env)
	case env.Body.TransferComplete != nil:
		h.handleTransferComplete(w, r, env)
	case env.Body.GetParameterValuesResp != nil:
		h.handleGPVResponse(w, r, env)
	case env.Body.SetParameterValuesResp != nil:
		h.handleSPVResponse(w, r, env)
	case env.Body.GetParameterNamesResp != nil:
		h.handleGPNResponse(w, r, env)
	default:
		log.Printf("CWMP: unsupported message from %s", r.RemoteAddr)
		h.writeXML(w, BuildEmptyResponse(env.Header.ID))
	}
}

func (h *Handler) handleInform(w http.ResponseWriter, r *http.Request, env *Envelope) {
	inform := env.Body.Inform
	ip := strings.Split(r.RemoteAddr, ":")[0]

	data := &InformData{
		SN:           inform.DeviceID.SerialNumber,
		OUI:          inform.DeviceID.OUI,
		ProductClass: inform.DeviceID.ProductClass,
		Manufacturer: inform.DeviceID.Manufacturer,
		IP:           ip,
		Events:       inform.Events.Events,
		RetryCount:   inform.RetryCount,
		Params:       inform.ParameterList.Parameters,
	}

	if h.OnInform != nil {
		if err := h.OnInform(data); err != nil {
			log.Printf("CWMP: OnInform error for %s: %v", data.SN, err)
		}
	}

	if h.OnSaveParams != nil && len(data.Params) > 0 {
		if err := h.OnSaveParams(data.SN, data.Params); err != nil {
			log.Printf("CWMP: OnSaveParams error for %s: %v", data.SN, err)
		}
	}

	// Check for pending tasks — if any, piggyback command in this response
	pending := h.TaskQueue.Dequeue(data.SN)
	if pending != nil {
		resp := BuildInformResponse(env.Header.ID)
		var cmdXML string
		switch pending.Type {
		case CmdGetParameterValues:
			cmdXML = BuildGetParameterValues(pending.ID, pending.ParamNames)
		case CmdSetParameterValues:
			cmdXML = BuildSetParameterValues(pending.ID, pending.Params, "")
		case CmdReboot:
			cmdXML = BuildReboot(pending.ID, pending.ID)
		case CmdFactoryReset:
			cmdXML = BuildFactoryReset(pending.ID)
		default:
			log.Printf("CWMP: unknown piggyback task type %s for %s", pending.Type, data.SN)
		}
		if cmdXML != "" {
			// Combine InformResponse + command in multipart envelopes
			combined := resp + "\n" + cmdXML
			h.writeXMLMulti(w, combined)
			log.Printf("CWMP: piggybacked %s command on InformResponse for %s", pending.Type, data.SN)
			return
		}
		h.writeXML(w, resp)
		return
	}

	// Store the session for empty body (CPE polling)
	deviceSN := data.SN
	h.sessions.Store(deviceSN, &Session{
		DeviceID: deviceSN,
		LastSeen: time.Now(),
	})

	resp := BuildInformResponse(env.Header.ID)
	h.writeXML(w, resp)
}

func (h *Handler) handleEmptyBody(w http.ResponseWriter, r *http.Request) {
	ip := strings.Split(r.RemoteAddr, ":")[0]

	// Find device by IP in sessions
	var deviceSN string
	h.sessions.Range(func(key, value interface{}) bool {
		session := value.(*Session)
		if time.Since(session.LastSeen) < 5*time.Minute {
			deviceSN = session.DeviceID
			return false
		}
		return true
	})

	if deviceSN == "" {
		// No recent session — we could match by IP if we stored it
		// For now, just acknowledge
		log.Printf("CWMP: empty body from %s (no active session found)", ip)
		h.writeXML(w, BuildEmptyResponse("0"))
		return
	}

	// Check for pending tasks
	pending := h.TaskQueue.Dequeue(deviceSN)
	if pending != nil {
		log.Printf("CWMP: sending %s command to %s via CPE poll", pending.Type, deviceSN)
		var cmdXML string
		switch pending.Type {
		case CmdGetParameterValues:
			cmdXML = BuildGetParameterValues(pending.ID, pending.ParamNames)
		case CmdSetParameterValues:
			cmdXML = BuildSetParameterValues(pending.ID, pending.Params, "")
		case CmdReboot:
			cmdXML = BuildReboot(pending.ID, pending.ID)
		case CmdFactoryReset:
			cmdXML = BuildFactoryReset(pending.ID)
		default:
			log.Printf("CWMP: unknown task type %s for %s", pending.Type, deviceSN)
		}
		if cmdXML != "" {
			h.writeXML(w, cmdXML)
			return
		}
	}

	// Update session last seen
	if s, ok := h.sessions.Load(deviceSN); ok {
		s.(*Session).LastSeen = time.Now()
	}

	h.writeXML(w, BuildEmptyResponse("0"))
}

func (h *Handler) handleGetRPCMethods(w http.ResponseWriter, r *http.Request, env *Envelope) {
	resp := BuildGetRPCMethodsResponse(env.Header.ID)
	h.writeXML(w, resp)
}

func (h *Handler) handleTransferComplete(w http.ResponseWriter, r *http.Request, env *Envelope) {
	resp := BuildEmptyResponse(env.Header.ID)
	h.writeXML(w, resp)
}

func (h *Handler) handleGPVResponse(w http.ResponseWriter, r *http.Request, env *Envelope) {
	resp := env.Body.GetParameterValuesResp
	log.Printf("CWMP: GPV response with %d params", len(resp.ParameterList.Parameters))

	// Persist the received parameters to DB
	if h.Store != nil && len(resp.ParameterList.Parameters) > 0 {
		// Find device by extracting SN from the first parameter path
		params := resp.ParameterList.Parameters
		sn := extractDeviceSNFromParams(params)
		if sn != "" {
			h.persistDeviceParams(sn, params)
		}
	}

	// Signal any waiting task
	h.sessions.Range(func(key, value interface{}) bool {
		session := value.(*Session)
		if session.PendingResult != nil {
			session.PendingResult <- &TaskResult{
				Params: resp.ParameterList.Parameters,
				Status: 0,
			}
			close(session.PendingResult)
			session.PendingResult = nil
		}
		return true
	})

	h.writeXML(w, BuildEmptyResponse(env.Header.ID))
}

func (h *Handler) handleSPVResponse(w http.ResponseWriter, r *http.Request, env *Envelope) {
	resp := env.Body.SetParameterValuesResp
	log.Printf("CWMP: SPV response status=%d", resp.Status)

	// Signal any waiting task
	h.sessions.Range(func(key, value interface{}) bool {
		session := value.(*Session)
		if session.PendingResult != nil {
			session.PendingResult <- &TaskResult{
				Status: resp.Status,
			}
			close(session.PendingResult)
			session.PendingResult = nil
		}
		return true
	})

	h.writeXML(w, BuildEmptyResponse(env.Header.ID))
}

func (h *Handler) handleGPNResponse(w http.ResponseWriter, r *http.Request, env *Envelope) {
	resp := env.Body.GetParameterNamesResp
	log.Printf("CWMP: GPN response with %d params", len(resp.ParameterList.Parameters))

	// Log first few params for debugging
	for i, p := range resp.ParameterList.Parameters {
		if i < 5 {
			log.Printf("  GPN param: %s (writable=%v)", p.Name, p.Writable)
		}
	}

	h.writeXML(w, BuildEmptyResponse(env.Header.ID))
}

func (h *Handler) writeXML(w http.ResponseWriter, body string) {
	w.Header().Set("Content-Type", "text/xml; charset=utf-8")
	w.Write([]byte(body))
}

func (h *Handler) writeXMLMulti(w http.ResponseWriter, body string) {
	w.Header().Set("Content-Type", "text/xml; charset=utf-8")
	w.Write([]byte(body))
}

func (h *Handler) ConnectionRequest(url, username, password string) error {
	client := &http.Client{Timeout: h.crConfig.Timeout}
	req, err := http.NewRequest("GET", url, nil)
	if err != nil {
		return fmt.Errorf("create CR request: %w", err)
	}
	if username != "" {
		req.SetBasicAuth(username, password)
	}
	resp, err := client.Do(req)
	if err != nil {
		return fmt.Errorf("CR request failed: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("CR returned status %d", resp.StatusCode)
	}
	return nil
}

func (h *Handler) PrintSOAP(env *Envelope) {
	out, _ := xml.MarshalIndent(env, "", "  ")
	log.Printf("SOAP:\n%s", string(out))
}

type Session struct {
	DeviceID      string
	LastSeen      time.Time
	PendingResult chan *TaskResult
}

func extractDeviceSNFromParams(params []ParameterValueStruct) string {
	for _, p := range params {
		if strings.Contains(p.Name, "SerialNumber") || strings.Contains(p.Name, "SN") {
			return p.Value
		}
	}
	return ""
}

func (h *Handler) persistDeviceParams(sn string, params []ParameterValueStruct) {
	// Group params by category and persist
	var opticalRx, opticalTx, opticalTemp float64
	var opticalPON string
	hasOptical := false

	wanConns := make(map[int]map[string]string)
	wifiConfigs := make(map[int]map[string]string)

	for _, p := range params {
		name := p.Name
		val := p.Value

		// Optical stats
		if strings.Contains(name, "RXPower") || strings.Contains(name, "RxPower") {
			fmt.Sscanf(val, "%f", &opticalRx)
			hasOptical = true
		}
		if strings.Contains(name, "TXPower") || strings.Contains(name, "TxPower") {
			fmt.Sscanf(val, "%f", &opticalTx)
		}
		if strings.Contains(name, "Temperature") || strings.Contains(name, "temperature") {
			fmt.Sscanf(val, "%f", &opticalTemp)
		}
		if strings.Contains(name, "PON") || strings.Contains(name, "pon") {
			opticalPON = val
		}

		// WAN connections
		if strings.Contains(name, "WANPPPConnection") {
			idx := extractIndex(name, "WANPPPConnection.")
			if idx >= 0 {
				if wanConns[idx] == nil {
					wanConns[idx] = make(map[string]string)
				}
				switch {
				case strings.HasSuffix(name, "Username"):
					wanConns[idx]["username"] = val
				case strings.HasSuffix(name, "ExternalIPAddress"):
					wanConns[idx]["ip"] = val
				case strings.HasSuffix(name, "MACAddress"):
					wanConns[idx]["mac"] = val
				case strings.HasSuffix(name, "ConnectionType"):
					wanConns[idx]["conn_type"] = val
				case strings.HasSuffix(name, "Uptime"):
					wanConns[idx]["uptime"] = val
				case strings.Contains(name, "VLANID"):
					wanConns[idx]["vlan_id"] = val
				}
			}
		}

		// WiFi configs
		if strings.Contains(name, "WLANConfiguration") {
			idx := extractIndex(name, "WLANConfiguration.")
			if idx >= 0 {
				if wifiConfigs[idx] == nil {
					wifiConfigs[idx] = make(map[string]string)
				}
				switch {
				case strings.HasSuffix(name, "SSID"):
					wifiConfigs[idx]["ssid"] = val
				case strings.HasSuffix(name, "KeyPassphrase"):
					wifiConfigs[idx]["password"] = val
				case strings.HasSuffix(name, "Enable"):
					wifiConfigs[idx]["enabled"] = val
				case strings.HasSuffix(name, "BeaconType"):
					wifiConfigs[idx]["security"] = val
				case strings.HasSuffix(name, "Channel"):
					wifiConfigs[idx]["channel"] = val
				case strings.HasSuffix(name, "TotalAssociations"):
					wifiConfigs[idx]["clients"] = val
				}
			}
		}
	}

	// Save optical stats
	if hasOptical {
		deviceID, err := h.Store.GetDeviceIDBySN(sn)
		if err == nil && deviceID != "" {
			h.Store.RecordOpticalStats(deviceID, opticalRx, opticalTx, opticalTemp, opticalPON)
		}
	}

	// Save WAN connections
	for idx, conn := range wanConns {
		var vlanID int
		fmt.Sscanf(conn["vlan_id"], "%d", &vlanID)
		var uptime int64
		fmt.Sscanf(conn["uptime"], "%d", &uptime)

		deviceID, err := h.Store.GetDeviceIDBySN(sn)
		if err == nil && deviceID != "" {
			h.Store.UpsertWANConnection(deviceID, idx, conn["conn_type"], conn["username"], conn["ip"], conn["mac"], vlanID, uptime)
		}
	}

	// Save WiFi configs
	for idx, cfg := range wifiConfigs {
		enabled := cfg["enabled"] == "1" || cfg["enabled"] == "true"
		var channel int
		fmt.Sscanf(cfg["channel"], "%d", &channel)
		var clients int
		fmt.Sscanf(cfg["clients"], "%d", &clients)

		deviceID, err := h.Store.GetDeviceIDBySN(sn)
		if err == nil && deviceID != "" {
			h.Store.UpsertWiFiConfig(deviceID, idx, cfg["ssid"], cfg["password"], cfg["security"], enabled, channel, clients)
		}
	}

	log.Printf("CWMP: persisted device data for %s (optical=%v, wan=%d, wifi=%d)", sn, hasOptical, len(wanConns), len(wifiConfigs))
}

func extractIndex(name, prefix string) int {
	idx := strings.Index(name, prefix)
	if idx < 0 {
		return -1
	}
	after := name[idx+len(prefix):]
	var n int
	if _, err := fmt.Sscanf(after, "%d", &n); err == nil {
		return n
	}
	return -1
}

func min(a, b int) int {
	if a < b {
		return a
	}
	return b
}
