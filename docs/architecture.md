# FeatureLedger — Architecture

## Overview

FeatureLedger is a NestJS modular monolith. Each module owns its entities, services, and repositories. Modules communicate through injected services, not through database joins or shared repositories. Public interfaces between modules are explicit.

The system is designed so that adding a new billing model (e.g., usage-based billing) or a new entitlement strategy (e.g., concurrent seat tracking) requires changes in one module, not across the codebase.

---

## Module map

```
┌─────────────────────────────────────────────────────────────────────┐
│  API boundary (controllers, DTOs, guards)                            │
├──────────────┬─────────────┬──────────────┬──────────────────────── │
│  auth        │  users      │  organizations│  memberships            │
│  JWT/refresh │  password   │  slugs, roles │  invitations, seats     │
├──────────────┴─────────────┴──────────────┴─────────────────────────┤
│  catalog                                                             │
│  Features · Plans · Addons · PlanFeature · AddonFeature             │
├────────────────────────────────┬────────────────────────────────────┤
│  subscriptions                 │  entitlements                       │
│  Subscription · SubscriptionAddon  │  OrganizationEntitlement snapshot  │
│  OrganizationFeatureOverride   │  EntitlementResolver               │
├────────────────────────────────┼────────────────────────────────────┤
│  access                        │  usage                             │
│  AccessDecisionService         │  ApiKey · UsageEvent · UsageCounter │
│  access/check, access/simulate │  overage policies                  │
├────────────────────────────────┴────────────────────────────────────┤
│  webhooks                                                            │
│  WebhookEndpoint · OutboxEvent · WebhookDelivery · delivery worker  │
├─────────────────────────────────────────────────────────────────────┤
│  audit                                                               │
│  AuditLog (append-only, immutable)                                  │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Multi-tenancy

Shared-schema model. Every tenant-scoped table carries `organization_id`. Every query in a service method receives the resolved `organizationId` from the authenticated principal — never trusted from request body alone.

Guard flow for human users:
1. `JwtAuthGuard` → validates access token, populates `req.user`
2. `OrganizationMemberGuard` → verifies user has membership in the requested org
3. `RolesGuard` → checks minimum required role for the operation

Guard flow for API keys:
1. `ApiKeyAuthGuard` → validates key hash, loads scopes
2. Scope checks happen inline in the service or via `@RequireScopes()`

---

## Entitlement resolution

Entitlements are computed, not queried on every access check. When a subscription changes (create, upgrade, downgrade, addon added/removed) or an override is applied, the system runs the `EntitlementResolver` which:

1. Loads the active subscription and its plan
2. Loads all `PlanFeature` mappings for that plan
3. Loads all `SubscriptionAddon` entries and their `AddonFeature` mappings
4. Loads all `OrganizationFeatureOverride` entries for the org
5. Merges: plan features → addon features → overrides (overrides win)
6. Writes the result set to `organization_entitlements` (snapshot table)

Access checks then query only the snapshot table + current usage counter. No joins across catalog tables at check time.

---

## Usage metering

Usage events flow:

```
API key auth
  → validate payload
  → check idempotency (unique constraint on external_event_id + organization_id)
  → insert usage_events row
  → upsert usage_counters (atomic increment via UPDATE ... SET consumed = consumed + qty)
  → write audit log
  → insert outbox_events row
  (all in one transaction)
```

Idempotency is enforced at the database level — not application-level de-duplication. A second insert with the same `external_event_id` for the same org raises a unique constraint violation, which maps to `DUPLICATE_USAGE_EVENT`.

---

## Webhook delivery

Outbound webhooks use the outbox pattern:

1. Domain events (subscription changed, quota exceeded) write a row to `outbox_events` in the same transaction as the domain change
2. A background worker polls `outbox_events` for unprocessed rows
3. For each row, the worker finds matching `webhook_endpoints` for the org and event type
4. Worker signs the payload (HMAC-SHA256), POSTs to the endpoint, records result in `webhook_deliveries`
5. On failure: exponential backoff with a configurable retry limit
6. On max retries: marks endpoint as failed; stops retrying

This guarantees that if the domain write succeeds, the webhook eventually fires — no silent drops from race conditions or app crashes between domain write and HTTP dispatch.

---

## Access check flow

```
POST /organizations/:orgId/access/check { featureCode, quantity? }

1. Load entitlement snapshot for org + feature
   → if not found: deny (FEATURE_NOT_INCLUDED)
2. If feature has a quota:
   a. Load current usage counter for billing period
   b. Compute remaining = limit - consumed
   c. Check overage policy:
      - deny: block if consumed + qty > limit
      - soft_limit: allow but flag
      - allow_and_flag: always allow, record overage
3. Check seat limit (for seat-counted features):
   a. Count current members in org
   b. Block if at limit
4. Return: { allowed, reason, limit, consumed, remaining }
```

The simulation endpoint (`access/simulate`) runs the same logic against a hypothetical plan configuration without touching persistent state. Used for plan-change previews.

---

## Database design principles

- `synchronize: false` always
- All migrations committed to source control as TypeORM migration files
- Seed data in separate scripts, never in migrations
- Explicit indexes on all foreign keys, filter columns, and background job polling queries
- Partial unique index: at most one active subscription per organization
- Unique constraint: one membership per (organization_id, user_id)
- Unique constraint: one usage event per (organization_id, external_event_id)
- Unique constraint: one counter per (organization_id, feature_id, period_start, period_end)
- Append-only: `usage_events`, `audit_logs`, `webhook_deliveries`

---

## Response envelope

All responses share a consistent shape. Controllers return data only; the `ResponseInterceptor` wraps success, the `HttpExceptionFilter` wraps errors.

Success:
```json
{
  "success": true,
  "data": { ... },
  "meta": { "requestId": "req_abc123" }
}
```

Error:
```json
{
  "success": false,
  "error": {
    "code": "QUOTA_EXCEEDED",
    "message": "Monthly export quota exceeded",
    "details": { "featureCode": "report_exports", "limit": 5000, "consumed": 5000 }
  },
  "meta": { "requestId": "req_abc123" }
}
```

---

## Logging vs audit

**Application logs** (`nestjs-pino`) are for operators: request traces, errors, background job status. They are structured JSON, shipped to a log aggregator, and may be rotated or purged.

**Audit logs** (`audit_logs` table) are for business and security history: who changed what, when, on which org. They are append-only, never deleted, and queryable through the API.

These are separate concerns and must not be conflated.

---

## Observability

**Current state:** Structured JSON logs via `nestjs-pino`. Sensitive fields (authorization headers, passwords, refresh tokens) are redacted at the transport layer. Health endpoints at `/health/live` and `/health/ready` for load balancer probes.

**Missing and planned:**

Structured logs answer "what happened". They do not give continuous signal on how the system behaves under load. The following metrics are the highest-value signals for this system and should be added when the corresponding endpoints exist:

- Request duration histogram on `POST /access/check` — this is on the hot path of every feature gate in downstream systems
- Usage ingestion rate and duplicate event rate — signals pricing model health
- Webhook delivery success rate and retry queue depth — the outbox pattern is only useful if delivery is observable
- Refresh token reuse detection rate — baseline for detecting credential theft attempts

The planned direction is a `/metrics` endpoint in Prometheus format via `prom-client`. Label cardinality must be controlled — per-tenant or per-feature labels on high-volume metrics will cause metric explosion.

See [engineering-backlog.md](engineering-backlog.md#3-metrics-export-to-prometheus) for full analysis.

---

## Scale assumptions

The current architecture makes the following explicit assumptions. They are correct for the current deployment stage and must be revisited when they no longer hold.

| Assumption | What breaks if violated |
|---|---|
| Single API instance (or stateless replicas behind a load balancer with shared DB) | In-memory rate limit counters are process-local. Throttling becomes ineffective with multiple instances. |
| Single PostgreSQL primary for all writes | Usage counter increments, idempotency checks, and refresh token operations all require a single write source of truth. |
| Single region | Usage counter correctness and idempotency enforcement depend on a single database. Cross-region writes require a coordination strategy. |
| Background poller runs in the same process as the API | Correct for moderate webhook volume. Poller contention affects API throughput at high load. |
| No shared revocation state needed | Token family revocation is handled in PostgreSQL. Fast enough at current scale; may need Redis blocklist at higher request volumes. |

These assumptions are intentional. The architecture avoids blocking any of them — module boundaries are clean enough that each can be addressed independently.

---

## Deployment model

**Current:** Single NestJS process, single PostgreSQL instance, Docker Compose for local development.

**Near-term (planned):**
- Dockerfile + Compose already in place
- Migrations run as a separate step before the application starts
- Health endpoints ready for container orchestrator liveness and readiness probes

**Future evolution:**

When webhook volume warrants it, the outbox poller can be extracted to a separate worker process with minimal code changes. The main application module already isolates the webhook/outbox concern. A `start:worker` entry point would boot only the outbox and webhook modules with no HTTP server.

When horizontal scaling of the API is needed, the stateless design (no in-process session state, no sticky sessions required) means instances can be added behind a load balancer. The only required change is replacing in-memory throttle storage with a shared Redis store.

No other major deployment changes are required until multi-region or very high throughput becomes a requirement.

See [engineering-backlog.md](engineering-backlog.md) for the full analysis of each evolution step.
