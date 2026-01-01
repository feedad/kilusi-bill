-- Create admins table for RBAC
CREATE TABLE IF NOT EXISTS "public"."admins" (
    "id" UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    "username" VARCHAR(50) NOT NULL UNIQUE,
    "password_hash" VARCHAR(255) NOT NULL,
    "role" VARCHAR(20) NOT NULL DEFAULT 'operator' CHECK (role IN ('administrator', 'technician', 'finance', 'operator')),
    "is_active" BOOLEAN DEFAULT TRUE,
    "last_login" TIMESTAMP,
    "created_at" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Index for username lookups
CREATE INDEX IF NOT EXISTS "idx_admins_username" ON "public"."admins" ("username");
