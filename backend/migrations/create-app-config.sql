-- Create app_config table for dynamic settings
CREATE TABLE IF NOT EXISTS "public"."app_config" (
    "key" VARCHAR(255) PRIMARY KEY,
    "value" TEXT,
    "type" VARCHAR(20) DEFAULT 'string' CHECK (type IN ('string', 'boolean', 'number', 'json')),
    "category" VARCHAR(50) DEFAULT 'general',
    "description" TEXT,
    "updated_at" TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Index for category lookups
CREATE INDEX IF NOT EXISTS "idx_app_config_category" ON "public"."app_config" ("category");
