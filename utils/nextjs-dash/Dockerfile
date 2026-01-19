# syntax=docker/dockerfile:1.7
ARG IMAGE_DEPS=node:25.3.0-alpine3.23
ARG IMAGE_BUILDER=node:25.3.0-alpine3.23
ARG IMAGE_RUNTIME=node:25.3.0-alpine3.23
#ARG IMAGE_DEPS=node:25.3.0-bookworm-slim
#ARG IMAGE_BUILDER=node:25.3.0-bookworm-slim
#ARG IMAGE_RUNTIME=node:25.3.0-bookworm-slim
# ------------ DEPS STAGE -----------------------
FROM ${IMAGE_DEPS} AS deps
WORKDIR /app

COPY package.json package-lock.json ./

# Faster repeat builds + deterministic installs
RUN --mount=type=cache,target=/root/.npm \
  npm ci --no-audit --fund=false

# ------------ BUILD STAGE -----------------------
FROM ${IMAGE_BUILDER} AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

ENV NEXT_TELEMETRY_DISABLED=1

# Speed up rebuilds by caching Next's build cache
RUN --mount=type=cache,target=/app/.next/cache \
  npm run build

# Ensure /public exists so the runtime COPY never fails
RUN mkdir -p /app/public

#-----------------------  RUNTIME STAGE -----------------------
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