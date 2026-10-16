# API tests

End-to-end tests for the API. They call the Hono app directly, against a local Sui network and a throwaway Postgres database per test file.

## Running

```bash
sui start --force-regenesis --with-faucet
```

```bash
bun test:e2e
```

Set `TEST_DATABASE_URL` to a Postgres server you can create databases on (defaults to `postgresql://localhost:5432/postgres`).

## Migration tests (`migrations/`)

`migrations/migration-safety.test.ts` needs Postgres only, no Sui network. CI runs it in the `migration-test` job; locally:

```bash
bun test:migrations   # uses TEST_DATABASE_URL, default postgresql://localhost:5432/postgres
```

- **Upgrade path**, one test per case in `migrations/cases.ts`: create a scratch database, apply migrations up to the baseline, seed rows with plain SQL in the old schema, apply the target migration with drizzle's migrator, and check that every seeded row is unchanged under the new names, plus the case's own checks.
- **Empty path**: apply every migration to an empty database and compare tables, columns, keys, check constraints and indexes with the latest drizzle snapshot.

Scratch databases are dropped whether the test passes or fails. When you add a migration, add a case with the previous migration as the baseline. `bun test:e2e` runs only `test/*.test.ts`, so it does not pick these up.

## Legacy contract test (`legacy-contract.test.ts`)

Drives the legacy routes and compares the normalized responses with `golden/legacy-contract.json`. The legacy routes are frozen, so a failure means a legacy response changed. If the change is intended, regenerate the fixture and commit the diff with the change:

```bash
UPDATE_GOLDEN=1 bun test ./test/legacy-contract.test.ts
```

See `golden/README.md` for what is normalized and when not to regenerate.

## Writing tests

Each file calls `setupSharedTestEnvironment()`, and each test starts from `createTestApp()`, which empties the database. `ApiTestFramework` (in `framework/`) sets up sessions, users and multisigs; `TestSession.client` is a `SagatClient` that keeps the session cookie like a browser would.
