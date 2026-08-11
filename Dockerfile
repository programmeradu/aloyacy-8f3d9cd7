# Aloya web app — production image.
#
# Multi-stage: dependencies and build run on the full Bun image, the runtime
# stage ships only the built server bundle and its production dependencies.

# ---------- deps ----------
FROM oven/bun:1.3-slim AS deps
WORKDIR /app
# Bun is the only supported package manager; bun.lock is committed, so the
# install is strictly frozen — a drifted lockfile must fail the build, not
# silently resolve fresh versions.
COPY package.json bun.lock ./
COPY packages/core/package.json packages/core/package.json
RUN bun install --frozen-lockfile

# ---------- build ----------
FROM oven/bun:1.3-slim AS build
WORKDIR /app
ENV NODE_ENV=production
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN bun run build

# ---------- runtime ----------
FROM oven/bun:1.3-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=8080

# Never run the server as root.
RUN groupadd --system --gid 1001 aloya \
  && useradd --system --uid 1001 --gid aloya aloya

COPY --from=build --chown=aloya:aloya /app/.output ./.output
COPY --from=build --chown=aloya:aloya /app/package.json ./package.json

USER aloya
EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD bun -e "fetch('http://127.0.0.1:'+(process.env.PORT||8080)+'/api/public/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["bun", "run", ".output/server/index.mjs"]
