package cwmp

import "encoding/xml"

type Envelope struct {
	XMLName xml.Name `xml:"Envelope"`
	Header  Header   `xml:"Header"`
	Body    Body     `xml:"Body"`
}

type Header struct {
	ID string `xml:"ID"`
}

type Body struct {
	Inform                 *InformRequest                 `xml:"Inform"`
	InformResponse         *InformResponse                `xml:"InformResponse"`
	GetParameterValues     *GetParameterValuesRequest     `xml:"GetParameterValues"`
	GetParameterValuesResp *GetParameterValuesResponse    `xml:"GetParameterValuesResponse"`
	SetParameterValues     *SetParameterValuesRequest     `xml:"SetParameterValues"`
	SetParameterValuesResp *SetParameterValuesResponse    `xml:"SetParameterValuesResponse"`
	GetParameterNames      *GetParameterNamesRequest      `xml:"GetParameterNames"`
	GetParameterNamesResp  *GetParameterNamesResponse     `xml:"GetParameterNamesResponse"`
	GetRPCMethods          *GetRPCMethodsRequest          `xml:"GetRPCMethods"`
	GetRPCMethodsResp      *GetRPCMethodsResponse         `xml:"GetRPCMethodsResponse"`
	Reboot                 *RebootRequest                 `xml:"Reboot"`
	RebootResp             *RebootResponse                `xml:"RebootResponse"`
	FactoryReset           *FactoryResetRequest           `xml:"FactoryReset"`
	FactoryResetResp       *FactoryResetResponse          `xml:"FactoryResetResponse"`
	Download               *DownloadRequest               `xml:"Download"`
	DownloadResp           *DownloadResponse              `xml:"DownloadResponse"`
	TransferComplete       *TransferCompleteRequest       `xml:"TransferComplete"`
	TransferCompleteResp   *TransferCompleteResponse      `xml:"TransferCompleteResponse"`
	AddObject              *AddObjectRequest              `xml:"AddObject"`
	AddObjectResp          *AddObjectResponse             `xml:"AddObjectResponse"`
	DeleteObject           *DeleteObjectRequest           `xml:"DeleteObject"`
	DeleteObjectResp       *DeleteObjectResponse          `xml:"DeleteObjectResponse"`
	Fault                  *Fault                        `xml:"Fault"`
}

type Fault struct {
	FaultCode   string `xml:"faultcode"`
	FaultString string `xml:"faultstring"`
	Detail      FaultDetail `xml:"detail"`
}

type FaultDetail struct {
	Fault FaultStruct `xml:"Fault"`
}

type FaultStruct struct {
	FaultCode   string `xml:"FaultCode"`
	FaultString string `xml:"FaultString"`
}

type DeviceID struct {
	Manufacturer string `xml:"Manufacturer"`
	OUI          string `xml:"OUI"`
	ProductClass string `xml:"ProductClass"`
	SerialNumber string `xml:"SerialNumber"`
}

type Event struct {
	EventCode  string `xml:"EventCode"`
	CommandKey string `xml:"CommandKey"`
}

type EventArray struct {
	Events []Event `xml:"EventStruct"`
}

type ParameterValueStruct struct {
	Name  string `xml:"Name"`
	Value string `xml:"Value"`
}

type ParameterList struct {
	Parameters []ParameterValueStruct `xml:"ParameterValueStruct"`
}

type ParameterInfoStruct struct {
	Name     string `xml:"Name"`
	Writable bool   `xml:"Writable"`
}

type ParameterInfoList struct {
	Parameters []ParameterInfoStruct `xml:"ParameterInfoStruct"`
}

type InformRequest struct {
	DeviceID    DeviceID        `xml:"DeviceId"`
	Events      EventArray      `xml:"Event"`
	MaxEnvelopes int            `xml:"MaxEnvelopes"`
	CurrentTime string          `xml:"CurrentTime"`
	RetryCount  int            `xml:"RetryCount"`
	ParameterList ParameterList `xml:"ParameterList"`
}

type InformResponse struct {
	MaxEnvelopes int `xml:"MaxEnvelopes"`
}

type GetParameterValuesRequest struct {
	ParameterNames struct {
		Strings []string `xml:"string"`
	} `xml:"ParameterNames"`
}

type GetParameterValuesResponse struct {
	ParameterList ParameterList `xml:"ParameterList"`
}

type SetParameterValuesRequest struct {
	ParameterList ParameterList `xml:"ParameterList"`
	ParameterKey  string        `xml:"ParameterKey"`
}

type SetParameterValuesResponse struct {
	Status int `xml:"Status"`
}

type GetParameterNamesRequest struct {
	ParameterPath string `xml:"ParameterPath"`
	NextLevel     bool   `xml:"NextLevel"`
}

type GetParameterNamesResponse struct {
	ParameterList ParameterInfoList `xml:"ParameterList"`
}

type GetRPCMethodsRequest struct{}
type GetRPCMethodsResponse struct {
	Methods []string `xml:"MethodList>string"`
}

type RebootRequest struct {
	CommandKey string `xml:"CommandKey"`
}
type RebootResponse struct {
	Status int `xml:"Status"`
}

type FactoryResetRequest struct{}
type FactoryResetResponse struct {
	Status int `xml:"Status"`
}

type DownloadRequest struct {
	CommandKey    string `xml:"CommandKey"`
	FileType      string `xml:"FileType"`
	URL           string `xml:"URL"`
	Username      string `xml:"Username"`
	Password      string `xml:"Password"`
	FileSize      int    `xml:"FileSize"`
	TargetFileName string `xml:"TargetFileName"`
	DelaySeconds  int    `xml:"DelaySeconds"`
	SuccessURL    string `xml:"SuccessURL"`
	FailureURL    string `xml:"FailureURL"`
}
type DownloadResponse struct {
	Status       int `xml:"Status"`
	StartTime    string `xml:"StartTime"`
	CompleteTime string `xml:"CompleteTime"`
}

type TransferCompleteRequest struct {
	CommandKey string `xml:"CommandKey"`
	FaultStruct FaultStruct `xml:"FaultStruct"`
	StartTime   string `xml:"StartTime"`
	CompleteTime string `xml:"CompleteTime"`
}
type TransferCompleteResponse struct{}

type AddObjectRequest struct {
	ObjectName string `xml:"ObjectName"`
	ParameterKey string `xml:"ParameterKey"`
}
type AddObjectResponse struct {
	InstanceNumber int `xml:"InstanceNumber"`
	Status         int `xml:"Status"`
}

type DeleteObjectRequest struct {
	ObjectName string `xml:"ObjectName"`
	ParameterKey string `xml:"ParameterKey"`
}
type DeleteObjectResponse struct {
	Status int `xml:"Status"`
}
