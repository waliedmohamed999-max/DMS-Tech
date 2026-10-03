# DMS Tech Business OS — production image (Phase 12, docs/PRODUCTION-ARCHITECTURE.md).
# ONE image, two processes:   web    → default CMD (next start, PORT=3000)
#                              worker → docker run … node node_modules/tsx/dist/cli.mjs scripts/worker.ts --loop
# No secrets are baked in: every setting comes from the platform's secret manager / environment at run time.
# Build with `npm run build` (NOT `next build`): postbuild writes the public-site CSP hash manifest (.next/csp-public.json).

FROM node:24-bookworm-slim AS build
# openssl: Prisma's schema engine (migrate deploy) needs libssl; ca-certificates: TLS to managed services
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY package.json package-lock.json ./
COPY prisma ./prisma
COPY prisma.config.ts ./
# placeholder only so `prisma generate` (postinstall) can load the config — never used to connect
RUN DATABASE_URL="postgresql://build:build@127.0.0.1:1/build" npm ci --no-audit --no-fund
COPY . .
RUN DATABASE_URL="postgresql://build:build@127.0.0.1:1/build" npm run build

FROM node:24-bookworm-slim AS runtime
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000
# the worker and the operational scripts (db:deploy, os:bootstrap, backups, go-live:check) run from source with tsx,
# so the full dependency tree and sources ship with the build output
COPY --from=build --chown=node:node /app /app
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
# exec form: next receives SIGTERM directly (graceful shutdown); the worker handles SIGTERM itself
CMD ["node", "node_modules/next/dist/bin/next", "start"]
