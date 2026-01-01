-- Migration to remove redundant ODP columns from customers table
-- Created by Antigravity

-- 1. Ensure data integrity (optional: you might want to backfill odps table if empty, but we assume it's populated or handled)

-- 2. Drop redundant columns
ALTER TABLE "public"."customers" 
DROP COLUMN IF EXISTS "odp_name",
DROP COLUMN IF EXISTS "odp_address";

-- Note: odp_port remains as it is specific to the customer connection
