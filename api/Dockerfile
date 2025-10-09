# Sagat API Backend
FROM oven/bun:1.2.23 AS base

# Install system dependencies including postgres drivers
RUN apt-get update && apt-get install -y \
    postgresql-client \
    libpq-dev \
    python3 \
    python3-pip \
    build-essential \
    curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /monorepo

# Copy entire monorepo
COPY . .

# Install all dependencies (including workspace links)
RUN bun install --frozen-lockfile

# Explicitly install pg driver and postgres package to ensure native modules are properly linked
RUN bun add pg postgres

# Build SDK and API using top-level commands

# Set production environment
ENV NODE_ENV=production

RUN bun run build:sdk
RUN bun run build:api

# Move to API directory for runtime
WORKDIR /monorepo/api

# Create non-root user
RUN groupadd -g 1001 sagat && \
    useradd -r -u 1001 -g sagat sagat

# Change ownership
RUN chown -R sagat:sagat /monorepo

# Switch to non-root user
USER sagat

# Expose port
EXPOSE 3000

# Start the API server (production mode - run built file)
CMD ["bun", "run", "dist/index.js"]
