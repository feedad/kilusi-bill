-- Update hotspot_packages table to support duration types
ALTER TABLE hotspot_packages 
ADD COLUMN IF NOT EXISTS duration_type VARCHAR(20) DEFAULT 'hours',
ADD COLUMN IF NOT EXISTS duration_value INTEGER DEFAULT 1;

-- Migrate existing data
UPDATE hotspot_packages 
SET duration_type = 'hours',
    duration_value = duration_hours
WHERE duration_type IS NULL OR duration_value IS NULL;

-- Add check constraint for duration_type
ALTER TABLE hotspot_packages 
DROP CONSTRAINT IF EXISTS hotspot_packages_duration_type_check;
ALTER TABLE hotspot_packages 
ADD CONSTRAINT hotspot_packages_duration_type_check 
CHECK (duration_type IN ('hours', 'days', 'months'));

-- Create index on duration_type
CREATE INDEX IF NOT EXISTS idx_hotspot_packages_duration_type ON hotspot_packages(duration_type);

-- Verify
SELECT id, name, name_display, duration_value, duration_type, price 
FROM hotspot_packages 
ORDER BY display_order;
