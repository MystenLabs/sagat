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
`VITE_DEV_WALLET=1` to add "Dev Wallet" to the connect picker, with a floating
panel for switching accounts and an approval prompt for every signature.

The wallet holds the five demo signers that the e2e demo seed derives (same
addresses), plus, when `VITE_DEV_WALLET_SECRET_KEY` is set to a `suiprivkey…`
string, that key as "You (demo)". `VITE_LOCALNET_RPC_URL` points the wallet's
localnet at your local node, as it already does for the app. The wallet is
loaded through a dynamic import, so builds without the flag contain none of it.
Keep secret keys out of committed files.

## Building

To build your app for deployment you can run

```bash
pnpm build
```
