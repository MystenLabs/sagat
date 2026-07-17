# Sagat SDK E2E

Run the Rust SDK against a real Sagat API server:

```sh
bash crates/sagat-sdk/e2e/run.sh
```

The runner uses an already-running local Postgres when available. If local
Postgres is not reachable, it can start Postgres with Docker Compose or Podman.
It starts Sui localnet when it is not already running, creates a temporary
migrated database, starts the Sagat API on localhost, then runs only the ignored
Rust e2e tests:

```sh
cargo test --manifest-path crates/sagat-sdk/Cargo.toml -- --ignored --nocapture
```

It does not run the JavaScript API test suite. Bun is still required because the
Sagat API is a Bun/Hono app and the fixture helper signs Sui messages using the
repo's existing TypeScript Sui dependencies.

Useful flags:

```sh
POSTGRES_RUNTIME=external bash crates/sagat-sdk/e2e/run.sh
POSTGRES_ADMIN_URL=postgresql://localhost:5432/postgres bash crates/sagat-sdk/e2e/run.sh
KEEP_DB=1 bash crates/sagat-sdk/e2e/run.sh
KEEP_POSTGRES=1 bash crates/sagat-sdk/e2e/run.sh
START_SUI=0 bash crates/sagat-sdk/e2e/run.sh
```

Run one integration test target, which maps to a file under
`crates/sagat-sdk/tests`:

```sh
bash crates/sagat-sdk/e2e/run.sh --test e2e_proposals
```

Run one test-name filter inside that target:

```sh
bash crates/sagat-sdk/e2e/run.sh --test e2e_proposals weighted_votes
```

Use Podman instead of Docker Compose:

```sh
POSTGRES_RUNTIME=podman bash crates/sagat-sdk/e2e/run.sh
```

On macOS, initialize and start the Podman VM first if needed:

```sh
podman machine init
podman machine start
```
