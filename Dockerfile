# ── build ─────────────────────────────────────────────────────
FROM oven/bun:1.3 AS build
WORKDIR /app
COPY package.json ./
COPY bun.lock* ./
RUN bun install --frozen-lockfile || bun install
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN bunx prisma generate
RUN bun run build

# ── runtime (plain Node — maximum compatibility for the standalone server) ──
FROM node:22-slim
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0 \
    DATABASE_URL=file:/app/db/custom.db
EXPOSE 3000 2775

HEALTHCHECK --interval=30s --timeout=10s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/login').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

# standalone server incl. traced node_modules (prisma client, bcryptjs, …)
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/public ./public
# pristine schema template kept OUTSIDE /app/db so a volume can shadow db/
COPY --from=build /app/db/schema.db /app/db-template/schema.db

# first boot: create the live db from the template, then serve;
# instrumentation seeds settings + admin in the background and starts the SMPP gateway on :2775
CMD ["sh", "-c", "mkdir -p /app/db; if [ ! -f /app/db/custom.db ]; then echo '[entry] first boot — creating db from template'; cp /app/db-template/schema.db /app/db/custom.db; fi; exec node /app/server.js"]
