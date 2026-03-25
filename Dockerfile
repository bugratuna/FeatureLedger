# syntax=docker/dockerfile:1

# ─── Base ────────────────────────────────────────────────────────────────────
FROM node:22-alpine AS base
WORKDIR /app
# Only copy manifests first so dependency layer is cached independently of source changes
COPY package*.json ./

# ─── Dependencies ─────────────────────────────────────────────────────────────
FROM base AS deps
RUN npm ci --omit=dev

# ─── Build ────────────────────────────────────────────────────────────────────
FROM base AS builder
# Install all deps including devDependencies for the build step
RUN npm ci
COPY . .
RUN npm run build

# ─── Production image ─────────────────────────────────────────────────────────
FROM node:22-alpine AS production
WORKDIR /app

# Non-root user for least-privilege execution
RUN addgroup -S appgroup && adduser -S appuser -G appgroup

COPY --from=deps /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY package*.json ./

# Migrations are run as a separate step in CI/CD, not at container startup.
# If you want the container to auto-migrate on start, uncomment the CMD below.
# COPY src/database/migrations ./dist/database/migrations

USER appuser

EXPOSE 3000

ENV NODE_ENV=production

CMD ["node", "dist/main"]
