package cwmp

import (
	"bytes"
	"encoding/xml"
	"fmt"
	"io"
	"strings"
	"sync"
)

var (
	nsPrefixes = []string{"soap:", "soap-env:", "SOAP-ENV:", "cwmp:", "v1:", "v2:", "v3:"}
	// xmlns patterns to strip from elements
	xmlnsAttrs = []string{
		`xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"`,
		`xmlns:soap-enc="http://schemas.xmlsoap.org/soap/encoding/"`,
		`xmlns:cwmp="urn:dslforum-org:cwmp-1-0"`,
		`xmlns:cwmp="urn:dslforum-org:cwmp-1-1"`,
		`xmlns:cwmp="urn:dslforum-org:cwmp-1-2"`,
		`xmlns:cwmp="urn:dslforum-org:cwmp-1-3"`,
		`xmlns:cwmp="urn:dslforum-org:cwmp-1-4"`,
		`xmlns:xsd="http://www.w3.org/2001/XMLSchema"`,
		`xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"`,
	}
)

func normalizeXML(data []byte) []byte {
	s := string(data)

	for _, prefix := range nsPrefixes {
		s = strings.ReplaceAll(s, prefix, "")
	}
	for _, attr := range xmlnsAttrs {
		s = strings.ReplaceAll(s, attr, "")
	}
	s = strings.ReplaceAll(s, ` xmlns="urn:dslforum-org:cwmp-1-0"`, "")
	s = strings.ReplaceAll(s, ` xmlns="urn:dslforum-org:cwmp-1-1"`, "")
	s = strings.ReplaceAll(s, ` xmlns="urn:dslforum-org:cwmp-1-2"`, "")
	s = strings.ReplaceAll(s, ` xmlns="urn:dslforum-org:cwmp-1-3"`, "")
	s = strings.ReplaceAll(s, ` xmlns="urn:dslforum-org:cwmp-1-4"`, "")

	return []byte(s)
}

func ParseEnvelope(body []byte) (*Envelope, error) {
	clean := normalizeXML(body)

	dec := xml.NewDecoder(bytes.NewReader(clean))
	dec.Strict = false

	var env Envelope
	if err := dec.Decode(&env); err != nil {
		return nil, fmt.Errorf("parse envelope: %w", err)
	}
	return &env, nil
}

type SessionID string

type Session struct {
	ID         SessionID
	DeviceID   DeviceID
	Events     []Event
	mu         sync.Mutex
	currentCmd *PendingCommand
}

type PendingCommand struct {
	ID        string
	Type      CommandType
	XML       string
	Done      chan *CommandResult
}

type CommandType string

const (
	CmdGetParameterValues  CommandType = "GetParameterValues"
	CmdSetParameterValues  CommandType = "SetParameterValues"
	CmdGetParameterNames   CommandType = "GetParameterNames"
	CmdReboot              CommandType = "Reboot"
	CmdFactoryReset        CommandType = "FactoryReset"
	CmdDownload            CommandType = "Download"
	CmdAddObject           CommandType = "AddObject"
	CmdDeleteObject        CommandType = "DeleteObject"
)

type CommandResult struct {
	Params   []ParameterValueStruct
	Status   int
	Err      error
}

func (s *Session) SetCommand(cmd *PendingCommand) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.currentCmd = cmd
}

func (s *Session) GetCommand() *PendingCommand {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.currentCmd
}

func (s *Session) ClearCommand() {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.currentCmd = nil
}

func ReadBody(r io.Reader) ([]byte, error) {
	return io.ReadAll(r)
}
