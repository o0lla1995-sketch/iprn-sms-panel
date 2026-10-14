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

# ── runtime ────────────────────────────────────────────────────
FROM oven/bun:1.3
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    DATABASE_URL=file:/app/db/custom.db
EXPOSE 3000 2775

# standalone server (includes traced node_modules incl. @prisma/client & bcryptjs)
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/public ./public
# pristine schema template for first boot (volume holds the live db afterwards)
COPY --from=build /app/db/schema.db /app/db/schema.db

# first boot: create the live db from the template, then start
# (instrumentation seeds settings + admin and starts the SMPP gateway on :2775)
CMD ["sh", "-c", "if [ ! -f /app/db/custom.db ]; then echo '[entry] first boot — creating db from template'; cp /app/db/schema.db /app/db/custom.db; fi; exec bun /app/server.js"]
