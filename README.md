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

## Migrations

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

| Domain | Key endpoints |
|---|---|
| Auth | `POST /auth/login`, `POST /auth/refresh`, `POST /auth/logout` |
| Organizations | `POST /organizations`, `GET /organizations/:id/members` |
| Catalog | `POST /features`, `POST /plans`, `POST /addons` |
| Subscriptions | `POST /organizations/:id/subscriptions` |
| Entitlements | `GET /organizations/:id/entitlements`, `POST /organizations/:id/access/check` |
| Usage | `POST /organizations/:id/usage/events`, `GET /organizations/:id/usage/summary` |
| API Keys | `POST /organizations/:id/api-keys` |
| Webhooks | `POST /organizations/:id/webhooks` |
| Audit | `GET /organizations/:id/audit-logs` |
| Health | `GET /health/live`, `GET /health/ready` |

---

## Testing approach

**Unit tests** cover pure domain logic: entitlement resolver, access decision, overage policies, refresh token reuse detection, webhook signing.

**Integration tests** run against a real PostgreSQL instance to verify repository behavior, transaction flows, and unique constraint enforcement.

**E2E tests** exercise full HTTP flows: login/refresh rotation, access checks, usage ingestion idempotency, quota enforcement, subscription changes, webhook retries.

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
