# API tests

End-to-end tests for the API. They call the Hono app directly, against a local Sui network and a throwaway Postgres database per test file.

## What is tested where

- **`/v1` carries the behavioural coverage.** Business rules live in the services, so each rule is tested once, through the `/v1` route and the SDK (`sdk/`, `TestSession.v1`). This also covers the SDK itself: request building, error mapping, signing helpers.
- **Legacy routes keep the golden contract plus spot checks.** `legacy-contract.test.ts` pins their responses; `legacy-*.test.ts` files cover what is legacy-specific (listing semantics, later the rotated-account refusal). The legacy SDK (`sdk-legacy/`, frozen at the `sdk-legacy` tag, `TestSession.client`) is only used for those and for setup that has no `/v1` route yet.
- **Tests move with the routes.** When a `/v1` route lands, the tests of its rules switch to it and their legacy copies are deleted; nothing is tested twice. Until `/v1` has a route, its legacy test stays as is.

## Running

From `api/`, start a local Sui network with the script CI uses. It keeps two epochs of history, so a network left running for over an hour still serves the tests' transactions (plain `sui start --force-regenesis` prunes them after about an hour).

```bash
sh ../e2e/start-localnet.sh 9000 9123
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

## OpenAPI snapshot test (`openapi/`)

`openapi/v1-spec.test.ts` generates the `/v1` spec from the mounted app and compares it with `api/openapi/v1.json`. It needs neither Postgres nor the Sui network. CI runs it in the `openapi-check` job; locally:

```bash
bun test:openapi
```

A failure means a `/v1` route, schema or the spec metadata changed. Regenerate the snapshot and commit the diff with the change, so the API change is reviewed as a spec diff:

```bash
UPDATE_OPENAPI=1 bun test:openapi
git diff openapi/
```

## Legacy contract test (`legacy-contract.test.ts`)

Drives the legacy routes and compares the normalized responses with `golden/legacy-contract.json`. The legacy routes are frozen, so a failure means a legacy response changed. If the change is intended, regenerate the fixture and commit the diff with the change:

```bash
UPDATE_GOLDEN=1 bun test ./test/legacy-contract.test.ts
```

See `golden/README.md` for what is normalized and when not to regenerate.

## Writing tests

Each file calls `setupSharedTestEnvironment()`, and each test starts from `createTestApp()`, which empties the database. `ApiTestFramework` (in `framework/`) sets up sessions, users and accounts. `TestSession.v1` is the `/v1` SDK client and `TestSession.client` the legacy one; both keep the session cookie like a browser would. The session helpers (`createSignerSet`, `proposeTransfer`, `voteAndExecute`, ...) drive `/v1`; the legacy ones (`createMultisig`, `legacyCreateProposal`, ...) are kept for the legacy tests.

Rotation tests (`rotation-*.test.ts`) need what no route writes yet: draft links and the alias mirror. `framework/rotation.ts` writes them straight into the database (`draftSignerSet`, `linkSignerSet`, `setAliasMirror`) and sets up the shared scenario (`rotationScenario`). The test environment supports two networks, `localnet` and `testnet`, and both point at the local network, so per-network rules are tested without a public network (`.env.test`, and the API E2E job in CI).
