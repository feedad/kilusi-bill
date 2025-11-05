# FreeRADIUS MS-CHAP Fix Report

Date: 2025-11-05
Environment: Docker (container: `kilusi-freeradius`), FreeRADIUS 3.x, PostgreSQL backend
NAS: Mikrotik 172.22.10.156 → RADIUS server 172.22.10.25

## Summary
- Initial issues:
  - Unknown client / timeouts from Mikrotik when the server used bridged networking and static clients.
  - After enabling SQL dynamic clients and host networking, PAP/CHAP succeeded but MS-CHAP requests were rejected.
- Final resolution:
  - Corrected the default virtual server `authenticate` section to call the `mschap` module directly (instead of relying on an absent Auth-Type sub-section), and verified MS-CHAP succeeds from both local tests and the Mikrotik NAS.
  - Enabled the control socket to toggle runtime debugging safely.
  - Fixed radacct/detail writer permissions.

## Root Causes
1) Virtual server authenticate path didn’t invoke the MS-CHAP handler
- Logs showed: `Found Auth-Type = mschap` followed by `Auth-Type sub-section not found. Ignoring.`
- The `authenticate` section declared `Auth-Type ... {}` blocks that weren’t being matched as expected. As a result, the request fell through and returned reject.

2) Operational quality issues (not blockers but noisy)
- Missing writable control socket → couldn’t use `radmin` to adjust debug at runtime.
- Detail writer permission error writing to `/var/log/freeradius/radacct`.
- Duplicate client warning (SQL-loaded NAS and static client both present).

## Changes Applied
1) Enable runtime control socket (for `radmin`)
- Enabled `sites-available/control-socket` and linked it into `sites-enabled`.
- In `sites-available/control-socket`:
  - Set `uid = freerad`, `gid = freerad`, `mode = rw`.
- Result: socket available at `/var/run/freeradius/freeradius.sock` and writeable by the daemon.

2) Fix MS-CHAP authentication path in default virtual server
- In `/etc/freeradius/sites-available/default`:
  - Replaced the `authenticate` section with a simple module sequence:
    ```
    authenticate {
        mschap
        chap
        pap
    }
    ```
  - This ensures the MS-CHAP handler runs when MS-CHAP attributes are present.

3) Detail writer permissions
- Ensured the directory exists and is owned by the service user:
  - `/var/log/freeradius/radacct` owned by `freerad:freerad` (755/700 acceptable depending on policy).

4) (Previously completed) Networking and SQL dynamic NAS clients
- Switched container to host networking so the server binds to 0.0.0.0:1812/1813 and sees real NAS IPs.
- Enabled loading NAS clients from PostgreSQL (`read_clients = yes`) with a corrected `client_query` mapping to the `nas_servers` schema.

## Verification
- Local tests (PAP, CHAP, MS-CHAP):
  - `radtest` accepted for PAP and CHAP.
  - After authenticate fix, `radtest -t mschap apptest 1234567 127.0.0.1 0 testing123` → `Login OK: [apptest/<via Auth-Type = mschap>]`.
- Mikrotik live tests:
  - Periodic attempts began returning `Login OK: [apptest/<via Auth-Type = mschap>] (from client Mikrotik-156 ...)`.
- Logging:
  - Prior to fix: `Found Auth-Type = mschap` followed by `Auth-Type sub-section not found. Ignoring.`
  - After fix: MS-CHAP succeeds; detail writer errors resolved; new radacct subdir created for `172.22.10.156`.

## How to toggle runtime debugging (safe)
- Ensure control socket is enabled (as above). Then on the host:
```bash
# Show available commands
docker exec -it kilusi-freeradius radmin -f /var/run/freeradius/freeradius.sock -e 'help'

# Increase debug level temporarily
docker exec -it kilusi-freeradius radmin -f /var/run/freeradius/freeradius.sock -e 'debug level 4'

# Optional: Limit logs to a source
docker exec -it kilusi-freeradius radmin -f /var/run/freeradius/freeradius.sock -e "debug condition (Packet-Src-IP-Address == 127.0.0.1)"

# Reset debug level
docker exec -it kilusi-freeradius radmin -f /var/run/freeradius/freeradius.sock -e 'debug level 0'
```

## File paths touched (inside the container)
- `/etc/freeradius/sites-available/default` → authenticate section set to `mschap; chap; pap`.
- `/etc/freeradius/sites-available/control-socket` → `uid/gid/mode` configured and site symlinked into `sites-enabled`.
- `/var/log/freeradius/radacct` → created and owned by `freerad:freerad`.

## Follow-ups (recommended)
- Remove static Mikrotik client from any `clients.conf`/`clients.d` to silence the duplicate client warning (SQL now provides the NAS entry).
- Persist the container changes in the repo’s FreeRADIUS config (if not bind-mounted). Specifically:
  - `sites-available/default` (authenticate section)
  - `sites-available/control-socket` (uid/gid/mode)
- Keep host networking for the RADIUS container to avoid NAT side effects.

## Appendix
- Quick MS-CHAP local test (inside the container):
```bash
echo | radtest -t mschap apptest 1234567 127.0.0.1 0 testing123
```
- Typical success log line:
```
Auth: Login OK: [apptest/<via Auth-Type = mschap>] (from client Mikrotik-156 port …)
```
