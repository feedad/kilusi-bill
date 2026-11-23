-- ONU lifecycle: audit log for detected ONU swaps and automatic renames.
-- Safe to re-run.

CREATE TABLE IF NOT EXISTS onu_change_log (
    id serial PRIMARY KEY,
    olt_id uuid,
    olt_name varchar(100),
    olt_ip varchar(64),
    customer_id varchar(64),
    customer_name varchar(255),
    service_id integer,
    pppoe_username varchar(255),
    action varchar(32) NOT NULL,
    status varchar(32) NOT NULL,
    onu_index varchar(32),
    onu_sn varchar(64),
    old_name varchar(255),
    new_name varchar(255),
    old_mac varchar(64),
    new_mac varchar(64),
    dry_run boolean NOT NULL DEFAULT false,
    message text,
    created_at timestamp without time zone DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_onu_change_log_created ON onu_change_log (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_onu_change_log_customer ON onu_change_log (customer_id);
CREATE INDEX IF NOT EXISTS idx_onu_change_log_olt ON onu_change_log (olt_id);

INSERT INTO app_config (key, value, type, category, description)
VALUES
    ('onu_auto_sync_enabled', 'false', 'boolean', 'olt', 'Aktifkan cron deteksi & rename ONU otomatis (10 menit)'),
    ('onu_auto_mark_old_enabled', 'false', 'boolean', 'olt', 'Ubah nama ONU lama hasil pergantian menjadi OLD-<NAMA>-<TANGGAL> saat cron berjalan')
ON CONFLICT (key) DO NOTHING;
