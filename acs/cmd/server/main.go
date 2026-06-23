package main

import (
	"encoding/json"
	"flag"
	"fmt"
	"log"
	"net/http"
	"os"
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

	handler.OnInform = func(data *cwmp.InformData) error {
		v := vendor.Detect(data.Manufacturer, data.ProductClass)
		vendorName := "unknown"
		if v != nil {
			vendorName = v.Manufacturer
		}
		log.Printf("ONU registered: SN=%s Vendor=%s Product=%s IP=%s Events=%v",
			data.SN, vendorName, data.ProductClass, data.IP, data.Events)
		return nil
	}

	handler.OnSaveParams = func(sn string, params []cwmp.ParameterValueStruct) error {
		for _, p := range params {
			if len(p.Value) > 0 && len(p.Value) < 100 {
				log.Printf("  PARAM %s: %s = %s", sn, p.Name, p.Value)
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
	apiMux.HandleFunc("/api/health", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte(`{"status":"ok"}`))
	})
	apiMux.HandleFunc("/api/devices", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		devices, total, err := store.ListDevices("", "", "", 50, 0)
		if err != nil {
			w.Write([]byte(`{"error":"` + err.Error() + `"}`))
			return
		}
		w.Write([]byte(`{"total":` + itoa(total) + `,"devices":` + toJSON(devices) + `}`))
	})

	log.Printf("API server listening on %s", *listenAPI)
	if err := http.ListenAndServe(*listenAPI, apiMux); err != nil {
		log.Fatalf("API server: %v", err)
	}
}

func itoa(n int) string {
	return fmt.Sprintf("%d", n)
}

func toJSON(v interface{}) string {
	b, _ := json.Marshal(v)
	return string(b)
}
