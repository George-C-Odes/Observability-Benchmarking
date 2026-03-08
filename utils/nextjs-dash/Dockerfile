# syntax=docker/dockerfile:1.7
ARG IMAGE_DEPS=node:25.8.0-alpine3.23
ARG IMAGE_BUILDER=node:25.8.0-alpine3.23
ARG IMAGE_RUNTIME=node:25.8.0-alpine3.23
#ARG IMAGE_DEPS=node:25.8.0-bookworm-slim
#ARG IMAGE_BUILDER=node:25.8.0-bookworm-slim
#ARG IMAGE_RUNTIME=node:25.8.0-bookworm-slim

# ------------ DEPS STAGE -----------------------
# Installs ALL dependencies (prod + dev) for build & test.
FROM ${IMAGE_DEPS} AS deps
WORKDIR /app

# Copy only package manifests first for maximum layer-cache reuse.
# This layer is invalidated ONLY when dependencies change.
COPY package.json package-lock.json ./

# --prefer-offline:  use cached tarballs when available
# --no-audit/--fund: skip non-essential network calls
RUN --mount=type=cache,target=/root/.npm,sharing=locked \
  npm ci --prefer-offline --no-audit --fund=false

# ------------ QUALITY GATE STAGE ----------------
# Runs lint + typecheck + tests.  Gated: build won't proceed if this fails.
# Enforced quality gate: the builder stage depends on this and cannot skip it.
FROM ${IMAGE_BUILDER} AS quality
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

ENV NEXT_TELEMETRY_DISABLED=1

# Lint, typecheck, and test in a single RUN to share a layer.
# The build machine has 16 cores — use them.
# A sentinel file is written on success so the builder stage can depend on it.
RUN npx eslint . --max-warnings=0 && \
    npx tsc --noEmit && \
    npx vitest run -c vitest.config.node.ts --maxWorkers=12 && \
    npx vitest run -c vitest.config.dom.ts  --maxWorkers=12 && \
    touch /tmp/.quality-ok

# ------------ BUILD STAGE -----------------------
# Produces the Next.js standalone output.
# The COPY from quality creates a build-graph dependency edge so BuildKit
# will ALWAYS execute the quality stage before reaching the build.
FROM ${IMAGE_BUILDER} AS builder
WORKDIR /app
COPY --from=quality /tmp/.quality-ok /tmp/.quality-ok
COPY --from=deps /app/node_modules ./node_modules

# Copy config files first (changes rarely → good cache hit rate)
COPY package.json next.config.ts tsconfig.json ./

# Copy source (changes often → only this layer + build invalidated).
COPY app ./app
COPY lib ./lib
COPY public ./public

# Remove test files from the builder so they don't bloat the standalone output
# and test-only edits don't affect the next build's trace cache.
RUN find app lib -type f \( -name '*.test.ts' -o -name '*.test.tsx' \) -delete

ENV NEXT_TELEMETRY_DISABLED=1
# Give Next.js more heap headroom on 16-core builders
ENV NODE_OPTIONS="--max-old-space-size=4096"

# Cache both the Next.js incremental build cache and the webpack cache
RUN --mount=type=cache,target=/app/.next/cache \
  npm run build

# ------------ RUNTIME STAGE ---------------------
FROM ${IMAGE_RUNTIME} AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3001
ENV HOSTNAME=0.0.0.0
ENV NEXT_TELEMETRY_DISABLED=1
EXPOSE 3001

# Create a dedicated non-root user with a fixed UID/GID (Alpine uses addgroup/adduser)
RUN addgroup -g 1001 -S nodejs && adduser -S -D -H -u 1001 -G nodejs nodejs

## Create a dedicated non-root user with a fixed UID/GID (bookworm - plays well with Kubernetes etc.)
#RUN groupadd -g 1001 nodejs && useradd -u 1001 -g nodejs -m nodejs

# Copy as the runtime user to avoid permission surprises
COPY --chown=nodejs:nodejs --from=builder /app/public ./public
COPY --chown=nodejs:nodejs --from=builder /app/.next/standalone ./
COPY --chown=nodejs:nodejs --from=builder /app/.next/static ./.next/static

# Make common writable paths exist (supports running with read-only rootfs + tmpfs mounts)
RUN mkdir -p /app/.next/cache /tmp && chown -R nodejs:nodejs /app /tmp

USER nodejs

HEALTHCHECK --interval=30s --timeout=3s --start-period=60s --retries=5 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3001)+'/').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server.js"]