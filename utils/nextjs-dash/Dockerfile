# syntax=docker/dockerfile:1.7
ARG IMAGE_DEPS=node:25.2.1-bookworm-slim
ARG IMAGE_BUILDER=node:25.2.1-bookworm-slim
ARG IMAGE_RUNTIME=node:25.2.1-bookworm-slim
# ------------ DEPS STAGE -----------------------
FROM ${IMAGE_DEPS} AS deps
WORKDIR /app

COPY package.json package-lock.json ./

# Faster repeat builds + deterministic installs
RUN --mount=type=cache,target=/root/.npm \
    npm i -g npm@11.7.0 && npm ci --no-audit --fund=false

# ------------ BUILD STAGE -----------------------
FROM ${IMAGE_BUILDER} AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

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

RUN apt-get update && apt-get install -y --no-install-recommends \
  curl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

RUN groupadd -g 1001 nodejs && useradd -u 1001 -g nodejs -m nodejs

# Copy as the runtime user to avoid permission surprises
COPY --chown=nodejs:nodejs --from=builder /app/public ./public
COPY --chown=nodejs:nodejs --from=builder /app/.next/standalone ./
COPY --chown=nodejs:nodejs --from=builder /app/.next/static ./.next/static

# Give Next a writable cache dir (safe default)
RUN mkdir -p /app/.next/cache && chown -R nodejs:nodejs /app/.next

USER nodejs

HEALTHCHECK --interval=30s --timeout=3s --start-period=60s --retries=5 \
  CMD curl -fsS "http://127.0.0.1:${PORT}/" >/dev/null || exit 1

CMD ["node", "server.js"]