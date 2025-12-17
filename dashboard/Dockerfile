FROM node:22-slim

WORKDIR /app

# Create non-root user
RUN groupadd -g 1001 nodejs && \
    useradd -u 1001 -g nodejs -M -d /nonexistent -s /sbin/nologin nodejs || true

# Copy application files
COPY --chown=nodejs:nodejs . .

# Install dependencies
RUN npm install

# Build the application
RUN npm run build

USER nodejs

EXPOSE 3001

ENV NODE_ENV=production
ENV PORT=3001
ENV HOSTNAME="0.0.0.0"

CMD ["npm", "start"]
