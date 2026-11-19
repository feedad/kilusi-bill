/**
 * RADIUS session freshness window (single source of truth).
 *
 * The MikroTik NAS devices on this deployment send Accounting Interim-Updates
 * once per hour (Acct-Interim-Interval = 3600), and they arrive in bulk at :59:59.
 * With a 30-minute "stale" threshold every live session therefore looks dead for
 * 30 minutes of every hour, so RadiusSessionCleanup closed hundreds of live
 * sessions (acctterminatecause = 'Stale Session Cleanup') and every online-status
 * query reported those customers as offline.
 *
 * Both the cleanup and the online-status queries MUST share one window that is
 * larger than the NAS interim interval, otherwise they fight each other.
 *
 * Override with RADIUS_STALE_THRESHOLD_MINUTES. Suggested minimum is
 * (interim interval + 30 min).
 */

const parsed = parseInt(process.env.RADIUS_STALE_THRESHOLD_MINUTES, 10);
const minutes = Number.isFinite(parsed) && parsed > 0 ? parsed : 90;

module.exports = {
    SESSION_STALE_MINUTES: minutes,
    SESSION_STALE_SQL: `INTERVAL '${minutes} minutes'`
};
