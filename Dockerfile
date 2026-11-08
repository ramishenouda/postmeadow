# syntax=docker/dockerfile:1
# Production image for Postmeadow. Built by GitHub Actions (.github/workflows/deploy.yml)
# and run on the server with deploy/docker-compose.yml.

FROM node:24-bookworm-slim AS base
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

# ─── Dependencies ────────────────────────────────────────────────────────────
FROM base AS deps
COPY package.json package-lock.json ./
RUN npm ci

# ─── Build ───────────────────────────────────────────────────────────────────
FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Placeholders, only for this command, so environment validation passes while building.
# Nothing secret is baked in; the real values come from the server's .env at runtime.
RUN NEXT_OUTPUT=standalone \
    APP_URL=http://build.invalid \
    DATABASE_URL=postgres://build:build@build.invalid:5432/build \
    BETTER_AUTH_SECRET=build-time-placeholder-never-used-at-runtime \
    EMAIL_FROM="Postmeadow <build@build.invalid>" \
    npx next build

# ─── Runtime ─────────────────────────────────────────────────────────────────
FROM base AS runner
ENV NODE_ENV=production \
    PORT=3000 \
    HOSTNAME=0.0.0.0 \
    STORAGE_DIR=/data/storage

# The standalone server plus the assets it doesn't copy by itself.
COPY --from=build --chown=node:node /app/.next/standalone ./
COPY --from=build --chown=node:node /app/.next/static ./.next/static
COPY --from=build --chown=node:node /app/public ./public

# Database migrations: run with `node migrate.mjs` (see deploy/docker-compose.yml).
# The standalone output only contains the parts of drizzle-orm the app uses, so copy the
# full (dependency-free) packages the migrator needs.
COPY --from=build --chown=node:node /app/drizzle ./drizzle
COPY --from=deps --chown=node:node /app/node_modules/drizzle-orm ./node_modules/drizzle-orm
COPY --from=deps --chown=node:node /app/node_modules/postgres ./node_modules/postgres
COPY --chown=node:node scripts/migrate.mjs ./migrate.mjs

# Uploads live on a volume mounted here.
RUN mkdir -p /data/storage && chown -R node:node /data
USER node

EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "server.js"]
