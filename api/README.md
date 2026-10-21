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
sui start --force-regenesis --with-faucet
```

A regenesis wipes the chain but not the database. The alias mirror never moves backwards (see `docs/account-rotation.md`, "Phase 2 notes"), so after a regenesis stop every API instance, clear the mirrored alias state for localnet in one transaction, and start the API again. A refresh still in flight could otherwise read the old chain and write after the cleanup.

```sql
BEGIN;
DELETE FROM account_aliases WHERE network = 'localnet';
DELETE FROM account_alias_state WHERE network = 'localnet';
COMMIT;
```

The same applies to devnet after one of its resets. Mainnet and testnet never reset.
