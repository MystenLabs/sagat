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
cp .env.test .env
bun test:e2e
```

open http://localhost:3000

## Testing proposals (requires localnet network running)

To run localnet test with iota, it's required that IOTA runs in the background (localnet).

To accomplish that, you can run:

```
iota client switch --env localnet
iota start --force-regenesis --with-faucet
```
