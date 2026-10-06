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

## Writing tests

Each file calls `setupSharedTestEnvironment()`, and each test starts from `createTestApp()`, which empties the database. `ApiTestFramework` (in `framework/`) sets up sessions, users and multisigs; `TestSession.client` is a `SagatClient` that keeps the session cookie like a browser would.
