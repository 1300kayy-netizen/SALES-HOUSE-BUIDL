# The Sales House — SalesOS: Production Engineering Plan

Status: PLAN ONLY. No implementation code exists. Approve, then say: **"Implement Phase 0 and Phase 1."**

---

## A. Executive Architecture Summary

**What we are building:** a private, internal sales-operations system of record. Reps submit each Xfinity sale (already processed in Zoey) into SalesOS; management sees it live, tracks it through a controlled lifecycle, audits every change, and reports on it.

**Recommended architecture: a modular monolith.** One Next.js app, one Postgres database, one auth provider. No microservices, no queues, no event bus in V1.

Key decisions (and the ones I am deliberately challenging):

| # | Decision | Why |
|---|---|---|
| 1 | **Modular monolith** on Next.js (App Router) + Postgres | 10–100 reps and low-hundreds-of-thousands of rows is trivially within one Postgres. Distributed systems would be pure cost. |
| 2 | **Authorization enforced in a server-side policy layer, plus Postgres RLS as defense in depth** | UI hiding is cosmetic. Every read/write goes through `server/` functions that take an `Actor` and call `can(actor, action, resource)`. |
| 3 | **Order domain built around an append-only status history** | `orders.current_status_id` is a denormalized pointer; truth lives in `order_status_history` (immutable, enforced by trigger). |
| 4 | **Status = two axes, not one** (see §F.4): *lifecycle stage* + *flags/outcome* | A single linear enum can't express "Installed but Chargeback" or "Pending but Needs Attention". |
| 5 | **Customer is not a global entity in V1.** Customer data is *snapshotted onto the order* and linked to a lightweight `customers` row for duplicate detection | Preserves historical truth; avoids premature CRM complexity. |
| 6 | **DOB: application-level (envelope) encryption + blind index for duplicate matching**, never returned to client unless a server-side reveal action succeeds and is audited | DB-level disk encryption alone doesn't protect against SQL-reader or backup leaks. |
| 7 | **Ingestion via `OrderSourceAdapter` → one `submitOrder()` use-case** | Manual form, CSV, and a future Zoey adapter all produce the same `NormalizedOrderInput`; idempotency by `(source, external_id)`. |
| 8 | **Commission is a separate bounded context**, rules effective-dated, results stored as immutable ledger entries | Orders never carry a "current rate". |
| 9 | **Reporting from indexed SQL + a small number of views/rollup tables later**, not a warehouse | Premature OLAP is the classic over-engineering trap. |
| 10 | **Clerk vs Supabase Auth → Recommend Supabase Auth** if using Supabase (§O). If you'd rather not couple, Clerk is acceptable; do NOT run both. | Fewer vendors, RLS-native `auth.uid()`, no per-MAU cost cliff. |
| 11 | **Challenge: drop PostHog from V1.** | Product analytics on a PII-heavy internal tool is a liability (accidental PII capture), not a need. Sentry + audit log + SQL covers V1. |
| 12 | **Challenge: Drizzle + Supabase is fine, but use Drizzle for schema/migrations and queries; use Supabase only as Postgres + Auth (+ Storage later).** Don't use the Supabase JS client for data access. | One data-access path = one place to enforce authorization. |
| 13 | **Phase 0 is a clickable UI prototype on mock data (no DB/auth)** so the team can react to the design before we build plumbing. Mock data is isolated and deleted in Phase 3. | Your explicit ask. |

---

## B. Assumptions

1. **Provider/market:** Xfinity (Comcast) is the only provider in V1; the data model is multi-provider from day one.
2. **⚠ Screenshot discrepancy (needs your answer):** the screenshots show a **red-branded "Rogers" partner portal** (Dealer / Agent / Manager login), whereas the brief says **Xfinity** and an **existing purple brand**. I'm assuming the screenshots are *layout/IA inspiration only* and SalesOS is Xfinity + purple accent. If Rogers (Canada) is also a program, that changes address format (province/postal code), phone format, privacy law (PIPEDA vs. US state laws), and data residency. See §X.
3. Zoey has **no documented public API**. V1 = manual entry. Nothing in the code will pretend otherwise.
4. Reps are **employees or contractors of The Sales House** who sign in with individual accounts (no shared logins).
5. "Dealer login" = Xfinity dealer **username** only. **No passwords stored, ever.**
6. Single organization (The Sales House), but every table carries `organization_id` so a second org/brand is not a rewrite. (This is cheap now, expensive later.)
7. US customers (address = street/unit/city/state/ZIP; E.164 phone). Currency USD.
8. Users: 10 → 50 → 100+ reps, ≤ ~500 orders/day peak, ≤ low millions of orders lifetime. Single Postgres region.
9. Time zones: store `timestamptz` in UTC; display in an org-configured zone (default `America/New_York` — **confirm**) so "Today" means the business day, not UTC.
10. Desktop-first for admin/manager; **mobile-first-quality for Submit Sale**.
11. DOB is required (per brief). We will collect it but minimize exposure; legal basis/retention to be confirmed (§X).
12. No customer-facing surface. No public signup. All users are invited.

---

## C. Product Sitemap

| Route | Purpose | Roles |
|---|---|---|
| `/login` | Email+password / SSO, MFA challenge | all |
| `/` Overview | Operations dashboard for a date range | A, M, R(own) |
| `/orders` | Server-side data table, saved views, bulk actions | A, M(team), R(own) |
| `/orders/new` | Submit Sale (fast form) | A, M, R |
| `/orders/[orderNo]` | Order detail: customer, address, products, timeline, activity | scoped |
| `/team/representatives` | Rep directory | A, M(team) |
| `/team/representatives/[id]` | Rep operational profile | A, M(team), R(self) |
| `/team/teams` | Team + membership management | A, M(read own) |
| `/team/leaderboard` | Ranked performance table | A, M(team), R(limited) |
| `/ops/exceptions` | Queue: Needs Attention, Failed, Duplicates, stale Pending | A, M |
| `/ops/installations` | Awaiting install / scheduled / overdue | A, M |
| `/ops/chargebacks` | Chargeback queue | A, M |
| `/reports/performance` | Cuts by rep/team/manager/package/dealer login | A, M |
| `/reports/commissions` | Projected vs paid (post-V1) | A |
| `/reports/exports` | Export requests + download history | A (M limited) |
| `/admin/packages` | Package catalog, effective-dated pricing | A |
| `/admin/dealer-accounts` | Dealer login identifiers (no secrets) | A |
| `/admin/users` | Invite, roles, deactivate, reset MFA | A |
| `/admin/audit` | Searchable audit log | A |
| `/admin/settings` | Org settings, status config, cutoff windows, time zone | A |
| `⌘K` palette | Global search + actions | all (scoped) |

Navigation rendering is **permission-driven**: an item shows only if the user holds the permission, but the route also enforces it server-side.

---

## D. Roles & Permissions Matrix

Model: `roles` → `permissions` (string keys like `order.read.all`), assigned via `user_roles`; scope (`own | team | org`) is resolved by the policy layer.

| Capability | Admin | Manager | Rep |
|---|---|---|---|
| View orders | all | assigned teams | own |
| View full customer PII | ✔ | team (name/email/phone/address) | own orders only, limited |
| **Reveal DOB** | ✔ (audited) | ✔ team, **reason required**, audited | ✘ (can *enter* it, sees masked after submit) |
| Submit order | ✔ | ✔ | ✔ |
| Edit order fields | ✔ | team, unprotected+protected w/ reason | own, **unprotected only until cutoff** |
| Protected fields (name, DOB, address, package, dealer login, rep) | ✔ | ✔ (reason) | ✘ after cutoff (default 30 min / configurable) |
| Change status | any transition | permitted transitions on team | `Submitted→Cancelled` only before cutoff (**confirm**) |
| Bulk status update | ✔ | team | ✘ |
| Archive/delete order | ✔ (soft only) | ✘ | ✘ |
| Override duplicate | ✔ | ✔ (reason) | ✘ (submits flagged for review) |
| Manage users/reps/teams | ✔ | ✘ | ✘ |
| Packages / dealer accounts / settings | ✔ | read | ✘ |
| Reports | all | team | self |
| Leaderboard | all | team | names + ranks only, no PII (**confirm**) |
| Exports | all (audited) | team, no DOB | ✘ |
| Audit log | ✔ | ✘ | ✘ |

DOB is **never** included in exports (V1). Hard rule; revisit only with explicit business sign-off.

---

## E. User Flows

### E1. Rep submits sale
1. Rep opens `/orders/new` (or taps "Submit Sale" on mobile). Form is pre-filled: **Agent = self**, **Provider = Xfinity**, **Dealer login = last used**.
2. Rep fills Customer → Address → Sale → Order. Client validation (Zod, shared schema) is live; phone formats as typed; DOB uses a segmented MM/DD/YYYY input (not a calendar picker).
3. On blur of phone/email/address, client calls `checkDuplicates` (debounced, non-blocking) → inline "Potential duplicate" banner with matches (masked, scoped by what this rep may see — a rep sees *that* a match exists + order no. + status, **not** another rep's customer data).
4. Submit → `submitOrder` server action: re-validates, authorizes, normalizes address/phone, encrypts DOB, runs duplicate check authoritative, **single DB transaction**: insert customer/order/items(snapshot)/status_history(`Submitted`)/audit event. Idempotency key (client-generated UUID per form session) prevents double-click double-submits.
5. Success screen: "Order TSH-10482 submitted successfully" → **View Order** / **Submit Another** (keeps agent/provider/dealer login, clears customer).
6. Draft preserved in `localStorage` (excluding DOB) and restored if the connection drops; submission retries with the same idempotency key.
7. If a possible duplicate was shown and rep proceeds: order is created with `needs_review = true` + `duplicate_flag`, manager notified in Exceptions.

### E2. Manager reviews sale
Overview/Exceptions → opens order → verifies fields → (optionally reveals DOB with reason) → changes status inline with required reason on non-forward transitions → timeline updates. Manager can edit protected fields with a reason; diff written to audit.

### E3. Status change
UI offers only **allowed next states** (server-provided from the transition table). `changeOrderStatus(orderId, toStatus, reason?, note?)` → transaction: lock row (`SELECT … FOR UPDATE`), validate transition + permission, insert history row, update `orders.current_status_id` + `status_changed_at`, write audit event. History rows are immutable (trigger blocks UPDATE/DELETE). Corrections are *new* rows.

### E4. Duplicate detected
Signals checked: same Zoey order no.; same email; same normalized phone; same normalized address + unit; same customer name + address; same dealer login + customer. Result is a **scored match set**. Strong match (Zoey no., or address+unit+name) → "Likely duplicate" (amber, still allowed for Admin/Manager override with reason; rep → submits as flagged). Weak (shared phone only) → informational. Every override writes `duplicate_overrides` (who, why, which matches) + audit event. Admin can later mark an order `Duplicate`.

### E5. Admin reviews audit history
`/admin/audit` → filter by actor, action, entity, date, IP → row expands to before/after JSON diff (sensitive values redacted/hashed, never plaintext DOB) → "View entity" deep link → export audit slice (itself audited).

### E6. Future Zoey-imported sale
Webhook/poller/CSV → `ZoeyAdapter.parse()` → `NormalizedOrderInput{source:'api', externalId}` → `submitOrder()` (same use case) → idempotency lookup on `(provider, source, external_id)`: found → update/ignore; not found → create. Unknown rep/dealer login → order lands in **Exceptions** (`Needs Attention`, reason "unmapped rep") rather than being dropped. Status updates from Zoey map via a **versioned status-mapping table** and append to history with `actor = system:zoey`.

---

## F. Database Schema (PostgreSQL)

Conventions: PK `id uuid` (**UUIDv7** generated in app; time-ordered = good index locality). Human order number is separate. Every business table: `organization_id`, `created_at timestamptz default now()`, `updated_at` (trigger), `created_by`, `deleted_at`/`archived_at` where applicable. Money = `integer cents` + `currency`. Enums for closed sets that rarely change; **lookup tables** for sets admins may configure (status).

### F.1 Identity & access
- **organizations**(id, name, timezone, settings jsonb)
- **users**(id = auth user id, organization_id, email *unique per org (citext)*, status `invited|active|suspended`, last_login_at, mfa_enrolled)
- **user_profiles**(user_id PK/FK, full_name, phone, start_date, market_id, employee_code)
- **roles**(id, key `admin|manager|rep`, name) · **permissions**(id, key) · **role_permissions**(role_id, permission_id) · **user_roles**(user_id, role_id) — *seeded & migration-managed; roles are not user-editable in V1.* (Skip per-user permission overrides.)
- **teams**(id, name, market_id, manager_user_id)
- **team_members**(team_id, user_id, role_in_team, **valid_from, valid_to**) — effective-dated so historical reports attribute orders to the *team at the time*. **Exclusion constraint**: a rep can't be on two active teams (`EXCLUDE USING gist (user_id WITH =, daterange(valid_from, valid_to) WITH &&)`).

### F.2 Reference
- **providers**(id, key `xfinity`, name, is_active)
- **markets**(id, name, state, timezone)
- **packages**(id, provider_id, code, name, category `internet|mobile|tv|voice|bundle`, is_active) + **package_prices**(package_id, price_cents, effective_from, effective_to) — price history separate from identity.
- **dealer_accounts**(id, provider_id, login_identifier, label, owner_user_id null, is_active) · unique `(provider_id, lower(login_identifier))`. **No credential columns.**

### F.3 Customers
- **customers**(id, org_id, full_name, email, phone_e164, dob_ciphertext bytea, dob_key_id, dob_blind_idx bytea, dob_year smallint, created_at)
  - `dob_ciphertext`: AES-256-GCM via envelope encryption (§I). `dob_year` stored plain solely to render `••/••/1996` without decrypting (acceptable per brief; **confirm** with counsel).
  - `dob_blind_idx`: HMAC-SHA256(dob, separate key) for exact-match duplicate checks without decrypting.
- **customer_addresses**(id, customer_id, line1, line2/unit, city, state, zip5, zip4, **normalized_key** (e.g. `123 MAIN ST|APT 4|90210`), geocode_ref null, kind `service`)

**Why not a global customers table with edits propagating?** An order must show *what was entered at sale time*. So the order carries snapshots (below); `customers` is a de-dup/CRM anchor and may be edited, orders are not silently changed.

### F.4 Orders (the core)
**orders**
- id, org_id, **order_no** (`TSH-10482`), provider_id, market_id, team_id (snapshot), rep_user_id, manager_user_id (snapshot), dealer_account_id, customer_id
- **snapshots:** customer_name, customer_email, customer_phone_e164, dob_ciphertext/key_id/blind_idx/year, service_line1/line2/city/state/zip, address_normalized_key — *copied at submit; edits create audit events*
- `submitted_at` (rep-entered/event time), `created_at` (system time) — **both** kept; they differ on backfills/imports
- `source` enum `manual|import|api`, `source_system` (`manual|csv|zoey`), `external_id` null, `idempotency_key`
- `stage` (lifecycle) FK→order_stages, `outcome` null FK→order_outcomes, `needs_attention bool`, `status_changed_at`
- future: account_number, installed_at, activated_at, scheduled_for, campaign_id, territory_id, zoey_order_no
- `needs_review`, `duplicate_flag`, `archived_at`, `archived_by`, `version int` (optimistic concurrency)
- **Unique:** `(organization_id, order_no)`; `(organization_id, source_system, external_id) WHERE external_id IS NOT NULL`; `(organization_id, idempotency_key)`.
- **order_no generation:** a Postgres **sequence** (`order_no_seq` start 10001) formatted `'TSH-' || nextval`. Gaps are acceptable; reuse is not. Never derived from count(*).

**Recommended status model (challenge to the brief):** one text field is wrong, but a single linear enum is also wrong. Use **three orthogonal pieces**:
1. **Stage** (where in the happy path): `Submitted → Processing → Pending → Scheduled → Installed → Activated`.
2. **Outcome** (terminal/exceptional; null while live): `Cancelled | Failed | Duplicate | Chargeback`. Setting an outcome ends the stage progression (Chargeback is only valid after `Installed/Activated`).
3. **Attention flag** (`Needs Attention`) — a *flag with reason*, not a status; any live order can carry it, and it's cleared independently.

Single displayed "status label" = outcome if set, else stage (+ attention marker). Transitions are defined in a **`status_transitions` table** (from → to, allowed_roles, requires_reason) so rules live in data + one server function (`orders/status-machine.ts`), never in components.

**order_stages / order_outcomes**(id, key, label, sort, is_terminal, color_token) — lookup tables (FK integrity, labels admin-editable, keys code-stable).

**order_status_history** *(immutable)*
id, order_id, kind `stage|outcome|attention`, from_value, to_value, changed_at, actor_user_id null, actor_type `user|system|import`, reason, note, source_event_id null. Index `(order_id, changed_at)`. **Trigger raises on UPDATE/DELETE**; app DB role lacks those privileges on this table.

**order_items** — one row per product sold: order_id, package_id, **snapshots:** package_code, package_name, category, unit_price_cents, currency, quantity, **price_id** (FK to package_prices row used), attributes jsonb (mobile line count, etc.).
**order_notes**(id, order_id, author, body, visibility `internal`, created_at) — append-only; edits create audit entries.
**order_documents**(id, order_id, storage_key, filename, mime, size, sha256, uploaded_by) — *post-V1.*
**order_edits** — not a table: edits are recorded in `audit_events.before/after`.

### F.5 Duplicates
**duplicate_overrides**(id, order_id, overridden_by, reason, matched_order_ids uuid[], signals jsonb, created_at)
Matching uses indexed columns: `lower(email)`, `phone_e164`, `address_normalized_key`, `external_id`, `dob_blind_idx`, `(dealer_account_id, customer_id)`.

### F.6 Commission (separate domain — *schema reserved, built post-V1*)
- **commission_rules**(id, provider_id, package_id null, category null, rep_user_id null, campaign_id null, trigger `installed|activated`, amount_cents | percent_bps, **effective_from, effective_to**, priority, version) — never updated in place; new row supersedes.
- **commission_entries** *(ledger, append-only)*(id, order_id, order_item_id, rule_id, rule_version, kind `projected|earned|clawback`, amount_cents, payee_user_id, period_id, created_at)
- **payout_periods**(id, start, end, status `open|locked|paid`, paid_at)
Orders carry **no** commission amount; reports join the ledger. Chargeback → `clawback` entry, not an edit.

### F.7 Audit
**audit_events** *(append-only; partition by month at scale)*
id, organization_id, occurred_at, actor_user_id, actor_type, action (`order.created`…), entity_type, entity_id, ip inet, user_agent, request_id, before jsonb, after jsonb, metadata jsonb.
Indexes: `(entity_type, entity_id, occurred_at desc)`, `(actor_user_id, occurred_at desc)`, `(action, occurred_at desc)`. Triggers/privileges prevent UPDATE/DELETE. **Sensitive values are never stored in before/after** — DOB appears only as `"dob": "[changed]"` / hash prefix.
Also **sensitive_access_log** is *not* a separate table: DOB reveals are `audit_events` with `action='order.dob_revealed'`.

### F.8 Other
- **saved_views**(id, user_id, scope `orders`, name, filter_json, columns_json, is_shared)
- **export_jobs**(id, requested_by, kind, filters jsonb, row_count, status, storage_key, expires_at, created_at)
- **notifications**(…) — post-V1.
- **import_batches / import_rows**(…) — added with CSV import (Phase 9).

### F.9 Indexes (orders, the hot table)
- `(organization_id, submitted_at DESC)` — default list
- `(organization_id, rep_user_id, submitted_at DESC)` — rep scope
- `(organization_id, team_id, submitted_at DESC)` — manager scope
- `(organization_id, stage, submitted_at DESC)` and `(organization_id, outcome) WHERE outcome IS NOT NULL`
- partial `(organization_id) WHERE needs_attention` — Exceptions queue
- `(organization_id, dealer_account_id, submitted_at DESC)`, `(…, package via order_items)`
- `(organization_id, address_normalized_key)`, `(…, lower(customer_email))`, `(…, customer_phone_e164)`, `(…, dob_blind_idx)`
- Search: `pg_trgm` GIN on `customer_name`, `address_line1`, `order_no`
- Keyset pagination on `(submitted_at, id)` — **no OFFSET** on deep pages.

### F.10 Cross-cutting strategies
- **Soft delete/archive:** `archived_at` only; default queries filter it; hard delete only via a retention job (§I). Unique constraints are partial where relevant (`WHERE archived_at IS NULL`).
- **Timestamps:** `timestamptz` UTC everywhere; `updated_at` via trigger; business-day bucketing done in SQL with `AT TIME ZONE org.timezone`.
- **Sensitive fields:** only `dob_*` is cryptographically protected in V1; email/phone/address protected by access control + disk encryption + backup encryption; never logged.
- **Migrations:** Drizzle Kit generates SQL migrations checked into Git; reviewed in PR; applied by CI to staging automatically and to prod via a gated job; destructive changes follow expand → migrate → contract. Triggers, RLS policies, and sequences live in hand-written SQL migrations alongside generated ones. Seeds (roles, permissions, stages, outcomes, transitions) are idempotent migrations, **not** fake data.
- **RLS:** enabled on all tenant tables as a backstop (`organization_id = auth org`; rep/team scoping policies). The app connects with a role subject to RLS for user-scoped reads; privileged system tasks use a separate role.

---

## G. System Architecture

```
Browser (React UI, no secrets, no raw PII beyond what the page needs)
   │ HTTPS/TLS 1.2+ (HSTS), httpOnly SameSite=Lax session cookie
   ▼
Next.js on Vercel  ── Middleware: session check, rate limit, security headers/CSP
   │
   ├─ Route Handlers / Server Actions   ← the ONLY entry points for mutations
   │       parse (Zod) → authenticate → authorize (policy) → use-case
   ▼
Application layer  (server/<domain>/*.ts: use-cases; pure policy + status machine)
   │
   ├─ Data access (Drizzle) ──────────► Postgres (Supabase)  [RLS backstop]
   ├─ Crypto service (DOB) ───────────► KMS (envelope key) 
   ├─ Auth provider ──────────────────► Supabase Auth (JWT/session verification)
   ├─ Storage (post-V1) ──────────────► private bucket, signed URLs
   └─ Integrations (post-V1) ─────────► Zoey adapter, Resend, Sentry
```

**Trust boundaries**
1. *Browser ↔ Next.js:* everything from the client is hostile input. Zod on every action; identity comes from the session, never from a body field (`agent_id` is only accepted from Admin/Manager and re-checked).
2. *Next.js ↔ DB:* only the server holds `DATABASE_URL`; DB role has least privilege (no UPDATE/DELETE on history/audit).
3. *App ↔ KMS:* only the crypto module can request data-key unwrap; keys never reach logs/clients.
4. *App ↔ external (Zoey, future):* inbound webhooks authenticated by HMAC + replay window; payloads validated and treated as untrusted.
5. *Analytics/monitoring:* receive **no PII** (scrubbers on Sentry; PostHog excluded in V1).

---

## H. API / Server Action Design

Server Actions for UI mutations; Route Handlers only for things needing HTTP semantics (webhooks, export download, health). Every handler: `parseInput(zod) → requireSession → authorize(actor, action, resource) → useCase() → writeAudit() → return Result<T, AppError>`.

| Action | Input (Zod) | Output | Permission | Notes |
|---|---|---|---|---|
| `submitOrder` | customer{name,email,phone,dob}, address, items[], dealerAccountId, notes?, zoeyOrderNo?, idempotencyKey, duplicateAck? | `{orderNo,id,duplicates[]}` | `order.create` | Transaction; agent defaults to actor; Admin/Manager may set agent |
| `checkDuplicates` | partial form signals | `DuplicateMatch[]` (scope-filtered) | `order.create` | Read-only, rate limited |
| `listOrders` | filters{dateRange,rep,team,status,package,market,dealerLogin,q}, sort, cursor, pageSize≤100 | `{rows,nextCursor,total?}` | `order.read.{own,team,all}` | Scope injected server-side; **DOB never in rows** |
| `getOrder` | orderNo | order DTO (masked DOB `••/••/1996`) | scoped read | 404 (not 403) for out-of-scope to avoid enumeration |
| `updateOrder` | orderId, version, patch (allow-listed fields), reason? | order | `order.update.{own,team,all}` + protected-field rules | Optimistic concurrency; diff → audit; **no mass assignment** (explicit field allow-list per role) |
| `changeOrderStatus` | orderId, kind, to, reason?, note? | order + history row | `order.status.change` + transition table | `FOR UPDATE` lock |
| `bulkChangeStatus` | orderIds[≤200], to, reason | per-id results | team/all | Per-row authorization; partial-success reporting |
| `revealDob` | orderId, reason | `{dob}` (not cached, `Cache-Control: no-store`) | `order.dob.reveal` | Audited **before** return; rate-limited per user |
| `addOrderNote` | orderId, body | note | scoped | |
| `archiveOrder` | orderId, reason | — | `order.archive` (Admin) | soft |
| `overrideDuplicate` | orderId, reason | — | `order.duplicate.override` | writes override + audit |
| `createSavedView/…` | name, filter, columns | view | self | |
| `getDashboard` | dateRange, scope | metrics DTO | scoped | See §K |
| `getLeaderboard` | dateRange, metric | rows | scoped | |
| `getRepProfile` | userId, range | profile DTO | self/team/all | |
| `requestExport` | kind, filters | jobId | `export.create` | async for > N rows; audited; no DOB; formula-injection-safe CSV |
| `inviteUser / updateUserRole / deactivateUser` | … | user | `user.manage` | audited; cannot demote last Admin |
| `createTeam / moveMember` | … | team | `team.manage` | effective-dated |
| `upsertPackage / setPackagePrice` | … | package | `package.manage` | audited |
| `upsertDealerAccount` | login_identifier, … | account | `dealer.manage` | validates **no password-like field exists** |
| `GET /api/health` | — | status | public | no data |
| `POST /api/webhooks/zoey` | **(not built in V1)** | | HMAC | placeholder only if an official API appears |

Errors: typed `AppError` (`VALIDATION`, `FORBIDDEN`, `NOT_FOUND`, `CONFLICT`, `RATE_LIMITED`, `DUPLICATE`); the UI maps these to field/inline/toast states. No stack traces to clients.

---

## I. Security Architecture

### I.1 Controls
- **Encryption in transit:** TLS 1.2+ only, HSTS preload, Supabase `sslmode=require`.
- **At rest:** managed Postgres disk + backup encryption (provider default, verify enabled). **Plus app-level encryption for DOB** (AES-256-GCM, per-record random IV, AAD = `orgId|customerId`), **envelope pattern**: data key wrapped by a KMS master key (AWS KMS / GCP KMS); `dob_key_id` enables rotation. Dev uses a local key file; **prod must use KMS** (a plain env var `PII_ENCRYPTION_KEY` is acceptable only for staging).
- **DOB display:** list/detail always render `••/••/YYYY` from `dob_year`. Reveal = explicit button → `revealDob` (reason, permission, rate limit) → value returned in that response only, rendered in memory, auto-re-masks after 30 s, not stored in client cache/React Query, not in URLs.
- **Audit of sensitive access:** `order.dob_revealed` (actor, order, reason, ip). Also `export.generated`, `customer.viewed_full` for Manager/Admin bulk contexts (sampled at list level, per-order at detail level).
- **Minimization & retention:** collect only listed fields; DOB retained only as long as needed for the program (default proposal: crypto-erase DOB N days after `Activated`/terminal state — **business decision**); retention job nulls ciphertext and logs it. Backups: daily PITR, 7–14 day window, quarterly restore test.
- **Sessions:** httpOnly + Secure + SameSite=Lax cookies, short access token + rotating refresh, absolute lifetime 12 h, idle timeout 30 min, revoke on role change/deactivation, device list (later). **MFA (TOTP) mandatory for Admin/Manager; strongly encouraged for Reps** (enforce via policy once rollout done).
- **Passwords:** min 12 chars, breached-password check (HIBP k-anonymity, Supabase supports), no composition theatre, lockout/backoff, invite-only signup.
- **Rate limiting:** Upstash Redis or Vercel's WAF/KV by IP+user: login 5/min, `revealDob` 10/hr/user, `checkDuplicates` 60/min, exports 5/hr.
- **Secrets:** Vercel encrypted env vars per environment; `.env*` git-ignored; secret scanning (GitHub push protection + gitleaks in CI); production KMS access via short-lived workload identity; rotate on staff exit.
- **Dealer credentials:** only the login *identifier* is stored. If passwords must ever be managed → dedicated vault (1Password Business/Secrets Automation, AWS Secrets Manager, HashiCorp Vault), never the app DB.
- **Headers:** strict CSP (nonce-based), `X-Frame-Options: DENY`, `Referrer-Policy: same-origin`, `Permissions-Policy`, `Cache-Control: no-store` on PII pages.
- **Logging:** structured logs with a field allow-list; Sentry `beforeSend` scrubber strips emails, phones, addresses, DOB, cookies, auth headers.

### I.2 Threat model

| Threat | Mitigation |
|---|---|
| Unauthorized customer-data access | Policy layer on every query, scope injected in SQL `WHERE`, RLS backstop, 404 on out-of-scope, authorization tests per endpoint |
| Privilege escalation | Roles server-resolved from DB (never JWT claims alone), role changes audited + session revoke, last-admin guard, no client-supplied role/agent without permission |
| Compromised rep account | MFA, idle timeout, rate limits, rep can't see others' PII or export, anomaly alerts (many reads, off-hours), fast deactivation + token revoke |
| Leaked env secrets | Per-env secrets, no `NEXT_PUBLIC_` for sensitive keys, scanning, KMS (no raw master key in env), rotation runbook |
| SQL injection | Drizzle parameterized queries only; raw SQL only via tagged `sql` template with bound params; lint-ban string concatenation |
| XSS | React escaping, no `dangerouslySetInnerHTML`, CSP nonces, sanitize notes (plain text only) |
| CSRF | Server Actions' origin checks + SameSite cookies; Route Handlers require same-origin header/CSRF token for mutations |
| Mass assignment | Zod `.strict()` schemas; explicit per-role field allow-lists; never spread request body into DB insert |
| Insecure exports | Permission + audit; no DOB; CSV formula-injection escaping (`=,+,-,@` prefix); signed short-lived URLs; auto-expire files; row caps; team scoping |
| ID enumeration | UUID PKs; `orderNo` lookups scoped & return 404; rate limiting |
| Sensitive logs | allow-list logging, scrubbers, no request-body logging |
| Stolen sessions | httpOnly/Secure cookies, rotation, short TTL, bind to UA family, revoke endpoint, MFA step-up for `revealDob` (**recommended** for Admin) |
| Database exposure | Private networking/IP allow-list where available, least-privilege roles, RLS, DOB ciphertext, encrypted backups, no prod data in lower envs |
| PII in analytics | PostHog excluded V1; if added: autocapture off, allow-listed events, no props from forms, masked session replay (or none) |
| Malicious CSV import | Size/row caps, strict schema, MIME+extension check, parse in sandboxed server code, formula stripping, per-row validation, preview-before-commit, idempotency keys, audit |
| Brute force | Rate limiting + progressive lockout + CAPTCHA after N failures + alerting |
| Insider misuse | Everything audited; admin changes require reason; periodic audit review |

---

## J. UX / Design System Specification

**Direction:** "quiet, dense, trustworthy." A neutral graphite/white interface; purple is a *signal*, not a theme. Reference feel: Linear's restraint, Stripe's tables, Vercel's typography, Ramp's data clarity.

**"Futuristic" without vibe-coding:** it comes from precision — tight grid, crisp 1px hairlines, tabular numerals, monospaced IDs, a refined dark mode, command palette, instant interactions, subtle live-data indicators — **not** from gradients, glow, or blur.

### J.1 Tokens
**Typography:** Inter (UI) + JetBrains Mono (IDs, numbers in tables optional). Features: `tnum`, `cv11`. Scale (px/line): 11/16 caption · 12/16 meta · **13/20 body (default, dense UI)** · 14/20 body-lg · 16/24 section title · 20/28 page title · 28/32 hero metric only (dashboard, sparingly). Weights 400/500/600. Letter-spacing −0.01em on ≥16.
**Spacing:** 4px base: 4, 8, 12, 16, 24, 32, 48. Page gutter 24 (16 mobile). Table row height 36 (compact) / 44 (comfortable). Form field height 36 (32 compact).
**Radius:** 4 (chips/inputs inner), **6 (buttons, inputs)**, **8 (panels, popovers)**, 10 max (modals). No pills except status dot-badges (radius 4).
**Borders:** 1px `--border` (hairline) everywhere; panels = border, not shadow. Shadows only for floating layers: popover `0 4px 16px rgb(0 0 0/.08)`, modal `0 12px 40px rgb(0 0 0/.16)`.
**Color (light / dark)**
- Surface: `#FFFFFF` / `#0B0B0E` · Canvas `#FAFAFB` / `#08080A` · Subtle `#F4F4F6` / `#131318`
- Border: `#E6E6EA` / `#23232B` · Border-strong `#D0D0D8` / `#32323C`
- Text: `#16161A` / `#EDEDF0` · Muted `#5E5E6B` / `#9A9AA8` · Faint `#8A8A98` / `#6E6E7B`
- **Brand (purple)** — `#6D3AF2` (primary, 5.2:1 on white) / hover `#5B2BD8` / subtle bg `#F3EEFF` / dark primary `#9B7BFF`. **Used for:** primary buttons, active nav item, focus ring, selected row accent, chart primary series, links. Nothing else. *(Confirm exact brand hex — §X.)*
- **Semantic (status only):** success `#12805C`, warning `#B26B00`, danger `#C4261D`, info `#2B6CB0`, neutral `#5E5E6B` — each with a 6–8% tint background.
- Charts: sequential purple ramp for one series; **categorical status colors reuse semantic tokens** (consistent meaning across the app).
**Motion:** 120–160 ms, ease-out, opacity/translate-4px only; `prefers-reduced-motion` respected; no animated numbers/entrances beyond fade.

### J.2 Layout
- App shell: 232px left nav (collapsible to 56px), 48px top bar (breadcrumb, ⌘K, date range when relevant, notifications later), content max-width 1440 with 24px gutters. 12-col grid, 16px gap.
- **Left nav:** wordmark, grouped sections with 11px uppercase labels (SALES / TEAM / OPERATIONS / REPORTING / ADMIN), text-first items, active = 2px purple left rail + subtle bg, **icons only where they add meaning** (none in V1 labels; a count badge for Exceptions). User menu bottom (avatar initials, name, role, theme toggle, sign out).
- Page header: title (20/28) + one-line context + right-aligned primary action (one purple button per page max).

### J.3 Patterns
- **Tables:** sticky header, 36px rows, zebra none (hover `--subtle`), numeric columns right-aligned tabular, ID in mono, status as **dot + text** (6px dot, not a pill), row-hover reveals actions, selected rows get purple 2px left rail + faint tint, column resize/visibility menu, sticky first column on horizontal scroll, filter bar above (chips: `Field: value ×`), saved views as tabs, footer with count + page size + keyset prev/next. Bulk bar appears docked at bottom when ≥1 selected.
- **Forms:** labels above fields (12/16 medium), helper text 12 muted, errors 12 danger with icon-less text + `aria-describedby`; sections separated by hairline + uppercase 11px label, two-column on desktop ≥ 960, single column mobile; native `<input>`/`<select>` styled, no custom selects where native suffices; Enter-to-advance and ⌘/Ctrl+Enter to submit; field-level masking for phone, segmented DOB.
- **Detail pages:** *no card per datum.* A 2-column layout: left (≈ 2/3) = flat sections separated by hairlines with definition lists (label/value rows); right rail (≈ 1/3) = status, key metadata, timeline. Header is a sticky bar.
- **Charts:** minimal axes, no gridlines except horizontal hairlines, direct labels, tooltips on hover, same tokens as UI.
- **Empty states:** one sentence, one action, no illustration (e.g. "No orders match these filters. Clear filters").
- **Loading:** skeletons matching real layout (table rows, metric rows); no spinners for >300 ms regions; button-level spinners only on submit.
- **Errors:** inline for validation; banner for page-level fetch failure with Retry; toast only for confirmations/transient; destructive actions use a confirm dialog naming the object.
- **Keyboard:** `⌘K` palette, `g o` go to Orders, `n` new sale, `/` focus search, `j/k` row nav, `Enter` open, `?` shortcut help.
- **Copy:** click-to-copy for phone/email/address/order no. with toast "Copied".
- **Accessibility:** WCAG 2.2 AA contrast (body ≥ 4.5:1, UI ≥ 3:1), 2px purple focus ring with 2px offset, all controls reachable by keyboard, labels bound to inputs, `aria-live` for toasts/validation summary, semantic landmarks (`nav`, `main`, `header`), tables use real `<table>` with `scope`, status never conveyed by color alone (dot + text), 44px touch targets on mobile submit flow, tested with VoiceOver/NVDA.
- **Responsive:** tables collapse to stacked rows with the 3–4 key fields under 768px; nav becomes bottom sheet/drawer; Submit Sale single column, sticky bottom Submit bar.

**Explicit don'ts (enforced in design review checklist):** gradients, glass, glow, >10px radius, shadow on resting panels, per-datum cards, decorative icons, pill filters, hero-size numbers outside the one dashboard KPI strip, emoji.

---

## K. Dashboard Specification (`/`)

Header: "The Sales House — Sales Operations" · range segmented control `Today | Yesterday | Week | Month | Custom` · filters (team, rep, provider, market). Business-day boundaries in org time zone; "Week" = Mon–Sun; compare with the prior equivalent period (delta shown small, muted).

**KPI strip (single bordered row, not separate cards), tabular numerals**

| Metric | Definition |
|---|---|
| Submitted | `count(orders)` with `submitted_at` in range, `archived_at IS NULL` |
| Installed | orders with a history row `to_value in (Installed, Activated)` **whose `changed_at` is in range** (event-based, so late installs are counted when they happen) |
| Activation rate | `activated(cohort) / submitted(cohort)`, **cohort = submitted in range** (also shown: "mature" rate excluding orders younger than N days) |
| Pending | current count with stage in (Submitted, Processing, Pending, Scheduled) and no outcome |
| Cancelled | outcome=Cancelled with change in range; **fallout rate** = (Cancelled+Failed+Duplicate) / Submitted (cohort) |
| Chargebacks | outcome=Chargeback with change in range |
| Active reps | distinct `rep_user_id` with ≥1 submission in range |
| Commission | projected/earned from ledger — **hidden until commission module exists** |

**Modules (dense, two-column grid)**
1. **Sales trend** — daily submitted vs installed line/bars for the range (hourly if Today).
2. **Status distribution** — horizontal stacked bar + table (count, %), current state of orders in range cohort.
3. **Top representatives** — top 8 by submitted; columns Submitted/Installed/Activation %; "View leaderboard".
4. **Recent submissions** — latest 10 (time, order no, rep, package, status), live-refreshing (poll 30 s / Supabase Realtime later).
5. **Needs attention** — orders flagged, failed, stale `Pending` > X days, unmapped; count + oldest age.
6. **Recent installs** — latest 8.
7. **Fallout** — cancel/fail/duplicate/chargeback rates, by team and top contributing reasons.
8. **Package mix** — top packages by count (small table).

Rep view: same page scoped to self ("My Sales"), without team modules.
Performance: one `getDashboard` call executes ≤ 6 aggregate queries (indexed), cached `unstable_cache` 30–60 s per `(scope, range)`; skeletons while loading.

---

## L. Orders Specification

### L.1 List (`/orders`)
Columns: Order ID · Submitted · Agent · Customer · Address · Package · Dealer Login · Status · Install Date · Manager · Market · Last Updated · (row menu). Default visible: ID, Submitted, Agent, Customer, Package, Status, Last Updated. Column visibility persisted per user/saved view.
Filters: date range, rep, team, status/outcome/attention, package, market, dealer login, source, duplicate flag; global search over order no, customer name, phone, email, address (trigram; phone/email exact).
Server-side: filter+sort+keyset pagination; page size 25/50/100; total count approximate (or exact with 5 s cache) to avoid `count(*)` cost. Saved views (personal & shared by Admin). Export current filter (audited, async). Bulk select (page-wide; "select all matching" requires confirmation + server-side re-query). Bulk status update with per-row result summary. **No PII beyond list columns delivered; DOB never in list payload.**

### L.2 Detail (`/orders/TSH-10482`)
- **Sticky header:** `TSH-10482` (mono) · Customer · status · "Submitted by Agent · Oct 4, 3:27 PM" · **Edit · Update Status · More** (archive, duplicate override, copy link).
- **Main (left):** Customer Information (name, email, phone, DOB masked + Reveal) · Service Address (with copy; map link later) · Products Sold (snapshot table: package, category, price at sale, qty) · Dealer / Submission (dealer login, source, Zoey order no, idempotency/external id for imports) · Installation / Activation (scheduled/installed/activated dates, account no.) · Internal Notes (append-only composer) · Documents (post-V1) · Commission (post-V1; shows "Not enabled").
- **Right rail:** current status control, key metadata (team, manager, market, created/updated), **Status Timeline** (vertical, history rows with actor/time/reason), **Activity Log** (audit events scoped to this order, with field diffs).
- Edit mode: inline per section with explicit Save/Cancel, unsaved-change guard, optimistic concurrency conflict message ("Updated by Maria 2 min ago — review changes").

### L.3 Submit Sale (`/orders/new`)
Single page, four sections (CUSTOMER / SERVICE ADDRESS / SALE / ORDER), tab order = visual order, autofocus first field, `autocomplete` attributes set, `inputmode` for phone/ZIP, phone auto-format `(555) 123-4567` → E.164 on submit, DOB segmented `MM / DD / YYYY` with age ≥ 18 sanity check, address normalization via a pluggable `AddressNormalizer` (V1: deterministic USPS-style normalizer in-house; later Smarty/USPS API), state select, ZIP 5/9 validation. Package select filtered by provider; Additional products as optional repeater. Dealer login select (from `dealer_accounts`, defaulting to last used). Duplicate banner (non-blocking) with matched records. Draft autosave (localStorage, DOB excluded). Offline-tolerant submit queue with same idempotency key. Confirmation panel with View Order / Submit Another. Mobile: single column, sticky submit bar, large touch targets.

---

## M. Reporting Architecture

- **Source of truth:** `orders` + `order_status_history` + `order_items` (+ `commission_entries` later). Event-based metrics (installs in period) come from history; cohort metrics (activation rate) from orders joined to latest history.
- **V1:** parameterized, indexed SQL in `server/reporting/*.ts` (one function per metric group), always scoped via the same policy layer. Business-day bucketing: `date_trunc('day', ts AT TIME ZONE tz)`.
- **When slow (≈ >500 ms p95 or > ~1M orders):** add `daily_rep_stats` rollup (org, day, rep, team, package, dealer, counts by stage/outcome) maintained by a trigger or scheduled job (`pg_cron`/Vercel Cron), and/or materialized views refreshed concurrently. Reports switch to rollups without UI change because they hide behind the same function signatures.
- **Question → source mapping** (all answerable from V1 schema): per-rep daily submissions · installs by rep/week · activation rate by rep/manager/team · package popularity (order_items) · dealer-login volume · cancellation rate · awaiting-install (`stage in Pending/Scheduled`) · fallout anomalies (z-score vs. org median, computed on demand) · repeat addresses (`address_normalized_key` group by having count>1). Commission questions require the commission module.
- **Definitions live in one document + one code module** (`docs/metrics.md`, `server/reporting/definitions.ts`) so Dashboard, Leaderboard, Rep profile and Exports can never disagree.
- Exports stream from the same query layer with row caps and async jobs.

---

## N. Future Zoey Integration Architecture

**Fact base:** no documented public Zoey API is assumed. Therefore V1 ships *interfaces and a normalized contract only*; no Zoey endpoints, keys, or payload shapes are invented.

```ts
interface OrderSourceAdapter<Raw> {
  readonly source: 'manual' | 'import' | 'api';
  readonly sourceSystem: string;              // 'manual' | 'csv' | 'zoey'
  parse(raw: Raw): Result<NormalizedOrderInput[], ParseError>;   // pure
  externalId(n: NormalizedOrderInput): string | null;            // idempotency identity
}
```
- `ManualOrderAdapter` (V1): Submit Sale form → `NormalizedOrderInput`.
- `CsvImportAdapter` (Phase 9a): column mapping UI, preview, per-row validation, `import_batches`.
- `ZoeyApiAdapter` / `WebhookAdapter` (**only if** Zoey publishes an official API/webhook/data feed or the business obtains a sanctioned export): added as a new file; no schema or dashboard changes.
- **One use-case** `ingestOrder(input, actor)` shared by all adapters → dedupe by `(org, source_system, external_id)` + the duplicate-signal engine → create/update.
- **Idempotency:** unique index on `(org, source_system, external_id)`; webhook `event_id` stored in `inbound_events` (unique) for replay safety.
- **Status sync:** `external_status_map(source_system, external_status → stage/outcome, version)`; appends history with `actor_type='import'`; never regresses a manually set outcome without flagging `Needs Attention`.
- **Failure handling:** unmappable rows → `import_rows.status='rejected'` with reason; unmapped reps/dealer logins → Exceptions queue, never silent drop.
- **Security:** HMAC signature + timestamp tolerance, IP allow-list if offered, secrets in env/KMS, payload size limits.
- Placeholder env vars (`ZOEY_API_KEY`, `ZOEY_WEBHOOK_SECRET`) are **not created until an official integration exists**.
- Action item for you: ask Zoey/Xfinity partner support whether any sanctioned data export, reporting feed, or partner API exists. Do not scrape or automate the Zoey UI (ToS/security risk).

---

## O. Recommended Technology Stack

| Layer | Choice | Verdict / reasoning |
|---|---|---|
| Framework | **Next.js (App Router) + TypeScript (strict) + React** | ✔ |
| Styling | **Tailwind CSS** with design tokens as CSS variables | ✔ |
| UI primitives | **Radix UI** (via selective shadcn copy-in), **TanStack Table**, `cmdk` (palette), `sonner` (toasts), `react-hook-form` + Zod resolver | ✔ use shadcn only as source you own & restyle (default shadcn styling looks generic — we override tokens/radius) |
| Charts | **Recharts** or **visx** — recommend Recharts V1 for speed, restyled | ✔ |
| Backend | Server Actions + Route Handlers, domain code in `server/` | ✔ keep logic out of components |
| DB | **Postgres on Supabase** | ✔ managed backups/PITR, RLS, private networking options. Pooled (`DATABASE_URL`) for app, direct for migrations. |
| ORM | **Drizzle** | ✔ SQL-close, typed, migration SQL is reviewable |
| Auth | **Supabase Auth** (recommended) vs Clerk | Supabase Auth: same vendor, RLS-native, MFA TOTP, free at our scale, password policy + HIBP. Clerk: nicer pre-built UI/org mgmt, but a second vendor, per-MAU cost, and RLS integration friction. **Choose Supabase Auth. Revisit only if you want SSO/SAML soon.** Role data lives in *our* tables, not in the provider. |
| Validation | **Zod** (shared client/server schemas) | ✔ |
| Hosting | **Vercel** (Pro for prod) | ✔ ; set function region = DB region |
| Errors | **Sentry** (PII-scrubbed) | ✔ |
| Product analytics | ~~PostHog~~ | ✘ defer (PII risk, no V1 need) |
| Email | **Resend** (invites, security notices) | ✔ but only when Phase 6+; Supabase's built-in invite mail via custom SMTP is enough for V1 |
| Storage | Supabase Storage (private buckets, signed URLs) | ✔ post-V1; S3 not needed |
| Rate limiting | **Upstash Redis (`@upstash/ratelimit`)** | ➕ one small addition; justified by login/reveal protection |
| Key management | **Cloud KMS** (AWS KMS recommended) | ➕ for DOB envelope key (prod) |
| Testing | **Vitest** (unit/integration with a real Postgres test DB via Testcontainers or Supabase local), **Playwright** (E2E + a11y via `axe-core`) | ✔ |
| CI | GitHub Actions: typecheck, lint, test, gitleaks, migration check | ✔ |
| Lint/format | ESLint (typescript-eslint strict, `no-explicit-any`), Prettier | ✔ |
| Package manager | pnpm | ✔ |

---

## P. Required Accounts / API Keys / Secrets

| Variable | What it does | Where to get it | Client-safe? | Dev vs Prod |
|---|---|---|---|---|
| `APP_URL` | Canonical base URL (links, CSRF origin checks) | You define | Server (public value OK) | `http://localhost:3000` / staging URL / prod domain |
| `DATABASE_URL` | Pooled Postgres connection (app runtime) | Supabase → Project → Database → Connection pooling (transaction mode) | **Server-only** | Separate Supabase project per env |
| `DATABASE_DIRECT_URL` | Direct connection for migrations | Supabase → Database → Direct connection | **Server-only** (CI/migration only) | Not exposed to runtime in prod |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL | Supabase → Settings → API | Client-safe | Per env |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Public key (RLS-gated) for auth client | Supabase → Settings → API | Client-safe (RLS protects) | Per env |
| `SUPABASE_SERVICE_ROLE_KEY` | Bypasses RLS — admin tasks (invites) | Supabase → Settings → API | **Server-only, never `NEXT_PUBLIC_`** | Prod key only in prod Vercel env; rotate on exposure |
| *(Clerk alt.)* `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY` | Only if Clerk chosen instead | clerk.com dashboard | publishable = client; secret = server | Dev/Prod instances separate |
| `AUTH_SECRET` | Signs app-level tokens/CSRF/cookies if app signs anything beyond provider session | `openssl rand -base64 32` | Server-only | Unique per env |
| `PII_KMS_KEY_ID` (prod) / `PII_ENCRYPTION_KEY` (local/staging only) | DOB encryption: KMS key ARN, or 32-byte base64 key | AWS KMS console (create CMK) / generate locally | Server-only | Prod = KMS only; never reuse keys across envs |
| `PII_BLIND_INDEX_KEY` | HMAC key for DOB duplicate matching | Generate 32 bytes | Server-only | Unique per env; changing it requires reindex |
| `AWS_REGION`, `AWS_ROLE_ARN` (or access keys if no OIDC) | KMS access from Vercel | AWS IAM (prefer OIDC federation) | Server-only | Least-privilege: `Encrypt/Decrypt/GenerateDataKey` on one key |
| `SENTRY_DSN` / `NEXT_PUBLIC_SENTRY_DSN` | Error reporting ingest | sentry.io project | DSN is client-safe | Separate project/env tag |
| `SENTRY_AUTH_TOKEN` | Upload source maps in CI | sentry.io → Auth Tokens | **CI-only secret** | |
| `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` | Rate limiting | upstash.com | Server-only | Separate DB per env |
| `RESEND_API_KEY` | Transactional email | resend.com (verify domain: SPF/DKIM/DMARC) | Server-only | Phase 6+; use a sandbox domain in staging |
| `CRON_SECRET` | Authenticates Vercel Cron → route handlers | You generate | Server-only | Per env |
| `WEBHOOK_SECRET` | HMAC for inbound webhooks | You generate | Server-only | **Create only when a webhook consumer exists** |
| `EXPORT_SIGNING_SECRET` | Signs short-lived export download URLs | Generate | Server-only | Per env |
| ~~`NEXT_PUBLIC_POSTHOG_KEY/HOST`~~ | Deferred | — | — | Not in V1 |
| ~~`ZOEY_API_KEY`, `ZOEY_WEBHOOK_SECRET`~~ | **Do not create.** Placeholders only if Zoey issues an official API | Zoey/Xfinity partner support | — | — |

**Accounts to open:** GitHub org + repo · Supabase (3 projects) · Vercel (Pro) · AWS (KMS only) · Sentry · Upstash · Resend (later) · domain registrar/DNS (e.g. `salesos.thesaleshouse.com`) · password manager for shared infra credentials.

---

## Q. Environment Setup

| | Local | Preview/Staging | Production |
|---|---|---|---|
| App | `pnpm dev` | Vercel Preview per PR + a stable `staging` branch alias | Vercel Production (`main`) |
| DB | **Supabase CLI local (Docker)** — fully disposable | Supabase project **sales-os-staging** | Supabase project **sales-os-prod** (PITR on, backups verified) |
| Data | Synthetic seed script (dev only) | Synthetic/anonymized only — **never copy prod PII down** | Real |
| Auth | Local Supabase Auth | Staging project; test users | Prod project; invite-only; MFA enforced |
| Secrets | `.env.local` (git-ignored) from `.env.example` | Vercel env scope *Preview* | Vercel env scope *Production* (restricted access) |
| KMS | local key file | separate KMS key | separate KMS key + rotation |
| Migrations | `drizzle-kit` local | auto-applied by CI on merge to `staging` | gated manual approval in GitHub Actions on `main` |

Rules: one Supabase project per environment; Preview deployments point at **staging** DB (not prod); Vercel env vars scoped per environment; `.env.example` lists names only; a `check-env` script validates presence/shape at boot (Zod-parsed `env.ts`; app refuses to start if invalid); branch protection on `main` (PR + passing CI + 1 review).

---

## R. Repository Structure

Feature/domain-oriented; avoid empty abstraction layers.

```
sales-os/
├─ app/                          # routing only; thin pages composing features
│  ├─ (auth)/login/
│  ├─ (app)/layout.tsx           # shell (nav, topbar)
│  ├─ (app)/page.tsx             # Overview
│  ├─ (app)/orders/…  (new/, [orderNo]/)
│  ├─ (app)/team/…  (representatives/, teams/, leaderboard/)
│  ├─ (app)/ops/…   (exceptions/, installations/, chargebacks/)
│  ├─ (app)/reports/…
│  ├─ (app)/admin/… (packages/, dealer-accounts/, users/, audit/, settings/)
│  └─ api/ (health/, export/[id]/, webhooks/ [future])
├─ features/                     # UI + client logic per domain (no DB access)
│  ├─ orders/ (components/, columns.tsx, filters.ts, submit-form/)
│  ├─ dashboard/  ├─ reps/  ├─ teams/  ├─ audit/  ├─ admin/
├─ server/                       # ALL business logic & data access (server-only)
│  ├─ auth/ (session.ts, policy.ts, permissions.ts)
│  ├─ orders/ (submit.ts, update.ts, status-machine.ts, duplicates.ts, queries.ts)
│  ├─ ingestion/ (adapter.ts, manual.ts, [csv.ts, zoey.ts later])
│  ├─ reporting/ (definitions.ts, dashboard.ts, leaderboard.ts)
│  ├─ commissions/ (reserved)
│  ├─ audit/ (write.ts, query.ts)
│  ├─ security/ (crypto.ts, kms.ts, ratelimit.ts, scrub.ts)
│  └─ actions/                   # Server Actions: parse → authz → use-case
├─ db/ (schema/*.ts, migrations/*.sql, seed/ (reference data), client.ts)
├─ schemas/                      # Zod schemas shared by client+server
├─ components/ui/                # design-system primitives (Button, Input, Table, …)
├─ lib/ (format.ts, dates.ts, env.ts, cn.ts)   # small, framework-agnostic
├─ styles/ (tokens.css, globals.css)
├─ tests/ (unit/, integration/, e2e/, authz/, fixtures/)
├─ docs/ (SALESOS_PLAN.md, metrics.md, runbooks/, adr/)
├─ .github/workflows/
└─ .env.example
```
Import rules (ESLint `no-restricted-imports`): `features/*` and `app/*` may not import `db/*`; only `server/*` touches `db/`; `server/*` is marked `server-only`.

**Phase 0 prototype layout** is a subset (shell, components/ui, features with `mock/` fixtures) so nothing is thrown away except `mock/`.

---

## S. Development Phases

> Order change from the brief: **Phase 0 is now the clickable UI prototype** (your request); architecture/repo scaffolding is folded into it. The prototype is real Next.js/Tailwind code that becomes the production shell.

### Phase 0 — Foundation + Clean Futuristic UI Prototype (for the team demo)
**Objective:** a deployed, clickable, honest-looking preview of SalesOS on **mock data** so the team can react to layout, density, and flow before backend work.
**Tasks**
1. Initialize repo: Next.js + TS strict + Tailwind + ESLint/Prettier + pnpm; `.env.example`; CI (typecheck/lint/build); Vercel preview.
2. Design tokens (§J) in `styles/tokens.css`; light + dark theme; Inter/JetBrains Mono.
3. `components/ui`: Button, Input, Select, Textarea, Field, Badge/StatusDot, Table primitives, Tabs/Segmented, Dialog, Popover, Toast, Skeleton, EmptyState, Kbd.
4. App shell: left nav (all sections from §C, role-aware via a **demo role switcher** Admin/Manager/Rep), top bar with breadcrumb + ⌘K palette.
5. Screens on in-memory fixtures (`features/*/mock/`, clearly fenced, tree-shaken from prod later):
   - **Overview** (KPI strip, trend chart, status distribution, top reps, recent submissions, needs-attention, recent installs).
   - **Orders table** (TanStack, filters, sort, pagination, column visibility, row selection + bulk status bar, saved-view tabs; client-side over mock data in Phase 0 only).
   - **Order detail** (sticky header, sections, status timeline, activity log, **masked DOB with working Reveal UI** and reason dialog against fake data).
   - **Submit Sale** (full form, validation, phone/DOB formatting, duplicate banner demo, confirmation state "Order TSH-10482 submitted successfully").
   - **Representatives list + profile**, **Leaderboard**.
   - Stubs with proper empty states: Exceptions, Installations, Chargebacks, Performance, Commissions, Exports, Admin pages.
6. Responsive pass (mobile Submit Sale and mobile nav), keyboard pass, a11y pass.
7. Prominent but unobtrusive **"Prototype — sample data"** marker in the shell so nobody mistakes it for live data.
**Dependencies:** none (you approve plan + confirm brand hex/logo).
**Acceptance:** all routes render; role switcher changes visible nav and available actions; submit-flow works end-to-end on fixtures; Lighthouse a11y ≥ 95; no console errors; works at 375 px and 1440 px; light and dark; deployed Vercel preview URL to share; zero real PII; design-review checklist (§J don'ts) passes.
**Security:** no real data, no secrets, no auth claims (marked prototype); robots `noindex`; protect the preview with Vercel Password Protection / deployment protection.
**Tests:** component tests (Vitest + Testing Library) for form validation/formatters/status-machine unit; Playwright smoke (nav, submit, filter, reveal) + axe.

### Phase 1 — Database + Authentication
**Objective:** real identity and the persistent core, still without full features.
**Tasks:** Supabase projects (local/staging/prod); Drizzle schema for §F.1–F.4, F.7 (+ reference tables); hand-written SQL for sequences, triggers (updated_at, history/audit immutability), RLS; seed reference data (roles, permissions, stages, outcomes, transitions, provider Xfinity); Supabase Auth with invite-only flow, MFA TOTP, password policy; session handling; `server/auth/policy.ts` with unit-tested permission matrix; `env.ts` validation; first Admin bootstrap script; audit `write()` helper; replace demo role switcher with real role.
**Dependencies:** Phase 0; Supabase/Vercel accounts; decisions on auth provider and time zone.
**Acceptance:** Admin can sign in with MFA, invite a user, assign role/team; unauthenticated requests redirected/401; role-scoped read helper returns correct subsets in tests; migrations apply cleanly local→staging; audit/history UPDATE/DELETE blocked by the app role; app boots only with valid env.
**Security:** least-privilege DB roles; service-role key never reaches client; cookie flags verified; rate limit on login.
**Tests:** policy matrix tests; migration smoke test; RLS tests (user A cannot read user B's rows via direct DB role); invite/MFA E2E on staging.

### Phase 2 — App Shell + RBAC
Replace mock nav gating with permission-driven nav; route guards + server-side `requirePermission`; users/teams/reps admin CRUD (audited); user deactivation kills sessions. **Acceptance:** authorization test suite passes for every route/action × role; manager sees only own team.

### Phase 3 — Order Submission
Real `submitOrder`, `checkDuplicates`, crypto module (KMS/dev key, blind index), address/phone normalization, packages + dealer accounts admin (minimal), order_no sequence, idempotency, transactional write (order+items snapshot+history+audit), draft recovery, confirmation. **Delete Phase 0 submit fixtures.** **Acceptance:** double-click creates 1 order; DOB never appears in DB/logs in plaintext (test greps); duplicate scenarios (6 signals) pass; mobile E2E passes. **Tests:** unit (normalizers, formatters), integration (transaction rollback), E2E, crypto round-trip + tamper tests.

### Phase 4 — Orders Management
Real list (server filters, keyset pagination, saved views, column prefs), detail, edit w/ protected-field rules + cutoff, status machine + history, notes, bulk updates, exports (async, safe CSV), DOB reveal flow + audit. **Acceptance:** 100k-row seeded staging table: list p95 < 300 ms; all transitions enforced; edits produce audit diffs; reps cannot fetch others' orders by guessing IDs.

### Phase 5 — Dashboard / Reporting
`server/reporting` with definitions doc; Overview, Leaderboard, Rep profile, Exceptions/Installations/Chargebacks queues, Performance report. **Acceptance:** metric numbers reconcile against hand-verified fixture dataset; each §K metric has a test; dashboard p95 < 500 ms at 100k orders.

### Phase 6 — Security / Audit Hardening
Audit log UI + filters; CSP/headers; Sentry scrubbers; rate limits; MFA enforcement; session timeouts; dependency audit; secrets scan in CI; retention job for DOB; backup restore drill; pen-test checklist run. **Acceptance:** threat-model table (§I.2) each row has an implemented control + test or documented acceptance.

### Phase 7 — Testing
Fill gaps to targets (§U); load test (k6) at 100 concurrent reps; accessibility audit with screen readers; UAT with 3–5 real reps/managers on staging with synthetic data.

### Phase 8 — Production Deployment
Prod Supabase/Vercel/KMS; domain + TLS; env vars; migrations gated; seed reference data; create Admin; data-handling policy signed; runbook; go-live checklist (§V); staged rollout (1 team → all).

### Phase 9 — Future Integrations (post-launch, gated by evidence)
9a CSV import adapter (preview/commit, idempotent). 9b Zoey adapter **only after** an official API/feed is confirmed. 9c Commission engine. 9d Document uploads, notifications.

---

## T. Acceptance Criteria (before production launch)
1. All MVP features in §W-V1 work on staging with real roles.
2. Authorization suite: every action × role × scope has a passing positive and negative test; a rep cannot read, edit, export, or enumerate others' orders by any route.
3. DOB: absent from DB plaintext, logs, exports, analytics, URLs, client cache; reveal audited every time; verified by automated greps and manual review.
4. Status history immutable at DB level; every status change has actor+time.
5. Audit events exist for every action listed in the brief's §14.
6. Duplicate engine: all six signals tested; overrides recorded.
7. Migrations reproducible from empty DB; PITR restore drill completed within RTO (≤ 4 h) / RPO (≤ 15 min).
8. MFA enforced for Admin/Manager; password policy active; rate limits verified.
9. Performance budgets met at 100k seeded orders; Core Web Vitals "good" on key screens.
10. WCAG 2.2 AA audit passed on Submit, Orders, Detail, Overview.
11. No secrets in repo (gitleaks clean); prod secrets scoped; Sentry scrubber verified with a PII test event.
12. Business sign-off on retention, status rules, protected-field cutoff, and who may see what.

---

## U. Testing Strategy
- **Unit (Vitest):** status machine, policy (`can()`), normalizers, formatters, duplicate scoring, crypto, metric calculators, CSV escaping.
- **Integration (Vitest + real Postgres):** each use-case incl. transaction rollback, concurrency (two simultaneous status changes), idempotency, RLS, trigger immutability, migrations up from scratch, reporting queries vs. golden dataset.
- **E2E (Playwright):** login+MFA, submit sale (desktop+mobile), duplicate flow, filter/sort/page, status change, bulk update, reveal DOB, export, admin user flows, offline-draft recovery; axe checks per page.
- **Authorization:** table-driven matrix test generating (role × action × resource-ownership) cases against the *server actions directly* (not through the UI); IDOR tests by swapping IDs; forbidden-field mass-assignment tests.
- **Security:** dependency audit (`pnpm audit`, Dependabot), gitleaks, CSP verification, header tests, SQLi/XSS fuzz on inputs, CSV-injection tests, rate-limit tests, session expiry/revocation tests, log-scrub test, annual external pen test.
- **Regression:** golden-metrics dataset; snapshot of status-transition table; visual regression (Playwright screenshots) on key screens; every production bug gets a test before fix.
- **CI gates:** typecheck, lint (`no-explicit-any`), unit+integration, E2E smoke on preview, migration dry-run.

---

## V. Deployment Checklist (production launch)
- [ ] Prod Supabase project created; PITR on; backups verified; network restrictions configured
- [ ] Prod KMS key + access role; rotation policy; key backup/recovery documented
- [ ] Vercel prod project; env vars set (scope = Production only); Preview ≠ prod secrets
- [ ] Domain, DNS, TLS, HSTS; email domain SPF/DKIM/DMARC
- [ ] Migrations applied via gated job; reference seeds run; **no demo/mock data present**
- [ ] First Admin created, MFA enrolled; break-glass admin documented
- [ ] Auth settings: signups disabled, invite-only, password policy, session lifetimes, MFA enforced
- [ ] RLS enabled on every table (verified by query), DB roles least-privilege
- [ ] Sentry live + scrubber verified; alerting to on-call channel
- [ ] Rate limiting live; WAF rules reviewed
- [ ] Security headers/CSP verified (securityheaders.com / test)
- [ ] gitleaks clean; no secrets in client bundle (`grep` build output for key patterns)
- [ ] Backup restore drill passed; runbooks written (incident, key rotation, user offboarding)
- [ ] UAT sign-off; acceptance criteria §T all green
- [ ] Data-handling/retention policy and rep acceptable-use agreement signed
- [ ] Rollback plan (Vercel instant rollback + DB migration reversibility notes)
- [ ] Staged rollout: pilot team → all reps; hypercare window

---

## W. Post-Launch Roadmap
- **V1 (MVP, in scope):** auth+MFA, users/reps/teams, manual order submission, orders table/detail, status model + history, overview dashboard, basic rep performance + leaderboard, duplicate detection, RBAC, audit log, DOB protection, exports (basic), exceptions queue.
- **V1.1:** CSV import adapter; saved-view sharing; notifications (Resend) for status changes/attention; documents/screenshots upload; install-date tracking UI; more reports; address-verification API.
- **V1.2:** Commission engine (rules, ledger, projected vs paid, payout periods, chargeback clawbacks); manager coaching views; fallout anomaly alerts.
- **V2:** Zoey adapter *if an official integration exists*; multi-provider/market rollout (additional programs); SSO/SAML; rollup tables/warehouse feed; mobile PWA enhancements/native app only if justified; customer-contact tooling.

**Explicitly WAIT:** Zoey integration, commissions, advanced reports, document uploads, automated install status, notifications, native mobile app.

---

## X. Risks / Open Questions (business decisions needed before coding)
1. **Rogers vs Xfinity / brand:** screenshots are a red Rogers partner portal; brief says Xfinity + purple. Which programs, which country, which brand hex + logo file?
2. **Legal/compliance:** are you permitted to store customer DOB outside Zoey/Xfinity's own systems? Check your **dealer/partner agreement** (data-handling, CPNI/PII clauses) and state privacy law; retention period; DOB crypto-erase timing; data-subject deletion handling. *Needs counsel — this is the largest risk.*
3. **Zoey:** any sanctioned export/API/feed? Until confirmed, manual double-entry is the cost (rep time + typo risk); mitigate with a fast form and Zoey order number field.
4. **Source of truth when Zoey and SalesOS disagree** (status/installed): who wins, who reconciles, how often?
5. **Reps' accounts:** employees vs contractors; BYOD phones OK? MFA burden acceptable?
6. **Protected-field edit cutoff** for reps (proposed: 30 min) and rep self-cancel allowed?
7. **Rep visibility:** may reps see leaderboard names? Customer data on their own orders beyond name/phone/address?
8. **Manager scope:** one team or many? Do managers see DOB (with reason) or Admin only?
9. **Time zone/business day** and week start; markets list; teams/managers org chart.
10. **Status definitions:** exact meanings of Processing/Pending/Scheduled/Installed/Activated in Zoey terms; what counts as "Activated" for activation rate; "mature" cohort window.
11. **Chargeback window** and commission plans (needed only for V1.2 but affects schema naming).
12. **Dealer logins:** how many, owned by whom, rotated how; confirm no passwords will be requested in-app.
13. **Duplicate policy:** what is truly blocked vs. warned; who is notified.
14. **Volumes:** expected orders/day for sizing; any historical data to backfill (adds CSV import earlier).
15. **Ownership:** who is the admin/on-call, who approves access, who owns the vendor accounts (use company-owned, not personal, accounts).
16. **Budget:** Supabase Pro, Vercel Pro, Sentry, Upstash, KMS ≈ low hundreds USD/month at this scale.

---

## BUILD READINESS CHECKLIST

**Approvals & decisions**
- [ ] Approve plan, incl. status model (stage + outcome + attention flag)
- [ ] Choose auth: **Supabase Auth** (recommended) / Clerk
- [ ] Confirm PostHog deferred
- [ ] Confirm programs/country (Xfinity-only? Rogers too?)
- [ ] Confirm org time zone, week start, markets list
- [ ] Define rep edit cutoff + self-cancel policy
- [ ] Define manager/rep visibility rules (DOB, leaderboard, customer PII)
- [ ] Define "Activated" and "mature cohort" window
- [ ] Decide DOB retention/erasure period
- [ ] Legal/partner-agreement review of storing DOB and customer PII
- [ ] Decide mandatory MFA scope (Admin/Manager now; Reps?)

**Brand & design assets**
- [ ] Logo (SVG, light + dark) and wordmark
- [ ] Brand purple hex (confirm `#6D3AF2` or supply actual)
- [ ] Preferred fonts if any (default Inter + JetBrains Mono)
- [ ] Any additional screenshots/reference screens you like (e.g., the dealer-dashboard layout you liked)

**Business information**
- [ ] List of reps (name, email, role, team, manager, market, start date)
- [ ] Teams, managers, markets
- [ ] Xfinity package catalog (names, categories, prices + effective dates) and add-on products
- [ ] Dealer login identifiers (usernames only) and who owns each
- [ ] Zoey order number format; any status vocabulary export
- [ ] Sample (anonymized) Zoey order screens/CSV to align fields
- [ ] Expected volume (orders/day) and any historical data to import
- [ ] Commission plan documents (for V1.2 planning)

**Accounts to create (company-owned)**
- [ ] GitHub org + repo `sales-os` (branch protection enabled)
- [ ] Supabase: local (CLI), staging project, prod project
- [ ] Vercel team (Pro) + project linked to GitHub
- [ ] AWS account for KMS (or GCP KMS) — prod key + staging key
- [ ] Sentry org + project
- [ ] Upstash Redis (staging + prod)
- [ ] Resend account + verified domain (Phase 6+)
- [ ] Domain/DNS access (e.g. `salesos.thesaleshouse.com`)
- [ ] Password manager vault for infra secrets

**Environment variables (per environment: local / staging / prod)**
- [ ] `APP_URL`
- [ ] `DATABASE_URL`, `DATABASE_DIRECT_URL`
- [ ] `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
- [ ] `AUTH_SECRET`
- [ ] `PII_KMS_KEY_ID` (+ `AWS_REGION`, role) for prod; `PII_ENCRYPTION_KEY` for local/staging
- [ ] `PII_BLIND_INDEX_KEY`
- [ ] `SENTRY_DSN`, `NEXT_PUBLIC_SENTRY_DSN`, `SENTRY_AUTH_TOKEN`
- [ ] `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`
- [ ] `RESEND_API_KEY` (later)
- [ ] `CRON_SECRET`, `EXPORT_SIGNING_SECRET`
- [ ] `WEBHOOK_SECRET` — *only when a webhook exists*
- [ ] Zoey keys — **do not create** unless an official API is issued

**Policies & operations**
- [ ] Data-handling & retention policy
- [ ] Rep acceptable-use / confidentiality acknowledgement
- [ ] Offboarding procedure (deactivate user, revoke sessions, rotate shared secrets)
- [ ] Incident-response contact + breach-notification process
- [ ] Named Admin(s) and break-glass procedure
- [ ] Backup/restore RTO/RPO sign-off

**To start Phase 0 specifically I only need:** plan approval · logo + purple hex (or permission to use the defaults) · answer on Rogers vs Xfinity naming in demo data · a Vercel account to host the preview (or I'll deliver a runnable repo).
