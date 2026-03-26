# FeatureLedger

**FeatureLedger** is a multi-tenant entitlement and usage metering service for SaaS products. It centralizes subscription-driven feature access, seat limits, usage quotas, customer-specific overrides, and audit-ready access decisions so teams can stop scattering monetization logic across the codebase.

---

## Why this exists

Monetization logic has a way of leaking everywhere. Plan checks in middleware, quota logic in controllers, seat limits in different services — none of it consistent, none of it auditable.

FeatureLedger treats entitlement resolution as a first-class platform concern:
- One place to ask "can org X use feature Y right now?"
- One place to meter usage and enforce quotas
- One place to record why access was granted or denied
- One place to trigger downstream systems when subscriptions change

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        API Layer                             │
│  Controllers (thin) → Application Services → Domain Logic   │
├──────────────────────────┬──────────────────────────────────┤
│   Identity & Tenancy     │   Catalog & Monetization          │
│   users, orgs,           │   features, plans, addons,        │
│   memberships, auth      │   plan-feature mappings           │
├──────────────────────────┼──────────────────────────────────┤
│   Subscriptions &        │   Usage Metering                  │
│   Entitlements           │   api-keys, usage events,         │
│   subscriptions, snap-   │   counters, overage policy        │
│   shots, overrides,      │                                   │
│   access checks          │                                   │
├──────────────────────────┴──────────────────────────────────┤
│   Operational Depth                                          │
│   audit logs, outbox events, webhooks, retry worker         │
└─────────────────────────────────────────────────────────────┘
```

See [docs/architecture.md](docs/architecture.md) for the full design narrative.

**Stack:** NestJS · TypeScript (strict) · PostgreSQL · TypeORM · Docker · Swagger

**Multi-tenancy:** Shared schema, `organization_id` on all tenant tables. Every read/write enforces org scope beyond route params.

**Auth:** JWT access tokens (15m) + rotating refresh tokens (30d) with reuse detection. API keys for machine-to-machine usage ingestion (hashed, scoped).

---

## Quick start

### Prerequisites
- Node 22+
- Docker + Docker Compose

### 1. Clone and install

```bash
git clone https://github.com/you/feature-ledger.git
cd feature-ledger
npm install
```

### 2. Configure environment

```bash
cp .env.example .env
# Edit .env — set DB credentials and generate JWT secrets:
# node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

### 3. Start the database

```bash
docker compose up postgres -d
```

### 4. Run migrations

```bash
npm run migration:run
```

### 5. Seed demo data

```bash
npm run seed
```

### 6. Start the dev server

```bash
npm run start:dev
```

API: `http://localhost:3000/api/v1`
Swagger: `http://localhost:3000/docs`

---

## Running with Docker Compose (full stack)

```bash
docker compose up --build
```

---

## Scripts

| Script | Description |
|---|---|
| `npm run start:dev` | Dev server with hot reload |
| `npm run build` | Compile TypeScript |
| `npm run test` | Unit tests |
| `npm run test:cov` | Unit tests with coverage |
| `npm run test:e2e` | E2E tests against test DB |
| `npm run test:integration` | Integration tests against test DB |
| `npm run lint` | ESLint with auto-fix |
| `npm run migration:run` | Apply pending migrations |
| `npm run migration:revert` | Revert last migration |
| `npm run migration:generate -- src/database/migrations/MyMigration` | Generate migration from entity diff |
| `npm run seed` | Load demo seed data |

---

## Implemented modules

| Module | Status | Description |
|---|---|---|
| Auth | Done | JWT login, refresh token rotation, reuse detection |
| Users | Done | User accounts with hashed passwords |
| Organizations | Done | Multi-tenant orgs with slug derivation |
| Memberships | Done | Role-based org membership, invitations |
| Catalog | Done | Features, plans, addons, and feature mappings |
| Subscriptions | Planned | Org-to-plan subscriptions |
| Entitlements | Planned | Access checks, snapshots, overrides |
| Usage | Planned | Usage event ingestion, counters, summaries |
| API Keys | Planned | Machine-to-machine key management |
| Webhooks | Planned | Outbox-backed event delivery |
| Audit | Planned | Immutable audit log |

---

## Catalog domain

The catalog is platform-owned — only platform admins can write to it. It defines what can be sold before any tenant subscribes.

**Feature** — one measurable or access-controlled capability. `code` is a stable lowercase identifier (e.g. `api-calls`, `seats`). It is normalized on create and cannot be changed safely after integrations depend on it.

**Plan** — a named bundle of features. `slug` is derived from `name` at creation (e.g. `"Pro Plan"` → `"pro-plan"`). Plans can be deactivated to stop new subscriptions without losing historical data.

**PlanFeature** — links a plan to a feature with a limit and overage rule.

**Addon** — an optional feature bundle a tenant can add on top of a base plan. `slug` is derived the same way as plans.

**AddonFeature** — links an addon to a feature with a limit and overage rule.

### MeterType

| Value | Meaning |
|---|---|
| `boolean` | Gated on/off access (e.g. SSO enabled) |
| `quantity` | Countable discrete units (e.g. number of reports) |
| `seats` | User slots (e.g. team members) |
| `storage` | Byte-based storage (e.g. file storage) |
| `usage` | High-frequency event metering (e.g. API calls) |

### OveragePolicy

| Value | Behavior |
|---|---|
| `deny` | Block usage above the limit (default) |
| `soft_limit` | Allow usage and send a warning |
| `allow_and_flag` | Allow usage and flag for billing review |

### Business rules

- Feature `code` is normalized to lowercase on create (`API_Calls` → `api_calls`). Underscores are kept.
- Plan and addon slugs are derived from `name`. They cannot be changed after creation.
- Duplicate codes and duplicate slugs are rejected with a `409 RESOURCE_CONFLICT` error.
- The same feature can only be assigned to a plan or addon once.
- `includedLimit: null` means unlimited — no quota enforcement for that mapping.
- `overagePolicy` defaults to `deny` when not provided.
- Deleting a plan or addon also deletes its feature mappings (CASCADE).
- Deleting a feature is blocked if it is assigned to any plan or addon (RESTRICT).

---

## Authorization

All requests require a valid JWT access token (`Authorization: Bearer <token>`).

**`JwtAuthGuard`** — verifies the token and sets `req.user`. Routes marked `@Public()` skip this guard.

**`OrganizationMemberGuard`** — checks that the caller is a member of the org in the route params. Attaches `req.membership`.

**`RolesGuard`** — checks minimum role weight: `owner(50) > admin(40) > billing(30) > analyst(20) > integration(10)`.

**`PlatformAdminGuard`** — checks `req.user.isPlatformAdmin`. Used on all catalog write routes. Platform admins bypass org and role guards.

---

## Migrations

Two migrations exist:

| File | Tables |
|---|---|
| `1700000000001-InitialAuthAndTenancy` | `users`, `organizations`, `memberships`, `invitations`, `refresh_tokens` |
| `1700000000002-CatalogTables` | `features`, `plans`, `plan_features`, `addons`, `addon_features` |

Schema changes go through TypeORM migrations — `synchronize: false` everywhere, including development. This forces every schema change to be committed as a reviewed migration file, preventing surprises in production.

```bash
# Generate a migration after modifying entity files
npm run migration:generate -- src/database/migrations/AddFeatureFlag

# Apply all pending migrations
npm run migration:run

# Revert the last migration
npm run migration:revert
```

---

## API overview

All routes live under `/api/v1`. See [docs/api-examples.md](docs/api-examples.md) for full request/response examples.

Catalog routes require a platform admin JWT. All other authenticated routes require a regular user JWT.

| Domain | Key endpoints | Status |
|---|---|---|
| Auth | `POST /auth/login`, `POST /auth/refresh`, `POST /auth/logout` | Done |
| Organizations | `POST /organizations`, `GET /organizations/:id/members` | Done |
| Catalog — Features | `GET/POST /catalog/features`, `GET/PATCH/DELETE /catalog/features/:id` | Done |
| Catalog — Plans | `GET/POST /catalog/plans`, `GET/PATCH/DELETE /catalog/plans/:id` | Done |
| Catalog — Plan features | `POST /catalog/plans/:id/features`, `GET /catalog/plans/:id/features`, `DELETE /catalog/plans/:id/features/:featureId` | Done |
| Catalog — Addons | `GET/POST /catalog/addons`, `GET/PATCH/DELETE /catalog/addons/:id` | Done |
| Catalog — Addon features | `POST /catalog/addons/:id/features`, `GET /catalog/addons/:id/features`, `DELETE /catalog/addons/:id/features/:featureId` | Done |
| Subscriptions | `POST /organizations/:id/subscriptions` | Planned |
| Entitlements | `GET /organizations/:id/entitlements`, `POST /organizations/:id/access/check` | Planned |
| Usage | `POST /organizations/:id/usage/events`, `GET /organizations/:id/usage/summary` | Planned |
| API Keys | `POST /organizations/:id/api-keys` | Planned |
| Webhooks | `POST /organizations/:id/webhooks` | Planned |
| Audit | `GET /organizations/:id/audit-logs` | Planned |
| Health | `GET /health/live`, `GET /health/ready` | Done |

---

## Testing

**Current status: 6 suites · 56 unit tests · BUILD OK · LINT OK**

Unit tests cover the risk-heavy domain logic in each implemented module:

| Test file | What it covers |
|---|---|
| `auth.service.spec.ts` | Login, refresh rotation, reuse detection, family revocation, logout |
| `organization-member.guard.spec.ts` | Membership check, platform admin bypass |
| `organizations.service.spec.ts` | Slug normalization (7 cases), slug conflict detection |
| `membership-role.enum.spec.ts` | Role hierarchy ordering |
| `http-exception.filter.spec.ts` | Error response shaping |
| `catalog.service.spec.ts` | Code normalization, slug derivation, duplicate code/slug/mapping rejection, not-found propagation, default overage policy |

Integration and E2E test configs exist (`test/jest-integration.json`, `test/jest-e2e.json`) but test files are not yet written. These will be added in later phases.

Coverage is prioritized on risk-heavy business logic, not chased to 100%.

---

## Design tradeoffs

| Decision | Why |
|---|---|
| Modular monolith over microservices | Avoids distributed system complexity at this scale. Clear module boundaries make a future split possible without re-architecting. See [ADR-0001](docs/adr/0001-modular-monolith.md). |
| Shared-schema multi-tenancy | Simpler operationally than database-per-tenant. Tenant isolation enforced in application layer. See [ADR-0002](docs/adr/0002-shared-schema-multitenancy.md). |
| Outbox pattern for webhooks | Delivery reliability without distributed transactions. See [ADR-0003](docs/adr/0003-outbox-for-webhooks.md). |
| Snapshot table for entitlements | Fast O(1) access checks without joining plan/addon/override tables on every request. |
| Idempotency key on usage events | Prevents double-counting on retried ingestion — enforced at DB level with a unique constraint. |
| Argon2 for passwords | Memory-hard, resistant to GPU-based attacks. No raw bcrypt. |
| No `synchronize: true` | Ever. Schema changes are explicit, reviewed, and reversible. |

---

## Future work

- Redis for distributed throttling and refresh token revocation lists
- Testcontainers for hermetic integration tests (no external DB required)
- Metrics export to Prometheus
- Background worker process separation (outbox poller)
- Plan upgrade/downgrade proration logic
- Multi-region considerations for usage counters
