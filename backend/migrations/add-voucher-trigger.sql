-- Create trigger to automatically mark voucher as used when RADIUS session ends
-- This trigger fires when radacct session is closed (stoptime is set)

CREATE OR REPLACE FUNCTION mark_voucher_used_on_session_end()
RETURNS TRIGGER AS $$
BEGIN
  -- Only proceed if session terminated by timeout or user request
  IF NEW.acctstoptime IS NOT NULL AND OLD.acctstoptime IS NULL THEN
    -- Update voucher to used status
    UPDATE vouchers 
    SET status = 'used', 
        used_at = NEW.acctstoptime
    WHERE username = NEW.username
      AND status = 'active'
      AND payment_status = 'paid'
      AND (
        -- Session terminated by timeout or user
        NEW.acctterminatecause IN ('User-Request', 'Admin-Reset', 'Session-Timeout', 'Idle-Timeout')
        OR
        -- Session time exceeded or close to duration (95% of duration)
        EXTRACT(EPOCH FROM (NEW.acctstoptime - NEW.acctstarttime)) >= (
          SELECT COALESCE(
            CASE 
              WHEN hp.duration_type = 'hours' THEN hp.duration_value * 3600
              WHEN hp.duration_type = 'days' THEN hp.duration_value * 86400
              WHEN hp.duration_type = 'months' THEN hp.duration_value * 30 * 86400
              ELSE hp.duration_value * 3600
            END,
            3600
          )
          FROM vouchers v
          JOIN hotspot_packages hp ON v.package_id = hp.id
          WHERE v.username = NEW.username
        ) * 0.95
      );
    
    -- Log the action
    INSERT INTO system_logs (action, entity_type, entity_id, details, created_at)
    VALUES (
      'voucher_marked_used',
      'voucher',
      (SELECT id FROM vouchers WHERE username = NEW.username LIMIT 1),
      jsonb_build_object(
        'username', NEW.username,
        'session_duration', EXTRACT(EPOCH FROM (NEW.acctstoptime - NEW.acctstarttime)),
        'terminate_cause', NEW.acctterminatecause,
        'triggered_by', 'radacct_trigger'
      ),
      NOW()
    );
    
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger on radacct
DROP TRIGGER IF EXISTS mark_voucher_used_trigger ON radacct;
CREATE TRIGGER mark_voucher_used_trigger
AFTER UPDATE OF acctstoptime ON radacct
FOR EACH ROW
EXECUTE FUNCTION mark_voucher_used_on_session_end();

-- Verify
SELECT 
  tgname, 
  tgrelid::regclass as table_name,
  tgenabled,
  pg_get_triggerdef(oid) as definition
FROM pg_trigger 
WHERE tgname = 'mark_voucher_used_trigger';
