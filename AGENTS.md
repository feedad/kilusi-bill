# Agent Instructions for Kilusi Bill

## ⚠️ CARDINAL RULE: Always commit after successful fix

**After EVERY successful fix or feature, immediately:**
```bash
cd /root/kilusi-bill && git add -A && git commit -m "fix: <what was fixed>" && git push
```
Also rebase `alpha` worktree if changes affect frontend:
```bash
cd /root/kilusi-bill/frontend-dev && git rebase development && git push origin alpha --force-with-lease
```
**NEVER leave uncommitted changes.** This is the single most important rule.

---

## 🔑 Credentials & Quick Reference (DO NOT RE-SEARCH)

### Database
```bash
PGPASSWORD='kilusi17!' psql -U kilusi_user -h localhost -d kilusi_bill
```

### API Keys
| Key | Location | Value/Source |
|-----|----------|--------|
| `chatbot_api_key` | `app_config` | Used by Omnichat for chatbot endpoints |
| `autopay_api_key` | `app_config` | Autopay integration |
| `autopay_secret` | `app_config` | HMAC-SHA256 for autopay callbacks |
| WhatsApp Omnichat | KilusiOmnichat | Already configured, provider currently `off` |

### Server IPs
| IP | Host | Service |
|----|------|---------|
| 172.22.10.30 | BILLING | Backend (3001), Frontend prod (8080), Frontend dev (8081) |
| 172.22.10.29 | BILLING (alt) | Also runs backend |

### URLs
| URL | Purpose |
|-----|---------|
| `https://api.kilusi.id` | Production API (proxied to localhost:3001) |
| `https://billing.kilusi.id` | Production frontend (proxied to localhost:8080) |
| `http://172.22.10.30:8081` | Dev frontend |
| `http://localhost:3001` | Backend direct |

### Running Services
```bash
# Backend
sudo systemctl status/restart kilusi-bill-backend    # port 3001, systemd

# Frontend Production
sudo systemctl status/restart kilusi-bill-frontend   # port 8080, systemd, branch: development

# Frontend Dev (manual)
cd /root/kilusi-bill/frontend-dev/frontend && npm run dev   # port 8081, branch: alpha
```

---

## 🌿 Git 3-Tier Branch Workflow

```
main          ← stable archive (never deployed, code storage only)
  ↑ merge
development   ← production beta (RUNNING via systemd, frontend/ port 8080)
  ↑ merge
alpha         ← trial dev (manual, frontend-dev/ port 8081)
```

### Worktrees
| Path | Branch | Purpose |
|------|--------|---------|
| `/root/kilusi-bill/` | `development` | Main repo, production backend + frontend |
| `/root/kilusi-bill/frontend-dev/` | `alpha` | Dev frontend worktree |

### Deploy alpha → production
```bash
cd /root/kilusi-bill/frontend-dev && git push origin alpha
cd /root/kilusi-bill/frontend
git checkout development && git merge alpha
npm run build && sudo systemctl restart kilusi-bill-frontend
```

### Deploy beta → stable (archive)
```bash
git checkout main && git merge development && git push
git checkout development
```

---

## Quick Commands (V1 — Current)

```bash
# Backend development
cd backend && npm run dev          # starts with nodemon on port 3001

# Backend tests
cd backend && npm test              # all tests
cd backend && npm run test:omnichat  # specific test
cd backend && npm run test:template-manager
cd backend && npm run test:contact-sync

# Frontend development
cd frontend && npm run dev           # starts on port 8080

# Frontend quality checks
cd frontend && npm run lint
cd frontend && npm run type-check

# Database migrations (run from backend/)
npm run migrate:all                 # runs all migrations
npm run db:check                    # verify database state

# Docker (full stack)
docker-compose up -d                # all services
docker-compose logs -f              # view logs
```

## Quick Commands (V3 — Monorepo, when ready)

```bash
# All packages (parallel)
pnpm dev:all                        # starts api:3001, frontend:3000, worker

# Individual packages
pnpm dev:api                        # Hono.js API on port 3001
pnpm dev:frontend                   # Next.js 15 on port 3000
pnpm dev:worker                    # Cron + WhatsApp gateway

# Quality checks
pnpm lint                           # ESLint across all packages
pnpm type-check                    # TypeScript check across all packages
pnpm build                         # Turborepo parallel build

# Database
pnpm db:generate                   # Generate migration from schema changes
pnpm db:migrate                    # Run migrations
pnpm db:push                       # Push schema to dev database
pnpm db:studio                     # Open Drizzle Studio

# Testing
pnpm test                           # Vitest across all packages
pnpm test:e2e                      # Playwright E2E tests
```

## Key Architecture Facts

### V1 (Current)
- **Entry points**: `backend/app.js` (Express server), `frontend/` (Next.js)
- **Database**: PostgreSQL with split architecture - `customers` table holds identity, `services` table holds subscriptions
- **Important**: Use `nas` table (not `nas_servers`) - FreeRADIUS standard
- **SNMP monitoring**: Uses `net-snmp` library, 20+ metrics per NAS device
- **GenieACS**: TR-069 ACS for ONT/OLT management (ports 7547, 7557, 7567, 3002)

### V3 (Target — Monorepo)
- **Architecture**: pnpm monorepo + Turborepo — `packages/api` (Hono.js), `packages/frontend` (Next.js 15), `packages/worker`, `packages/shared`
- **API**: Hono.js on port 3001 — type-safe routes, Zod validation, RPC client, tenant middleware (SaaS-ready)
- **Frontend**: Next.js 15 on port 3000 — communicates with API via Hono RPC client, NOT direct DB queries
- **Worker**: Background cron (invoice generator, isolir checker, SNMP poller, WhatsApp gateway)
- **Shared**: Drizzle ORM schemas, Zod validators, TypeScript types, constants, utils
- **Database**: PostgreSQL 16+ — Drizzle ORM, UUID PKs, INET/MACADDR, JSONB, TIMESTAMPTZ
- **Auth**: Better Auth (admin email/password, customer OTP)
- **UI**: Tailwind CSS 4 + shadcn/ui — dark mode, mobile-first, 6-section sidebar
- **SaaS-ready**: tenant isolation via Hono middleware, feature gates per license tier

## Common Pitfalls

1. **Database migration order**: Run `init-database.js` before any other migrations
2. **Env file location**: Backend uses `backend/.env`, frontend uses `frontend/.env.local`. V3 uses `packages/api/.env`, `packages/frontend/.env.local`, `packages/worker/.env`
3. **RADIUS accounting**: Ensure FreeRADIUS SQL module is enabled in `mods-enabled/sql`
4. **WhatsApp tokens**: Need Meta Developer Portal tokens, not Baileys session files
5. **PostgreSQL version**: Requires 13+ for JSON support used in billing (V3 requires 16+)
6. **Billing cycle types (`siklus` field)**: `TETAP` = profile (fixed period), `BULANAN` = monthly (due date), `fixed` = fixed_day (same day each month). Resolution: service-level `siklus` > system-level `billing_settings.billing_cycle_type`
7. **Isolir/suspension**: After `isolir_date` passes + `grace_period_days`, service status changes to `suspended`, RADIUS group changes to `ISOLIR`, PPPoE profile changes to isolir profile
8. **Reconnection after payment**: `reconnection_method` determines new `active_date` — `payment_date` means active_date = max(due_date, payment_date); `isolir_date` means active_date stays as due_date regardless of lateness
9. **V3 frontend must NOT query DB directly** — all data access via Hono RPC client through `packages/api` for SaaS tenant isolation
10. **V3 billing cycle/business logic lives in `packages/api/src/lib/`** — not in frontend, not in worker; worker calls API endpoints or imports from shared

## Important Files

### V1 (Current)
- `scripts/master-schema.sql` - Full database schema
- `freeradius/config/mods-available/sql` - RADIUS DB config
- `backend/settings.json` - Runtime configuration (created on first run)
- `.env.docker.example` - Template for Docker deployment

### V3 (Target)
- `packages/shared/src/db/schema.ts` - Drizzle ORM table definitions
- `packages/shared/src/validators/` - Zod validation schemas
- `packages/api/src/routes/` - Hono.js route handlers
- `packages/api/src/middleware/` - Auth, tenant isolation, rate limit, audit
- `packages/api/src/lib/` - Business logic (billing-cycle, isolir, invoice-generator)
- `packages/worker/src/jobs/` - Cron jobs (invoice-generator, isolir-checker, snmp-poller)
- `docs/product/PRD-v3.md` - Complete V3 specification

## Infrastructure Ports

| Service | V1 Port | V3 Port | Description |
|---------|---------|---------|-------------|
| API | 3001 | 3001 | Express (V1) / Hono.js (V3) |
| Frontend | 8080 | 3000 | Next.js 14 (V1) / Next.js 15 (V3) |
| Worker | — | — | V3 only (background, no HTTP) |
| PostgreSQL | 5432 | 5432 | Database |
| Redis | — | 6379 | V3 only (rate limit + session cache) |
| RADIUS Auth | 1812/udp | 1812/udp | FreeRADIUS |
| RADIUS Acct | 1813/udp | 1813/udp | FreeRADIUS |
| GenieACS CWMP | 7547 | 7547 | TR-069 |
| GenieACS NBI | 7557 | 7557 | TR-069 API |
| GenieACS FS | 7567 | 7567 | TR-069 files |
| GenieACS UI | 3002 | 3002 | TR-069 dashboard |

## Production: Systemd & Process Management (V1)

**NEVER use `pkill` or `kill -9`** — both backend and frontend run via systemd services.
Use these commands instead:

```bash
# Restart services
sudo systemctl restart kilusi-bill-backend
sudo systemctl restart kilusi-bill-frontend

# View status
sudo systemctl status kilusi-bill-backend
sudo systemctl status kilusi-bill-frontend

# View logs
sudo journalctl -u kilusi-bill-backend -f
sudo journalctl -u kilusi-bill-frontend -f
```

PM2 `ecosystem.config.js` files also exist (alternative runner). **Do not mix PM2 and systemd** on the same machine — pick one.

Systemd unit files live at `config/systemd/`.

## Database Access

### V1 (Current)
- **Centralized pool**: `config/database.js` — use `query()`, `getOne()`, `getAll()`, `transaction()`
- **26 files bypass it** and create their own `new Pool()` — fragmented connections, to be consolidated
- **408 raw `.query(` calls** across 174 files — all parameterized (`$1`, `$2`)
- **No ORM** — no model classes, no query builder, no repository pattern

### V3 (Target)
- **Drizzle ORM**: All DB access via `packages/shared/src/db/client.ts`
- **Type-safe queries**: `db.select().from(customers).where(eq(customers.id, id))`
- **Migrations**: Managed by `drizzle-kit` — `pnpm db:generate` and `pnpm db:migrate`
- **No raw SQL** — all queries use Drizzle query builder
- **Tenant isolation**: DB client scoped per-tenant in API middleware

## Deployment Architecture

### V1 (Current)
Production runs on 3 servers:
- **Server 1**: PostgreSQL + FreeRADIUS
- **Server 2**: GenieACS (MongoDB-backed TR-069 ACS)
- **Server 3**: Backend + Frontend (Nginx reverse proxy)

### V3 (Target)
- **Server 1**: PostgreSQL 16 + Redis 7 + FreeRADIUS
- **Server 2**: GenieACS (MongoDB)
- **Server 3**: API (Hono.js) + Frontend (Next.js) + Worker (Node.js cron) — Nginx reverse proxy

## Testing

### V1 (Current)
- Backend: Jest with `testEnvironment: node`, tests in `services/*.test.js`
- Frontend: Jest with `testEnvironment: jsdom`, tests alongside components
- No integration tests requiring external services (mock everything)

### V3 (Target)
- All packages: Vitest with `testEnvironment: node`
- API: Unit tests per route + integration tests with test DB
- Frontend: Vitest + React Testing Library
- E2E: Playwright for browser tests
- Worker: Unit tests per job
- Shared: Unit tests per validator/schema

## Deep Architecture Knowledge (from extensive debugging & feature work)

### RADIUS System

- **Tables**: `radcheck` (username, password), `radusergroup` (username → groupname), `radgroupreply` (group → attributes), `radgroupcheck`, `radgroup`, `radacct`
- **Username format**: PPPoE username with domain suffix (e.g., `24000010601@weconnect.id`). Different ISPs have different suffixes (`@weconnect.id`, `@fathnet.id`, `@kilusi.id`). `radusergroup` MUST only contain PPPoE usernames (with suffix), NOT bare service numbers.
- **PPPoE username is stored in `technical_details` table** (NOT in `customers` or `services`). When creating/editing: `INSERT ... ON CONFLICT (pppoe_username) DO UPDATE`.
- **RADIUS sync flow**: `appEvents.emit('customer:upsert')` → `syncCustomerToRadius()` → `radiusDb.upsertRadiusUser()` → `radcheck` + `radusergroup` + `radreply`. AutoSync cron every 30 min.
- **CoA (Change of Authorization)**: `disconnectRadiusUser()` sends RADIUS `Disconnect-Request` (code 40) to NAS port 3799 UDP. Uses `radacct` to find NAS + secret from `nas` table. If port 3799 blocked or NAS secret wrong, CoA fails silently.
- **ISOLIR group**: UPPERCASE `ISOLIR` is the standard (matches MikroTik PPPoE profile). Lowercase `isolir` entries are legacy/wrong. Valid groups in `radgroup`: `ISOLIR`, `HOTSPOT_DEFAULT`, `UPTO-10M`, `UPTO-15M`, `UPTO-25M`, `UPTO-40M`.
- **Suspension/restore search pattern**: Find RADIUS username via `SELECT username FROM radcheck WHERE LOWER(username) LIKE LOWER(service_number || '%')` — prefix match, not exact match.
- **Upgrade/downgrade package**: `PUT /customers/:id` (package change) → `customer-service.js` updates `radusergroup` + sends CoA. But `POST /customers/:id/services` (add service) originally did NOT emit `customer:upsert` → PPPoE not synced to `radcheck`. **FIXED**: now emits event after service creation.

### Payment System

- **4 Payment types**: Tunai (cash, channel: `-`), Transfer (bank/ewallet from Payment Settings, channel: bank name), Tripay (Tripay gateway, system-processed), Autopay (bank mutation matching, system-processed).
- **Payment methods dropdown**: Built from `payment_settings` (bank_accounts + ewallets) via `/api/v1/settings/payment-methods`.
- **CABAR column**: Reads from backend `cabar` field (computed in SQL) or falls back to `payment_source` mapping: `tripay` → `TRIPAY`, `autopay` → `AUTOPAY`, `manual` → `TRANSFER`.
- **Payment processing**: `POST /billing/payments` → records payment → updates invoice status → `updateServiceDatesAfterPayment()` → if all invoices paid & service was suspended → `restoreServiceByServiceId()` → update RADIUS group + CoA disconnect.

### Autopay Integration

- **Service**: `backend/services/autopay-service.js` — pushInvoice, checkStatus, processCallback, pollPendingInvoices, verifySignature (HMAC-SHA256)
- **Routes**: `backend/routes/api/v1/autopay.js` — POST `/callback` (public, HMAC+API key), GET/PUT `/config` (admin JWT), POST `/sync-status` (admin)
- **Cron**: Every 30 min in `scheduler.js` — polls unpaid invoices with `autopay_amount IS NOT NULL`
- **HMAC**: Callback verifies `X-Autopay-Signature` header via `crypto.createHmac('sha256', secret)`
- **Config**: `autopay_enabled`, `autopay_api_key`, `autopay_base_url`, `autopay_secret` in `app_config`

### Unique Code System

- **Generator**: `backend/config/unique-code.js` — `generateCode(length)` finds first available code 1..10^length-1 not used by any unpaid invoice
- **Enabled when**: `autopay_enabled = true` AND `unique_code_enabled = true`
- **Config**: `unique_code_length` (3-6 digits), `unique_code_enabled` in `app_config`
- **Invoice flow**: If enabled → `unique_code` + `amount_with_code` stored in invoices table → pushed to Autopay with `amount_with_code`
- **Dynamic**: Length adjustable via Settings > Autopay. Warning when >3 digits.

### Mitra (Partner) System

- **Table**: `mitra` (UUID PK, name, phone, email, address, notes, disabled_at)
- **Relation**: `regions.mitra_id` → `mitra.id` (UUID). Regions linked to mitra.
- **Filtering**: Customers filtered by mitra via `regions.mitra_id = ?` in backend. Broadcast and maintenance have mitra target dropdowns.
- **Billing queries**: `LEFT JOIN mitra m ON m.id = r.mitra_id` returns `m.name as mitra` in invoice queries.

### Customer ↔ Region ↔ Address Mapping (Talaga Sunda)

The `services.region_id` maps customers to regions based on address keywords:
- **Tatakang / Jagadita** → `PRIMA TALAGA SUNDA RT 66 RW 22`
- **Janaloka / Jagakarta** → `Prima Talaga Sunda RT 67`
- **Jalatunda / Talaga Raya** → `PRIMA TALAGA SUNDA RT 68 RW 22`
- **Cibogo** → `BLOK CIBOGO`
- **Kirana** → `KIRANA`
- **Bukit Cilaja** → `BUKIT CILAJA`
- **Polandia / PLD** → `POLANDIA`
- **Poncol 1** → `PONCOL 1`, **Poncol 2** → `PONCOL 2`

Address matching uses `LIKE '%keyword%'` with `LOWER()` case-insensitive. Apply more specific patterns first (e.g., "bukit cilaja" before "janloka").

### CORS Configuration

- File: `backend/app.js` line 251. Must include `PATCH` in allowed methods.
- `methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS']` (PATCH was missing — **FIXED**)

### WhatsApp Notifications

- **Parameters**: See `docs/whatsapp-template-parameters.md` for complete list.
- **`{{paymentAccounts}}`**: Built from `payment_settings` (bank_accounts + ewallets), formatted as bank list.
- **`{{daftar_akun_bank}}`**: Same as `{{paymentAccounts}}` in database templates.

### Common Bugs & Fixes

1. **CORS rejects PATCH**: Add `'PATCH'` to methods array in `app.js` CORS config.
2. **PPPoE not saved to radcheck**: Check if `POST /customers/:id/services` emits `customer:upsert` event → **FIXED**.
3. **RADIUS group not updated after payment**: Service status may be `active` even though `radusergroup` shows `ISOLIR` → use `LIKE service_number || '%'` to find username.
4. **`technical_details` UPDATE with no row**: Use `INSERT ... ON CONFLICT ... DO UPDATE` instead of bare `UPDATE WHERE service_id = $1` — **FIXED**.
5. **Date format inconsistent**: All dates now use `id-ID` locale with `{ day: '2-digit', month: '2-digit', year: 'numeric' }` for `dd/mm/yyyy`. Currency uses `id-ID` for `Rp 150.000` (dots).
6. **`searchQuery` undefined**: In `customers/page.tsx`, variable is `searchQueryRef.current` (ref), not `searchQuery`. Fixed in filter summary section.
7. **`mitra_id` FK int→UUID**: Old migration created `regions.mitra_id` as INT but `mitra.id` is UUID → dropped and recreated.
8. **Invoice `paid_at` null**: Use `COALESCE(i.paid_at, i.updated_at)` in paid invoice queries.
9. **Broadcast regions empty**: API call missing `?limit=200` → default 10, data on page 2+ not shown. **FIXED**.

### OLT / ONU System

- **File**: `backend/config/olt-snmp-monitor.js` — SNMP engine for OLT ONU operations
- **Communication**: SNMP v2c over UDP port 161 using `net-snmp` library
- **Read community**: `olt.snmp_community` (from `olts` table)
- **Write community**: `olt.snmp_write_community` (from `olts` table, default `'private'`)
- **Vendors supported**: 6 (zte, huawei, hsgq, hioso, vsol, cdata)
- **Key SNMP operations**: `getOnuList()`, `setOnuName()`, `findOnuBySn()`

#### ONU Auto Rename System

**Current state**: Only works for EPON (HSGQ vendor). GPON (ZTE/Huawei) not yet supported.

- **Endpoint**: `POST /api/v1/realtime/olt-onus/rename` (`realtime.js:1178`)
- **Logic**: Maps `technical_details.mac_address` → customer name, then matches ONU by SN/MAC
- **EPON (HSGQ)**: `onu.sn` from SNMP returns MAC address → direct match ✅
- **GPON (ZTE/Huawei)**: `onu.sn` returns GPON Serial (e.g., `ZTEGC12345678`), NOT MAC → never matches ❌
- **Future GPON fix**: Need to add `onuMac` OID per vendor + use `radacct.callingstationid` for matching
- **radacct approach**: `radacct.callingstationid` contains actual device MAC → join to `technical_details.pppoe_username` → get customer name → match via MAC OID per vendor
- **OID MAC for ZTE**: Research pending — need to SNMP walk OLT to find correct OID (candidate: `1.3.6.1.4.1.3902.1012.3.28.1.1.4.x`)

#### ONU Name Format
- **setOnuName()**: Sanitized: only `[a-zA-Z0-9\s-_]`, max 30 chars, sent via SNMP SET OctetString
- **Per-vendor OID**: Each vendor has different `onuName` OID (defined in `OLT_OIDS`)

#### ONU Pagination (OLT Detail Page)
- **Issue**: `GET /api/v1/olts/:id/onus` returns ALL ONUs without pagination — can be 2000+ rows
- **Fix**: Added `page`, `limit`, `search` params + server-side slice after SNMP walk. **FIXED.**

#### ONU Auto Rename Trigger
- **Button**: "Sync All Names" on OLT detail page → calls `POST /realtime/olt-onus/rename` with `dry_run=false`
- **Scheduler**: Not yet added. Can add daily cron at 04:00 in scheduler.js for bulk auto-rename.
- **Matching**: Uses `radacct.callingstationid` → `technical_details.mac_address` → customer name

### WhatsApp Notification System

- **Provider**: Currently `off`. To enable: set `whatsapp_provider = 'omnichat'` in `app_config`. API key already configured.
- **Logging**: ALL notification attempts are logged to `omnichat_message_logs` (even when provider is off — status `skipped`).
- **Resend**: Button on billing page calls `POST /billing/invoices/:id/resend` → creates new log entry.
- **TAGIH column**: Green if `sent_at IS NOT NULL` (notification dispatched). `sent_at` set BEFORE WhatsApp attempt.
- **Export**: `whatsapp-notifications.js` → `module.exports = whatsappNotificationManager` (instance, not object). DO NOT change to `{ WhatsAppNotificationManager, whatsappNotificationManager }`.
- **Options forwarding**: `sendNotificationOmnichat()` forwards options to `kilusiOmnichat.sendMessage()` for logging context.
- **All notification methods** must pass `customer_id`, `customer_name`, `notification_type` in options.
- **Template parameters**: See `docs/whatsapp-template-parameters.md` for complete parameter list.

### Package Change — Prepaid Invoice Update

- **Trigger**: `PUT /customers/:id` (customer-service.js `updateCustomer()`)
- **Prepaid logic**: 
  - Block if paid invoice with `due_date > CURRENT_DATE` exists → error "Pembayaran di muka hingga [tanggal]"
  - Update all unpaid invoices (`status IN ('unpaid','sent','draft')`) to new package price + package_id
- **Postpaid**: No invoice update. Notification says "berlaku di invoice berikutnya".
- **History**: `package_change_history` table records every change (old/new package, price, invoice_updated).
- **Endpoint**: `GET /customers/:id/package-history` returns history list.
- **Frontend**: Detail Pelanggan modal has "Upgrade/Downgrade" + "Riwayat" buttons next to Paket field.

### Cron Scheduler (After Refactor)

| Time | Setting | Job |
|------|---------|-----|
| `invoice_time` (07:00) | Dynamic | ALL invoice cycles (merged) + WA notification |
| `reminder_time` (09:00) | Dynamic | Due date reminders H-1 |
| `suspension_time` (23:59) | Dynamic (existing) | Suspension check + WA notification |
| 03:00 daily | Hardcoded | RADIUS orphan cleanup only |
| Every 1 min | Hardcoded | Voucher usage check |
| Every 1 hour | Hardcoded | GenieACS sync |

**Removed crons**: Overdue update (frontend handles badge), Restore check (payment triggers are instant), Autopay polling (webhook is instant), RADIUS full sync (triggers are instant).

### WhatsApp / Payment Method Display

- **Payment types**: Tunai (admin, channel `-`), Transfer (admin, bank name), Tripay (system), Autopay (system)
- **Dropdown**: Plain list with UPPERCASE labels, no optgroup/category headers
- **Enrichment**: `formatPaymentMethod()` in `billing.js` resolves `bank_xxx` → `BCA - 1234567890`
- **Payment time**: Uses `datetime-local` input (real time, not 00:00)
- **Header**: Search bar replaced with `WAKTU SERVER : dd/mm/yyyy HH:MM:SS WIB` (updates every second)

### Recent Bug Fixes Summary

1. **Resend 500**: `whatsapp-notifications.js` export was `{ class, instance }` instead of just `instance` → ALL notification calls silently failed for weeks.
2. **Backend crash loop**: `websocket-logs.js` missing `function initializeLogWebSocket(server) {` → syntax error → crash every startup.
3. **Port 3001 conflict**: Systemd `ExecStartPre=/bin/bash -c 'lsof -ti :3001 | xargs -r kill -9'` + `KillMode=mixed` prevents crash-restart loop.
4. **Checkbox opens detail**: React's `onChange` vs `onClick` synthetic event delegation. Fix: use `onClick={(e) => e.stopPropagation()}` on checkbox inputs.
5. **CORS PATCH**: Missing from methods array in `app.js` line 303. **FIXED.**
6. **Nginx CORS**: Also missing PATCH in Access-Control-Allow-Methods at `/etc/nginx/sites-enabled/kilusi-reverse-proxy.conf`.
7. **FreeRADIUS Docker**: Switched from bridge networking to host mode → each NAS identified by real IP → per-NAS secrets work.

### Invoice Generation Logic (for migration/reset)

```
For each customer:
  1. DELETE all existing invoices
  2. UPDATE services: active_date, isolir_date from source data
  3. If isolir_date ≤ today + 5 days → generate 1 invoice
     - amount = package.price
     - due_date = isolir_date (from external data)
     - created_at = due_date - 5 days
     - status = 'unpaid' (or 'overdue' if due_date < today)
  4. If isolir_date > today + 5 days → skip (cron will generate later)
```

---

## Chatbot WhatsApp Integration (May 2026)

### Architecture
Omnichat handles Groq AI (intent classification + response generation). Backend Kilusi-Bill provides 5 REST API endpoints as data sources.

### Backend Endpoints (all under `/api/v1/chatbot/`)

| Endpoint | Auth | Rate Limit | Description |
|----------|------|:---:|-------------|
| `GET /billing/:phone` | `X-API-Key` + phone | 15/min | Customer billing: invoices, amount, due_date, portal_link |
| `POST /support` | `X-API-Key` + phone | 15/min | Create support ticket from WA |
| `GET /packages` | `X-API-Key` + IP | 30/min | All active packages: name, speed, price |
| `GET /coverage?area=xxx` | `X-API-Key` + IP | 30/min | Self-learning coverage: searches customer addresses → region names → district |
| `GET /company` | `X-API-Key` + IP | 30/min | Company info, registration URL, map URL |

### Coverage — Self-Learning from Customer Data
The coverage endpoint has a 3-tier search:
1. **Customer addresses** (ILIKE) — learns from existing customer data → returns matched regions with customer count
2. **Region names, district, regency** — fallback when no customers found
3. **Not found** — returns available=false

Confidence levels: `high` (>5 customers), `medium` (2-5), `low` (1), `none` (0).

### Key Files
- `backend/routes/api/v1/chatbot.js` — All 5 chatbot endpoints
- `backend/middleware/chatbotAuth.js` — `chatbotAuth` (phone-based rate limit) + `chatbotPublicAuth` (IP-based rate limit)
- `backend/routes/api/v1/index.js` — Route registration at line 176: `router.use('/chatbot', require('./chatbot'))`
- `docs/chatbot-integration-plan.md` — Full specification for Omnichat team

### Omnichat Credentials
- API Base URL: `https://api.kilusi.id`
- API Key: stored in `app_config.chatbot_api_key`
- Map URL: `https://kilusi.id/#cakupan` (MapSection component has `id="cakupan"`)
- Registration URL: `https://kilusi.id/customer/register`

### Registration Page Fix
- `frontend/src/app/customer/register/page.tsx` — Uses `CONFIG.API_BASE_URL` for absolute API URLs (not relative paths which 404)
- Package dropdown fetched from `GET /api/v1/landing/packages`
- Package IDs in `landing_page_content.packageIds` control which packages appear on landing page AND registration page

---

## PostgreSQL Timezone — WIB (May 2026)

### Configuration
```sql
ALTER DATABASE kilusi_bill SET timezone = 'Asia/Jakarta';
```

### Critical Rules
- **NEVER** use `.toISOString().split('T')[0]` for date-only values — this converts to UTC, causing off-by-one errors for WIB
- **ALWAYS** use local date formatting: `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`
- **ALWAYS** use PostgreSQL-native date math: `CURRENT_DATE + INTERVAL 'N days'` (not JavaScript date math)
- Existing `TIMESTAMP WITHOUT TIME ZONE` and `DATE` columns are NOT converted — only `NOW()` and `CURRENT_DATE` behavior changes
- All cron jobs use `timezone: "Asia/Jakarta"` in node-cron

### UTC Off-by-One Pattern (Bug Fixed Everywhere)
The pattern `.toISOString().split('T')[0].slice(0,10)` was found and fixed in 17 locations across backend and frontend. All replaced with local date formatting.

---

## New Customer Flow (May 2026)

### Status Lifecycle
```
Public Registration → status: 'waiting'  → Registrations Page
Admin "Proses"     → status: 'pending'   → Customers Page (with "Instalasi Selesai" button)
"Instalasi Selesai" → status: 'active'   → Invoice created + WhatsApp notification sent
```

### Key Endpoints
| Endpoint | Action | Status Change |
|----------|--------|:---:|
| `POST /api/v1/public/register` | Public registration | → `waiting` |
| `POST /api/v1/customers` | Admin create from customers page | → `pending` (force) |
| `POST /api/v1/customers/:id/process` | Admin approve registration | `waiting` → `pending` |
| `POST /api/v1/customers/:id/activate` | Installation complete | `pending` → `active` + invoice + notif |

### Registration Page (`frontend/src/app/admin/registrations/page.tsx`)
- Filters `status: 'waiting'` by default (public registrations awaiting review)
- Detail modal: "Setujui (Proses)" button for waiting customers, "Tolak" (delete) button
- All admin CRUD modals (Create, Search, Identity) removed — registrations page is read-only for review

### Customers Page (`frontend/src/app/admin/customers/page.tsx`)
- Main table: `has_service: 'true'` + `exclude_status: 'waiting'`
- Identity table: `has_service: 'false'` (customers without services)
- "Instalasi Selesai" button visible only when `status === 'pending'`
- Status badge: "Menunggu Instalasi" (pending), "Menunggu Review" (waiting)

---

## Activation Service (May 2026)

### File: `backend/config/activation-service.js`
Fixed 3 critical bugs:
1. **SELECT**: Changed `c.billing_type`, `c.status` → `s.billing_type`, `s.status` (columns don't exist in customers table)
2. **Removed UPDATE customers**: No `status`, `active_date`, `install_date` columns in customers table
3. **setPrepaidTrial**: Writes to `services` table (not `customers`) — columns `trial_active`, `trial_expires_at` added via migration

### Activation Flow
1. SELECT service data + customer name
2. Calculate dates (active_date = now, isolir_date = per siklus)
3. UPDATE services → status='active', active_date, isolir_date
4. Create invoice via `billingService.createCustomerInvoice`
5. Send WA notification (installation completed + invoice)
6. Set prepaid trial (30 min) if billing_type = 'prepaid'

### Invoice Logic (First Invoice)
- **Prepaid**: `dueDate = new Date()` (bayar di muka saat instalasi)
- **Postpaid**: `dueDate = new Date()` (biaya instalasi)
- Invoice generation removed from `createCustomer()` — only at activation

---

## Token & Portal Access (May 2026)

### Customer Magic Token
- Token expiry: **365 days** (independent from billing cycle)
- Token regenerated on every new invoice (`sendInvoiceCreatedNotification` + `sendInvoiceCreatedNotificationWithDetails`)
- Suspended customers can still access portal (isolir_date check removed from `validateToken`)
- `UPDATE customers SET token_expires_at = NOW() + INTERVAL '365 days'` applied to all 42 existing tokens

---

## Billing & Invoice Fixes (May 2026)

### Rapel (Bulk Payment)
- **Due date now respects siklus**: `fixed`/`tetap` uses billing day from last invoice, not end-of-month
- **No previous invoice fallback**: uses `svc.isolir_date` (not `new Date()`)
- **Month offset**: skips 1 month only when previous invoices exist (`hasPreviousInvoices`)
- **Post-processing**: updates service dates, restores suspended service (RADIUS + MikroTik), sends WA notification, creates accounting entry
- **UTC fix**: all dates stored as local strings, not JavaScript Date objects

### Portal Dashboard Billing Stats
- Fixed `customer-auth-nextjs.js:549-556`: `status = 'unpaid'` → `status IN ('unpaid','suspended','sent','draft','overdue')`
- Removed `created_at >= DATE_TRUNC('month', CURRENT_DATE)` filter — shows all unpaid invoices regardless of month
- "Lunas / Tidak ada tagihan" no longer shown for suspended customers

### Grace Period
- Column: `billing_settings.grace_period_days` (default 0)
- Dynamic — change via SQL or settings UI
- Suspension happens on due_date at 23:59 (0 grace period)

### Autopay
- CHECK constraint fixed: `'autopay'` added to allowed gateways
- INSERT fixed: removed non-existent columns `gateway_token`, `gateway_data`
- Restore service after autopay payment added
- Require paths fixed (`./serviceSuspension` → `../config/serviceSuspension`)

### Cron Schedule (WIB)
| Time | Job |
|------|-----|
| 07:00 | Invoice generation (all cycles) |
| 09:00 | Due date reminders (H-1) |
| 23:59 | Service suspension check |
| Every 1 min | Voucher check + prepaid trial expiry |

---

## Customer Service Fixes (May 2026)

### deleteCustomer
- Deletes unpaid/draft invoices first (admin can delete new customers)
- Then checks for paid/sent invoices (blocks deletion if found)
- Cleans up RADIUS entries for all customer's services

### createService (PPPoE Idempotent)
- If PPPoE username exists for SAME customer → return existing service (no duplicate)
- If PPPoE username exists for DIFFERENT customer → throw 409 conflict

### Duplicate Phone Check (updateCustomer)
- Removed `AND status != 'pending'` from query — `customers` table doesn't have `status` column

### calculated_isolir_date
- Fixed: `.toISOString().split('T')[0]` → local date formatting
- Affects ALL customer displays on every page

---

## API Notes (May 2026)

### Public Registration API
- `POST /api/v1/public/register` — Status forced to `'waiting'`
- Frontend page at `/customer/register` uses `CONFIG.API_BASE_URL` for API calls

### Chatbot API (Public Endpoints — no JWT auth)
- All endpoints use `X-API-Key` header for authentication
- Rate limiting: per-phone for billing/support, per-IP for packages/coverage/company
- API key stored in `app_config.chatbot_api_key`

---

## Chatbot Payment Proof (May-June 2026)

### Architecture
Omnichat Groq scans payment proof images → calls Kilusi-Bill API → admin approves via Omnichat card.

### Endpoints (all in `backend/routes/api/v1/chatbot.js`)

| # | Endpoint | Method | Auth | Purpose |
|---|----------|--------|------|---------|
| 1 | `/payment-proof` | POST | `chatbotAuth` | Record proof → `match_status: "found"/"not_found"` |
| 2 | `/payment-proof/:id/assign-customer` | POST | `chatbotAuth` | Admin assign customer to pending tx |
| 3 | `/approve-payment` | POST | `chatbotAuth` | Admin approve → pay invoices + restore + notif + accounting |
| 4 | `/admin-users` | GET | `chatbotPublicAuth` | List admin users for Omnichat profile dropdown |
| 5 | `/bank-accounts` | GET | `chatbotPublicAuth` | Bank accounts for AI payment matching |

### Payment Proof — `match_status` Flow

| Scenario | `match_status` | Card UI | Next Action |
|----------|:---:|------|------|
| Nomor terdaftar | `found` | Data billing + [Setuju] [Tolak] | Admin verify → approve |
| Nomor tidak dikenal | `not_found` | ⏳ "Menunggu identitas" + [Cari Pelanggan] | Assign customer → approve |

### `approve-payment` — What Happens
1. Mark ALL unpaid invoices → `paid`
2. `updateServiceDatesAfterPayment()`
3. `restoreServiceByServiceId()` if suspended (RADIUS + MikroTik + CoA)
4. `sendPaymentReceivedNotification()` → WhatsApp
5. `createAccountingTransaction()` → revenue
6. UPDATE `payment_transactions` → `status='paid'`, `verified_by` (INTEGER FK to users.id), `verified_at`

### `verified_by` — Omnichat Admin to Billing User
- Omnichat admin's profile stores billing `user_id` (from `GET /admin-users` dropdown)
- `verified_by` = INTEGER (FK to `users.id`) — no mapping, no JSON config
- Billing UI: "Diverifikasi oleh: [username]" via JOIN users

### Bank Accounts for AI Matching
- `GET /bank-accounts` returns accounts from `payment_settings` dynamically
- Omnichat uses this to inject destination accounts into Groq vision prompt

### Plan Documents
- `docs/chatbot-payment-proof-plan.md` — Billing team plan
- `docs/PAYMENT_PROOF_OMNICHAT_PLAN.md` — Omnichat team plan

---

## Tripay Webhook Fixes (June 2026)

### Root Cause
Tripay callback URL was set to `portal.kilusi.id` which points to Next.js frontend (port 8080).

### Fixes

| # | File | Fix |
|---|------|-----|
| 1 | `paymentGateway.js:399` | Hardcode `callback_url` to `https://api.kilusi.id` |
| 2 | `index.js:400` | Alias: `router.use('/payments/callback', webhookRouter)` |
| 3 | Nginx | Proxy `/api/v1/payments/webhook/` + `/callback/` → `localhost:3001` on all domains |
| 4 | `payments.js:107-120` | INSERT into `payments` table + `sendPaymentReceivedNotification()` after webhook |

---

## Payment Amount Rules (June 2026)

### Display — by Payment Method

| Payment | Billing Table | Notification |
|:---:|------|------|
| **Autopay** | `amount_with_code` (150.003) | `amount_with_code` |
| **Manual** | `amount` (150.000) | `amount` |
| **Tripay** | `amount` + admin fee | `amount + fee` (154.250) |

### Key Files
- `billing/page.tsx:561,695` — `payment_source === 'autopay' ? amount_with_code : amount`
- `whatsapp-notifications.js:518-524` — Notif amount: autopay→code, tripay→base+fee
- `paymentGateway.js:399` — Tripay uses `invoice.amount` (base, not with code)

### Tripay Fee — Dynamic from API
- `fee_bearer` = `'customer'` or `'merchant'` (auto-detected from Tripay)
- Fee NOT deducted from revenue (customer burden)
- Rekap: `Pendapatan Bersih = totalAmount`

---

## Coverage — Self-Learning (May 2026)

### `GET /api/v1/chatbot/coverage?area=xxx`
3-tier: customer addresses (ILIKE) → region names → district/regency. `REPLACE(address,' ','')` handles "rt67" vs "RT 67".

---

## Portal Dashboard & Invoice Detail (May-June 2026)

### Portal Dashboard
- "Informasi Teknis": 10 fields (was 4). Added: Status, Billing Type, Active Date, Masa Aktif, Jatuh Tempo
- Data fix: both query paths in `customer-auth-nextjs.js` now return `status`, `active_date`, `isolir_date`, `billing_type`, `installation_date`, `customer_created_at`

### Invoice Detail
- "Masa Aktif Layanan" section with dates
- "Diterbitkan oleh": dynamic from `app_config.company` (was hardcoded)
- PDF: `window.print()` with `@media print` CSS — clean single A4 page

### Registration Page
- Uses `CONFIG.API_BASE_URL` for API calls
- Package dropdown: all active packages with name — speed — price

---

## Unique Code Reset + Autopay Sync (June 2026)

### Rule
After payment (any method), `unique_code` and `amount_with_code` must be reset to NULL on the invoice to prevent code reuse conflicts.

### Fixes

| # | File | Line | Change |
|---|------|------|--------|
| 1 | `autopay-service.js:220` | Autopay callback | `unique_code = NULL, amount_with_code = NULL` |
| 2 | `billing.js:1382-1384` | Manual payment | Same + notify autopay |
| 3 | `payments.js:82-93` | Tripay webhook | Same + notify autopay |

### `notifyAutopayInvoicePaid()` — new function in `autopay-service.js`
POSTs to `https://autopay.kilusi.id/api/v1/invoices/paid` to remove paid invoice from autopay's active list. Called after all non-autopay payments (manual, Tripay). Non-blocking — failure doesn't fail payment.

### Backfill
All 72 existing paid invoices synced to autopay. All existing `unique_code` reset to NULL for paid invoices.

---

## Safety Check — Suspension (June 2026)

### File: `backend/config/serviceSuspension.js`

After the June 1 incident (18 wrong suspensions), added a safety validator BEFORE suspending for fixed/tetap cycle:

```javascript
// If isolir_date differs > 3 days from active_date + 1 month → SKIP (data bug)
if ((siklus === 'fixed' || siklus === 'TETAP') && active_date) {
    expectedIsolir = new Date(active_date); expectedIsolir.setMonth(+1);
    diffDays = Math.abs((actual - expected) / 86400000);
    if (diffDays > 3) { logger.warn('SAFETY: SKIPPING'); continue; }
}
```

**Effect**: If any bug sets wrong isolir_date again, customer won't be suspended. Admin sees warning in logs.

### Incident: 18 Wrong Suspensions (June 1, 2026)
18 fixed-cycle customers had `isolir_date` overwritten to June 1 (regardless of billing day). Suspended at 23:59 on June 1 — many received suspension 20+ days early. All data fixed: isolir_date corrected, status restored to active, RADIUS groups restored, correction template sent via WhatsApp.

---

## Payment Amount Rules (June 2026)

### Display — by Payment Method

| Payment | Billing Table | Notification | KODE UNIK |
|:---:|------|------|:---:|
| **Autopay** | `amount_with_code` (150.003) | `amount_with_code` | Tampil |
| **Manual/Admin** | `amount` (150.000) | `amount` | `-` |
| **Tripay** | `amount` + admin fee (154.250) | `amount + fee` | `-` |

### Key Files
- `billing/page.tsx:561,695` — Table: `payment_source === 'autopay' ? amount_with_code : (total || amount)`
- `billing/page.tsx:694` — KODE UNIK: only show if `payment_source === 'autopay'`
- `whatsapp-notifications.js:518` — Notif amount: autopay→code, tripay→base+fee
- `billing/page.tsx:381` — Rekap: `Pendapatan Bersih = totalAmount` (fee NOT subtracted, customer bears it)

### Tripay Fee — Dynamic from API
- `fee_bearer` = `'customer'` or `'merchant'` (auto-detected from Tripay API)
- `billing.js:671` — `net_revenue`: respect `fee_bearer` — only subtract if `merchant`

---

## Portal Portal Dashboard (June 2026)

### "Informasi Teknis" — 10 fields (was 4)
Added: Status Layanan, Jenis Tagihan, Tanggal Aktif, Masa Aktif, Jatuh Tempo Berikutnya

### Data Fix (`customer-auth-nextjs.js`)
Both query paths now return ALL needed fields:
- Main path (line 366): added `s.billing_type`, `s.installation_date`, `c.created_at as customer_created_at`
- Fallback path (line 394): added `s.status`, `s.active_date`, `s.isolir_date`, `s.installation_date`, `s.billing_type`
- Response: `registration_date` mapped from `c.created_at` (not `s.installation_date`)

### Portal Billing Stats
- Fixed `customer-auth-nextjs.js:549-556`: `status = 'unpaid'` → `status IN ('unpaid','suspended','sent','draft','overdue')`
- Removed `created_at >= DATE_TRUNC('month', CURRENT_DATE)` filter

---

## Print & Invoice Detail (June 2026)

### Print CSS (`globals.css:150-162`)
```css
@media print {
  .no-print { display: none !important; }
  nav, header, [class*="Sidebar"], [class*="Header"] { display: none !important; }
  body { zoom: 0.82; } /* fit single A4 */
  @page { size: A4; margin: 0.6cm; }
}
```

### Invoice Detail API (`customer-billing.js`)
- Added `company` field: dynamic from `app_config.company`
- Added `service` field: `active_date`, `isolir_date`, `status`
- Fixed `JSON.parse(transaction.customer_data)` — type check before parse

### Invoice Detail Page
- "Masa Aktif Layanan" section with status badge + dates
- "Diterbitkan oleh": dynamic from company settings
- PDF: `window.print()` → Save as PDF
- "Aksi Cepat" Card: `className="no-print"` added

---

## Server 3 Deployment Fixes (June 21, 2026)

### Fixed: PPPoE Username "acs" di halaman GenieACS
- **Bug**: `getParameterWithPaths()` di `backend/routes/api/v1/genieacs.js:73` — `_object` check nge-break traversal di setiap step path. Fallback `searchParam(device, 'Username')` via BFS nemu `ManagementServer.Username` = "acs" duluan.
- **Fix**: Pindahin `_object` check ke setelah loop selesai. `searchParam` di-scope cari di `WANDevice` aja. Tambah path TR-181: `Device.PPP.Interface.1.Username`.

### Fixed: Manufacturer/Model "Unknown"
- **Bug**: Kode pake `device.DeviceID?.Manufacturer` tapi data asli GenieACS pake `_deviceId._Manufacturer`.
- **Fix**: Ganti semua referensi `DeviceID` → `_deviceId`.

### Fixed: FreeRADIUS disconnected di dashboard
- **Masalah**: `systemctl is-active freeradius` jalan di Server 3 (localhost), padahal FreeRADIUS di Server 1.
- **Fix**: Ganti ke UDP Status-Server pake `radclient` (freeradius-utils) ke `172.22.10.101:18121` secret `adminsecret`. Juga buka UFW port 18121/udp di Server 1.

### Fixed: GenieACS disconnected di dashboard  
- **Masalah**: Endpoint hardcode `http://localhost:7557` padahal GenieACS di Server 2.
- **Fix**: Ganti pake `getSetting('genieacs_url', 'http://localhost:7557')`. Set `genieacs_url = http://172.22.10.102:7557` di `app_config` database.

### Fixed: H1S (CMDC) tidak punya VirtualParameters
- **Masalah**: VirtualParameters di MongoDB (`virtualParameters` collection) butuh device inform cycle untuk execute. H1S `_timestamp` undefined → provision belum jalan.
- **Fix**: Set `_timestamp`, `_lastBootstrap`, `_lastBoot` di MongoDB langsung. Juga set VirtualParameters via MongoDB update untuk immediate fix.
- **Catatan**: VirtualParameters scripts ada di MongoDB collection `virtualParameters` — bukan di ext scripts atau provision scripts.

### Key Configs
- **FreeRADIUS status server**: `172.22.10.101:18121` UDP, secret `adminsecret`. Aktif via `sites-available/status` symlink.
- **GenieACS NBI**: `http://172.22.10.102:7557` (tanpa auth)
- **GenieACS CWMP**: `http://172.22.10.102:7547`
- **GenieACS UI**: `http://172.22.10.102:3000`
- **GenieACS ext dir**: `/opt/genieacs/ext/` (kosong, tidak dipakai)
- **Server 3 → Server 1 PostgreSQL**: `172.22.10.101:5432`, user `kilusi_user`