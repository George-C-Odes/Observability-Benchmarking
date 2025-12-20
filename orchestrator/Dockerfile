FROM node:25.2-slim

# Install Docker CLI + Compose plugin (client-side only). The Docker daemon stays on the host via /var/run/docker.sock
RUN apt-get update \
 && apt-get install -y --no-install-recommends ca-certificates curl gnupg lsb-release tini wget \
 && install -m 0755 -d /etc/apt/keyrings \
 && curl -fsSL https://download.docker.com/linux/debian/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg \
 && chmod a+r /etc/apt/keyrings/docker.gpg \
 && echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/debian $(. /etc/os-release && echo $VERSION_CODENAME) stable" > /etc/apt/sources.list.d/docker.list \
 && apt-get update \
 && apt-get install -y --no-install-recommends docker-ce-cli docker-compose-plugin \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci --omit=dev

COPY src ./src

ENV NODE_ENV=production
EXPOSE 4000

# tini for proper signal handling (CTRL+C / docker stop)
ENTRYPOINT ["/usr/bin/tini","--"]
CMD ["node","src/server.mjs"]
