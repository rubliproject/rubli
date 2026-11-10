# RUBLI Frontend - Multi-stage Docker Build
# Stage 1: Build the React app
FROM node:22-alpine@sha256:fe4f6d74e20370acb04ad889077d14d0f64a9c8ea6a42bc60cddf1e844699914 AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --legacy-peer-deps

# Copy source code
COPY . .

# Type-check and build
RUN npx tsc --noEmit && npx vite build && node scripts/gen-head-shells.mjs

# Stage 2: Serve with nginx
FROM nginx:alpine@sha256:892bb2152464f0c5d8972593a5f5afaf8054552580b699d95f8ff4af08c2d33d AS production

# Copy custom nginx config
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Copy built assets from builder
COPY --from=builder /app/dist /usr/share/nginx/html
# real-404 route map (scripts/gen-head-shells.mjs): config, not content
RUN mv /usr/share/nginx/html/known-routes.map /etc/nginx/known-routes.map

# Entrypoint script: clears the legacy runtime-config placeholder in index.html.
# No secrets reach the frontend — mutations authenticate with the user's JWT
# (docs/security/WRITE_KEY_FIX_2026-10-02.md).
COPY docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh

# Expose port
EXPOSE 80

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://127.0.0.1/ || exit 1

# Entrypoint injects runtime config, then hands off to nginx
ENTRYPOINT ["/docker-entrypoint.sh"]
CMD ["nginx", "-g", "daemon off;"]
