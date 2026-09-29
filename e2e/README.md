# UI end-to-end tests

Playwright tests that drive the real app in a browser, against the real API, a
Postgres database and a local Sui network. Signatures are real: the API
verifies them and the chain executes the transactions.

## Running

You need the `sui` CLI (`suiup install sui@mainnet`) and a Postgres server. Then,
from the repo root:

```sh
bun install
cd e2e
bunx playwright install chromium   # once
bun run test                       # or: bun run test:ui / bun run test:headed
```

Playwright starts everything it needs and stops it afterwards:

| Server    | Command                                         | URL                     |
| --------- | ----------------------------------------------- | ----------------------- |
| Local Sui | `sui start --force-regenesis --with-faucet`     | `http://127.0.0.1:9000` |
| API       | builds the SDK, prepares the DB, starts the API | `http://localhost:3100` |
| App       | Vite dev server (CI: production build)          | `http://localhost:4173` |

Anything already listening on those URLs is reused locally, so a running
`sui start --with-faucet` is picked up. The ports don't clash with `bun dev`.

Configuration (all optional):

| Variable             | Default                                 |
| -------------------- | --------------------------------------- |
| `E2E_DATABASE_URL`   | `postgresql://localhost:5432/sagat_e2e` |
| `E2E_APP_SERVER`     | `dev` locally, `preview` in CI          |
| `E2E_API_PORT`       | `3100`                                  |
| `E2E_APP_PORT`       | `4173`                                  |
| `E2E_SUI_RPC_URL`    | `http://127.0.0.1:9000`                 |
| `E2E_SUI_FAUCET_URL` | `http://127.0.0.1:9123`                 |

`E2E_SUI_RPC_URL` reaches the API, the app (as `VITE_LOCALNET_RPC_URL`), the
test wallet and the test helpers, so they all use the same network.

The database is created and migrated on start. Tests never clean it up, and
don't need to (see below). Drop it whenever you like to start fresh.

With the Postgres from `docker-compose.yml`:
`E2E_DATABASE_URL=postgresql://sagat:sagat_dev_password@localhost:5432/sagat_e2e bun run test`.

Failed tests keep a Playwright trace (every step with DOM snapshots, network
and console) and screenshots. `bun run report` opens the HTML report; CI
uploads it as the `playwright-report` artifact.

## How it works

**The wallet.** `wallet/inject.ts` is bundled by `global-setup.ts` and injected
into every page before the app loads. It is
[`@mysten-incubation/dev-wallet`](https://ts-sdks-incubation.vercel.app/dev-wallet/guides/e2e-testing)
holding keys the test controls, with every request auto-approved. It registers
through the wallet-standard window events, the same way extension wallets do,
so the app runs unmodified and no test code ships in it.

**People.** Each test creates its own users with fresh keys:

- `createActor('alice')` gives Alice a browser context (own cookies, own
  wallet) and a page. Every person in a multi-party flow needs their own: the
  API accepts invitations automatically for every key signed in within the same
  browser.
- `createIdentity('bob')` is a user without a browser, for people who only act
  through the API.

Both have `.api` (the SDK client, authenticated as that user once signed in)
and `signMessage` / `signTransaction` with the same key the wallet uses. The
helpers in `support/scenarios.ts` (`setupMultisig`, `proposeTransfer`,
`signProposal`) use them to set up state fast; drive the flow under test
through the UI.

Fresh keys mean fresh multisig addresses, so tests never share state and run in
parallel against one database and chain.

**Isolation from the internet.** Only `localhost` and `127.0.0.1` are
reachable. Outside services (Slush, WalletConnect, public RPCs) are blocked, and
the mainnet coin list is answered with an empty list.

## Writing tests

- Select elements with `data-testid`, not text or labels. Add a test ID to the
  component when one is missing. For state, prefer data attributes such as
  `data-status` on proposal cards over reading badge text.
- Assert outcomes beyond the UI when it matters, e.g. `chain.balance(address)`
  after executing a transfer.
- Another user's page doesn't update by itself: reload it or use the refresh
  button.
- A multisig can only have one pending proposal paying gas from the same coin at
  a time; the API rejects the second one.
