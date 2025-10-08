# Sagat Frontend
FROM oven/bun:1.2.23 AS base

# Install system dependencies
RUN apt-get update && apt-get install -y curl && rm -rf /var/lib/apt/lists/*

WORKDIR /monorepo

# Copy entire monorepo
COPY . .

# Install all dependencies (including workspace links)
RUN bun install --frozen-lockfile

# Make sure env is production when doing any builds.
ENV NODE_ENV=production
# Build SDK only (app will be built in build stage with env vars)
RUN bun run build:sdk

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
COPY --from=build /monorepo/app/dist /usr/share/nginx/html

# Change ownership of nginx html directory
RUN chown -R sagat:sagat /usr/share/nginx/html

# Expose port
EXPOSE 80

# Start nginx
CMD ["nginx", "-g", "daemon off;"]
