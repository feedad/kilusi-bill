-- Add duration type support to hotspot_packages
ALTER TABLE hotspot_packages
ADD COLUMN IF NOT EXISTS duration_type VARCHAR(20) DEFAULT 'hours',
ADD COLUMN IF NOT EXISTS duration_value INTEGER DEFAULT 1;

-- Migrate existing data
UPDATE hotspot_packages
SET duration_type = 'hours',
    duration_value = duration_hours
WHERE duration_value IS NULL OR duration_value = 1;

-- Verify
SELECT column_name, data_type
FROM information_schema_columns
WHERE table_name = 'hotspot_packages'
  AND column_name IN ('duration_hours', 'duration_type', 'duration_value');
