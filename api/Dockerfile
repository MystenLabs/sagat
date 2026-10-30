# Sagat API Backend
# Keep in step with packageManager in the root package.json.
FROM oven/bun:1.4.4 AS build

WORKDIR /monorepo

# Copy entire monorepo
COPY . .

# Install all dependencies (including workspace links)
RUN bun install --frozen-lockfile

# Set production environment
ENV NODE_ENV=production

RUN bun run build:sdk
RUN bun run build:api

# Runtime: the bundle has its dependencies inlined, so no node_modules
FROM oven/bun:1.4.4-slim AS production

# migrate.ts finds drizzle/ by walking up from dist/, so keep them siblings
WORKDIR /monorepo/api

# Create non-root user
RUN groupadd -g 1001 sagat && \
    useradd -r -u 1001 -g sagat sagat

COPY --from=build --chown=1001:1001 /monorepo/api/dist dist
COPY --from=build --chown=1001:1001 /monorepo/api/drizzle drizzle

# Switch to non-root user
USER sagat

# Expose port
EXPOSE 3000

# Start the API server (production mode - run built file)
CMD ["bun", "run", "dist/index.js"]
