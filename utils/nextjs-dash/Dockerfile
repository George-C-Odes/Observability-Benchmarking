# syntax=docker/dockerfile:1.7
ARG IMAGE_DEPS=node:25.9.0-alpine3.23
ARG IMAGE_RUNTIME=node:25.9.0-alpine3.23
ARG NPM_VERSION=11.12.1
#ARG IMAGE_DEPS=node:25.9.0-bookworm-slim
#ARG IMAGE_RUNTIME=node:25.9.0-bookworm-slim

# ------------ DEPS STAGE -----------------------
# Installs ALL dependencies (prod + dev) for build & test.
FROM ${IMAGE_DEPS} AS deps
WORKDIR /app

# Pin npm before any install step so the container build matches packageManager.
RUN npm install -g npm@${NPM_VERSION}

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
FROM deps AS quality
COPY --link . .

ENV NEXT_TELEMETRY_DISABLED=1
ENV PATH=/app/node_modules/.bin:$PATH

# Lint, typecheck, and test in a single RUN to share a layer.
# The build machine has 16 cores — use them.
# A sentinel file is written on success so the builder stage can depend on it.
RUN eslint . --max-warnings=0 && \
    tsc --noEmit && \
    vitest run -c vitest.config.node.ts --maxWorkers=12 && \
    vitest run -c vitest.config.dom.ts  --maxWorkers=12 && \
    touch /tmp/.quality-ok

# ------------ BUILD STAGE -----------------------
# Produces the Next.js standalone output.
# The COPY from quality creates a build-graph dependency edge so BuildKit
# will ALWAYS execute the quality stage before reaching the build.
FROM deps AS builder
COPY --from=quality /tmp/.quality-ok /tmp/.quality-ok

# Copy config files first (changes rarely → good cache hit rate)
COPY --link package.json next.config.ts tsconfig.json ./

# Source (changes often → only this layer + build invalidated).
COPY --link app ./app
COPY --link lib ./lib
COPY --link public ./public

# Test files live under __tests__/ (not COPY'd here), so no cleanup needed.

ENV NEXT_TELEMETRY_DISABLED=1
ENV PATH=/app/node_modules/.bin:$PATH
# Give Next.js more heap headroom on 16-core builders
ENV NODE_OPTIONS="--max-old-space-size=4096"

# Cache both the Next.js incremental build cache and the webpack cache
RUN --mount=type=cache,target=/app/.next/cache \
  next build

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
COPY --link --chown=1001:1001 --from=builder /app/public ./public
COPY --link --chown=1001:1001 --from=builder /app/.next/standalone ./
COPY --link --chown=1001:1001 --from=builder /app/.next/static ./.next/static

# Make common writable paths exist (supports running with read-only rootfs + tmpfs mounts)
RUN mkdir -p /app/.next/cache /tmp && chown -R nodejs:nodejs /app /tmp

USER nodejs

HEALTHCHECK --interval=30s --timeout=3s --start-period=60s --retries=5 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3001)+'/').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server.js"]