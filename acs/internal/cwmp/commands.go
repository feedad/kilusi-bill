package cwmp

import (
	"fmt"
	"sync/atomic"
)

func BuildInformResponse(id string) string {
	return fmt.Sprintf(`<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/" xmlns:cwmp="urn:dslforum-org:cwmp-1-0">
  <soap:Header><cwmp:ID soap:mustUnderstand="1">%s</cwmp:ID></soap:Header>
  <soap:Body><cwmp:InformResponse><MaxEnvelopes>1</MaxEnvelopes></cwmp:InformResponse></soap:Body>
</soap:Envelope>`, id)
}

func BuildGetParameterValues(id string, names []string) string {
	paramXML := ""
	for _, n := range names {
		paramXML += fmt.Sprintf("<string>%s</string>", n)
	}
	return fmt.Sprintf(`<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/" xmlns:cwmp="urn:dslforum-org:cwmp-1-0" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:SOAP-ENC="http://schemas.xmlsoap.org/soap/encoding/">
  <soap:Header><cwmp:ID soap:mustUnderstand="1">%s</cwmp:ID></soap:Header>
  <soap:Body><cwmp:GetParameterValues><ParameterNames SOAP-ENC:arrayType="xsd:string[%d]">%s</ParameterNames></cwmp:GetParameterValues></soap:Body>
</soap:Envelope>`, id, len(names), paramXML)
}

func BuildSetParameterValues(id string, params []ParameterValueStruct, key string) string {
	paramXML := ""
	for _, p := range params {
		paramXML += fmt.Sprintf("<ParameterValueStruct><Name>%s</Name><Value xsi:type=\"%s\">%s</Value></ParameterValueStruct>",
			p.Name, p.Value, p.Value)
	}
	if key == "" {
		key = "0"
	}
	return fmt.Sprintf(`<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/" xmlns:cwmp="urn:dslforum-org:cwmp-1-0" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <soap:Header><cwmp:ID soap:mustUnderstand="1">%s</cwmp:ID></soap:Header>
  <soap:Body><cwmp:SetParameterValues><ParameterList>%s</ParameterList><ParameterKey>%s</ParameterKey></cwmp:SetParameterValues></soap:Body>
</soap:Envelope>`, id, paramXML, key)
}

func BuildGetParameterNames(id, path string, nextLevel bool) string {
	nl := "0"
	if nextLevel {
		nl = "1"
	}
	return fmt.Sprintf(`<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/" xmlns:cwmp="urn:dslforum-org:cwmp-1-0">
  <soap:Header><cwmp:ID soap:mustUnderstand="1">%s</cwmp:ID></soap:Header>
  <soap:Body><cwmp:GetParameterNames><ParameterPath>%s</ParameterPath><NextLevel>%s</NextLevel></cwmp:GetParameterNames></soap:Body>
</soap:Envelope>`, id, path, nl)
}

func BuildGetRPCMethodsResponse(id string) string {
	return fmt.Sprintf(`<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/" xmlns:cwmp="urn:dslforum-org:cwmp-1-0">
  <soap:Header><cwmp:ID soap:mustUnderstand="1">%s</cwmp:ID></soap:Header>
  <soap:Body><cwmp:GetRPCMethodsResponse><MethodList><string>Inform</string><string>GetRPCMethods</string><string>TransferComplete</string></MethodList></cwmp:GetRPCMethodsResponse></soap:Body>
</soap:Envelope>`, id)
}

func BuildEmptyResponse(id string) string {
	return fmt.Sprintf(`<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/" xmlns:cwmp="urn:dslforum-org:cwmp-1-0">
  <soap:Header><cwmp:ID soap:mustUnderstand="1">%s</cwmp:ID></soap:Header>
  <soap:Body></soap:Body>
</soap:Envelope>`, id)
}

func BuildReboot(id, commandKey string) string {
	return fmt.Sprintf(`<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/" xmlns:cwmp="urn:dslforum-org:cwmp-1-0">
  <soap:Header><cwmp:ID soap:mustUnderstand="1">%s</cwmp:ID></soap:Header>
  <soap:Body><cwmp:Reboot><CommandKey>%s</CommandKey></cwmp:Reboot></soap:Body>
</soap:Envelope>`, id, commandKey)
}

func BuildFactoryReset(id string) string {
	return fmt.Sprintf(`<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/" xmlns:cwmp="urn:dslforum-org:cwmp-1-0">
  <soap:Header><cwmp:ID soap:mustUnderstand="1">%s</cwmp:ID></soap:Header>
  <soap:Body><cwmp:FactoryReset></cwmp:FactoryReset></soap:Body>
</soap:Envelope>`, id)
}

var cmdCounter int64

func GenCommandID() string {
	return fmt.Sprintf("%d", atomic.AddInt64(&cmdCounter, 1))
}
