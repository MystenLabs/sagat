# Sui dApp Starter Template

This dApp was created using `@mysten/create-dapp` that sets up a basic React
Client dApp using the following tools:

- [React](https://react.dev/) as the UI framework
- [TypeScript](https://www.typescriptlang.org/) for type checking
- [Vite](https://vitejs.dev/) for build tooling
- [ESLint](https://eslint.org/)
- [`@mysten/dapp-kit`](https://sdk.mystenlabs.com/dapp-kit) for connecting to
  wallets and loading data
- [pnpm](https://pnpm.io/) for package management

## Starting your dApp

To install dependencies you can run

```bash
pnpm install
```

To start your dApp in development mode run

```bash
pnpm dev
```

### Dev wallet for localnet

Production wallets don't connect to a local network, so for manual testing
against one the app can embed a development wallet. Start the dev server with
`VITE_DEV_WALLET=1` to add "Dev Wallet" to the connect picker. Its floating
panel shows balances and an approval prompt for every signature. Switch the
signing account through the app's own account menu (the address button in the
header, which lists every connected account): picking an account in the panel
does not change what the app signs with. With the flag on and
`VITE_LOCALNET_RPC_URL` set, the app starts on localnet until you choose a
network.

The wallet holds five demo signers (maya, daniel, tomas, hana, payments), each
with the Ed25519 secret key `sha256("sagat-demo:<name>")`, so their addresses
are stable for a local seed to fund. When `VITE_DEV_WALLET_SECRET_KEY` is set
to an Ed25519 `suiprivkey…` string, it also holds that key as "You (demo)".
`VITE_LOCALNET_RPC_URL` points the wallet's localnet at your local node, as it
already does for the app. The API must serve localnet too: run it with
`SUPPORTED_NETWORKS` including `localnet` and `SUI_RPC_URL_localnet` pointing at
the same node, since `api/.env.example` only enables mainnet and testnet. The
wallet is loaded through a dynamic import, so builds without the flag contain
none of it.

Vite inlines `VITE_*` variables into the client JavaScript, so the key is
readable by anyone who can load the app, and it ends up in `dist` if you build
with the flag. Use a throwaway localnet-only key that never holds real funds,
and set it in your shell or in `app/.env` (gitignored), never in a committed
file.

## Building

To build your app for deployment you can run

```bash
pnpm build
```
