# Sagat Frontend
# Keep in step with packageManager in the root package.json.
FROM oven/bun:1.4.4 AS base

WORKDIR /monorepo

# Copy entire monorepo
COPY . .

# Install all dependencies (including workspace links)
RUN bun install --frozen-lockfile

# Make sure env is production when doing any builds.
ENV NODE_ENV=production
# No SDK build: vite and tsc alias @mysten/sagat to sdk/src

# Move to App directory for runtime
WORKDIR /monorepo/app

# Development stage - don't build yet
FROM base AS development
# Vite dev server will be started by docker-compose command

# Build stage for production
FROM development AS build

# Accept build arguments
ARG VITE_API_URL
ARG VITE_SUI_NETWORKS
ARG VITE_DEFAULT_NETWORK

# Set environment variables for build
ENV NODE_ENV=production
ENV VITE_API_URL=$VITE_API_URL
ENV VITE_SUI_NETWORKS=$VITE_SUI_NETWORKS
ENV VITE_DEFAULT_NETWORK=$VITE_DEFAULT_NETWORK

RUN bun run build

# Production stage with nginx
FROM nginx:alpine AS production

# Create non-root user
RUN addgroup -g 1001 -S sagat && \
    adduser -S sagat -u 1001

# Copy built app to nginx
COPY --from=build --chown=1001:1001 /monorepo/app/dist /usr/share/nginx/html

ARG VITE_API_URL
COPY app/nginx/ /tmp/nginx/
# Only ${API_ORIGIN} is substituted so nginx's own $variables stay intact.
RUN set -eu; \
    API_ORIGIN="$(printf '%s' "$VITE_API_URL" | sed -E 's|^([a-z]+://[^/?#]+).*|\1|')"; \
    case "$API_ORIGIN" in \
        *[!A-Za-z0-9.:/-]*) API_ORIGIN= ;; \
    esac; \
    if ! printf '%s' "$API_ORIGIN" | grep -Eq '^(https://[A-Za-z0-9.-]+(:[0-9]+)?|http://(localhost|127\.0\.0\.1)(:[0-9]+)?)$'; then \
        echo "VITE_API_URL must be https://<host>[:port] or http://localhost[:port], got '$VITE_API_URL'" >&2; exit 1; \
    fi; \
    export API_ORIGIN; \
    mkdir -p /etc/nginx/snippets; \
    envsubst '${API_ORIGIN}' < /tmp/nginx/default.conf.template > /etc/nginx/conf.d/default.conf; \
    envsubst '${API_ORIGIN}' < /tmp/nginx/headers.conf.template > /etc/nginx/snippets/headers.conf; \
    rm -rf /tmp/nginx; \
    nginx -t

# Expose port
EXPOSE 80

# Start nginx
CMD ["nginx", "-g", "daemon off;"]
