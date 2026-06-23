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
	sessions    sync.Map
	crConfig    ConnectionRequestConfig
	OnInform    func(*InformData) error
	OnSaveParams func(sn string, params []ParameterValueStruct) error
	TaskQueue   *TaskQueue
}

type InformData struct {
	SN            string
	OUI           string
	ProductClass  string
	Manufacturer  string
	IP            string
	Events        []Event
	RetryCount    int
	Params        []ParameterValueStruct
}

type Task struct {
	ID          string
	DeviceID    string
	Type        CommandType
	Params      []ParameterValueStruct
	ParamNames  []string
	Done        chan *TaskResult
	CreatedAt   time.Time
}

type TaskResult struct {
	Params  []ParameterValueStruct
	Status  int
	Error   error
}

type TaskQueue struct {
	mu    sync.Mutex
	tasks map[string][]*Task // device ID -> pending tasks
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

	if env.Body.Inform != nil {
		h.handleInform(w, r, env)
		return
	}
	if env.Body.GetRPCMethods != nil {
		h.handleGetRPCMethods(w, r, env)
		return
	}
	if env.Body.TransferComplete != nil {
		h.handleTransferComplete(w, r, env)
		return
	}
	if env.Body.GetParameterValuesResp != nil {
		h.handleGPVResponse(w, r, env)
		return
	}
	if env.Body.SetParameterValuesResp != nil {
		h.handleSPVResponse(w, r, env)
		return
	}
	if env.Body.GetParameterNamesResp != nil {
		h.handleGPNResponse(w, r, env)
		return
	}

	log.Printf("CWMP: unsupported message from %s", r.RemoteAddr)
	h.writeXML(w, BuildEmptyResponse(env.Header.ID))
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

	resp := BuildInformResponse(env.Header.ID)
	h.writeXML(w, resp)

	go h.dispatchTasks(data.SN)
}

func (h *Handler) dispatchTasks(sn string) {
	for {
		task := h.TaskQueue.Dequeue(sn)
		if task == nil {
			return
		}

		var xmlCmd string
		switch task.Type {
		case CmdGetParameterValues:
			xmlCmd = BuildGetParameterValues(task.ID, task.ParamNames)
		case CmdSetParameterValues:
			xmlCmd = BuildSetParameterValues(task.ID, task.Params, "")
		case CmdReboot:
			xmlCmd = BuildReboot(task.ID, task.ID)
		case CmdFactoryReset:
			xmlCmd = BuildFactoryReset(task.ID)
		default:
			log.Printf("CWMP: unknown task type %s for %s", task.Type, sn)
			continue
		}

		_ = xmlCmd
	}
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
}

func (h *Handler) handleSPVResponse(w http.ResponseWriter, r *http.Request, env *Envelope) {
	resp := env.Body.SetParameterValuesResp
	log.Printf("CWMP: SPV response status=%d", resp.Status)
}

func (h *Handler) handleGPNResponse(w http.ResponseWriter, r *http.Request, env *Envelope) {
	resp := env.Body.GetParameterNamesResp
	log.Printf("CWMP: GPN response with %d params", len(resp.ParameterList.Parameters))
}

func (h *Handler) handleEmptyBody(w http.ResponseWriter, r *http.Request) {
	log.Printf("CWMP: empty body from %s (CPE polling)", r.RemoteAddr)
	resp := BuildEmptyResponse("0")
	h.writeXML(w, resp)
}

func (h *Handler) writeXML(w http.ResponseWriter, body string) {
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
