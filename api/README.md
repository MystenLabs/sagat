To install dependencies:

```sh
bun install
```

To run:

```sh
bun run dev
```

To test:

```sh
bun test:e2e
```

open http://localhost:3000

## The `/v1` API

Routes under `/v1` are declared with `@hono/zod-openapi` in `src/v1/`: one `createRoute` per route validates the request, types the handler and lands in the spec. The spec is served at `/v1/openapi.json`, with a reference page at `/v1/docs`, and committed as `openapi/v1.json`; `bun test:openapi` checks that the snapshot matches the app, and `UPDATE_OPENAPI=1 bun test:openapi` regenerates it (see `test/README.md`). The legacy routes (`/multisig`, `/addresses`, `/proposals`) are frozen and stay out of the spec.

## Migrations

The API applies pending migrations from `drizzle/` when it starts, before it serves any request. Replicas that start together take turns on a Postgres advisory lock, so only one of them applies the migrations. If a migration fails, the API exits instead of serving an outdated schema.

- The database role must own the tables. DDL privileges are not enough: renaming a table requires ownership.
- Connect directly or through a session-mode pooler. The advisory lock is session-level and does not work behind a transaction-mode pooler (for example PgBouncer in transaction mode).
- Each migration statement waits at most 10 s for a table lock. A migration blocked by an open transaction fails with `canceling statement due to lock timeout` instead of stalling; the API exits and the next start tries again.
- If the database has tables but `drizzle.__drizzle_migrations` is missing or empty, startup stops with "The database has tables but no migration journal". The database was not built with drizzle migrations, and drizzle would try to run them all from the first one. Seed the journal with the migrations that are already applied, or run them manually, then start again.

To run migrations as a separate step instead, for example in a Kubernetes Job or init container with the production image, set `MIGRATE_ON_START=false` on the API and run:

```sh
DATABASE_URL=... bun run db:migrate:prod
```

`MIGRATIONS_FOLDER` overrides where the migrations are read from. `bun db:migrate` (drizzle-kit) still works for local development.

## Testing proposals (requires localnet network running)

To run localnet test with sui, it's required that Sui runs in the background (localnet).

To accomplish that, you can run:

```
sui client switch --env localnet
sh ../e2e/start-localnet.sh 9000 9123
```

Run it from `api/`. The script keeps two epochs of history, where plain `sui start --force-regenesis` prunes transactions after about an hour; see `test/README.md`.
