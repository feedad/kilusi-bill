-- =====================================================================
-- Migration: Rename nas_servers to nas
-- =====================================================================
-- This migration renames nas_servers table to nas for FreeRADIUS
-- compatibility while preserving all SNMP monitoring functionality
-- for multi-NAS system.
--
-- IMPORTANT: This migration preserves ALL columns including SNMP data
-- =====================================================================

DO $$
DECLARE
    table_exists BOOLEAN;
    nas_exists BOOLEAN;
BEGIN
    -- Check if nas_servers table exists
    SELECT EXISTS (
        SELECT 1 FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'nas_servers'
    ) INTO table_exists;
    
    -- Check if nas table already exists
    SELECT EXISTS (
        SELECT 1 FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'nas'
    ) INTO nas_exists;
    
    IF table_exists AND NOT nas_exists THEN
        RAISE NOTICE '=================================================================';
        RAISE NOTICE 'Starting migration: nas_servers → nas';
        RAISE NOTICE '=================================================================';
        
        -- Step 1: Rename table
        RAISE NOTICE 'Step 1: Renaming table nas_servers to nas...';
        ALTER TABLE public.nas_servers RENAME TO nas;
        RAISE NOTICE '✓ Table renamed successfully';
        
        -- Step 2: Rename columns to match FreeRADIUS standard
        -- Keep SNMP columns as-is (they are custom extensions)
        RAISE NOTICE 'Step 2: Renaming columns to FreeRADIUS standard...';
        
        -- Rename nas_name to nasname (FreeRADIUS standard)
        ALTER TABLE public.nas RENAME COLUMN nas_name TO nasname;
        RAISE NOTICE '✓ Renamed nas_name → nasname';
        
        -- Rename short_name to shortname (FreeRADIUS standard)
        ALTER TABLE public.nas RENAME COLUMN short_name TO shortname;
        RAISE NOTICE '✓ Renamed short_name → shortname';
        
        -- Add nasipaddress column as alias for ip_address (keep both for now)
        -- FreeRADIUS typically uses nasname for IP, but we'll keep ip_address column
        -- and ensure nasname is populated with IP if not already set
        RAISE NOTICE 'Step 2.1: Ensuring nasname contains IP addresses...';
        UPDATE public.nas SET nasname = ip_address WHERE nasname IS NULL OR nasname = '';
        RAISE NOTICE '✓ nasname populated with IP addresses';
        
        -- Step 3: Update sequence name if exists
        RAISE NOTICE 'Step 3: Renaming sequence...';
        ALTER SEQUENCE IF EXISTS public.nas_servers_id_seq RENAME TO nas_id_seq;
        RAISE NOTICE '✓ Sequence renamed';
        
        -- Step 4: Create/Update indexes for performance
        RAISE NOTICE 'Step 4: Creating indexes...';
        
        -- Index on nasname (primary lookup for FreeRADIUS)
        CREATE INDEX IF NOT EXISTS idx_nas_nasname ON public.nas(nasname);
        RAISE NOTICE '✓ Index created on nasname';
        
        -- Index on ip_address (for billing app lookups)
        CREATE INDEX IF NOT EXISTS idx_nas_ip_address ON public.nas(ip_address);
        RAISE NOTICE '✓ Index created on ip_address';
        
        -- Index on shortname
        CREATE INDEX IF NOT EXISTS idx_nas_shortname ON public.nas(shortname);
        RAISE NOTICE '✓ Index created on shortname';
        
        -- Index for active NAS servers
        CREATE INDEX IF NOT EXISTS idx_nas_is_active ON public.nas(is_active) WHERE is_active = true;
        RAISE NOTICE '✓ Index created on is_active';
        
        -- Index for SNMP enabled servers
        CREATE INDEX IF NOT EXISTS idx_nas_snmp_enabled ON public.nas(snmp_enabled) WHERE snmp_enabled = true;
        RAISE NOTICE '✓ Index created on snmp_enabled';
        
        -- Step 5: Add trigger for updated_at if not exists
        RAISE NOTICE 'Step 5: Ensuring updated_at trigger exists...';
        
        -- Create trigger if it doesn't exist
        IF NOT EXISTS (
            SELECT 1 FROM pg_trigger 
            WHERE tgname = 'update_nas_updated_at'
        ) THEN
            CREATE TRIGGER update_nas_updated_at 
            BEFORE UPDATE ON public.nas
            FOR EACH ROW 
            EXECUTE FUNCTION update_updated_at_column();
            RAISE NOTICE '✓ Trigger created for updated_at';
        ELSE
            RAISE NOTICE '✓ Trigger already exists';
        END IF;
        
        -- Step 6: Add comments for documentation
        RAISE NOTICE 'Step 6: Adding table and column comments...';
        
        COMMENT ON TABLE public.nas IS 'Network Access Servers for FreeRADIUS with SNMP monitoring support for multi-NAS system';
        COMMENT ON COLUMN public.nas.nasname IS 'NAS identifier (usually IP address) - FreeRADIUS standard';
        COMMENT ON COLUMN public.nas.shortname IS 'Short name for the NAS - FreeRADIUS standard';
        COMMENT ON COLUMN public.nas.type IS 'NAS type - FreeRADIUS standard';
        COMMENT ON COLUMN public.nas.ports IS 'RADIUS authentication port - FreeRADIUS standard';
        COMMENT ON COLUMN public.nas.secret IS 'RADIUS shared secret - FreeRADIUS standard';
        COMMENT ON COLUMN public.nas.ip_address IS 'IP address of the NAS (billing app field)';
        COMMENT ON COLUMN public.nas.snmp_community IS 'SNMP community string for monitoring';
        COMMENT ON COLUMN public.nas.snmp_enabled IS 'Whether SNMP monitoring is enabled for this NAS';
        COMMENT ON COLUMN public.nas.snmp_version IS 'SNMP protocol version (1, 2c, 3)';
        COMMENT ON COLUMN public.nas.snmp_cpu_usage IS 'Last recorded CPU usage percentage';
        COMMENT ON COLUMN public.nas.snmp_memory_usage IS 'Last recorded memory usage percentage';
        
        RAISE NOTICE '✓ Comments added';
        
        -- Step 7: Verify data integrity
        RAISE NOTICE 'Step 7: Verifying data integrity...';
        
        DECLARE
            row_count INTEGER;
        BEGIN
            SELECT COUNT(*) INTO row_count FROM public.nas;
            RAISE NOTICE '✓ Total NAS records: %', row_count;
            
            SELECT COUNT(*) INTO row_count FROM public.nas WHERE snmp_enabled = true;
            RAISE NOTICE '✓ SNMP-enabled NAS: %', row_count;
            
            SELECT COUNT(*) INTO row_count FROM public.nas WHERE is_active = true;
            RAISE NOTICE '✓ Active NAS: %', row_count;
        END;
        
        RAISE NOTICE '=================================================================';
        RAISE NOTICE 'Migration completed successfully!';
        RAISE NOTICE '=================================================================';
        RAISE NOTICE '';
        RAISE NOTICE 'IMPORTANT: Update your application code to use:';
        RAISE NOTICE '  - Table name: nas (instead of nas_servers)';
        RAISE NOTICE '  - Column: nasname (instead of nas_name)';
        RAISE NOTICE '  - Column: shortname (instead of short_name)';
        RAISE NOTICE '';
        RAISE NOTICE 'All SNMP monitoring columns have been preserved.';
        RAISE NOTICE '=================================================================';
        
    ELSIF nas_exists THEN
        RAISE NOTICE 'Migration already applied: nas table already exists';
    ELSE
        RAISE NOTICE 'Migration not needed: nas_servers table does not exist';
    END IF;
    
EXCEPTION
    WHEN OTHERS THEN
        RAISE EXCEPTION 'Migration failed: %', SQLERRM;
END $$;
