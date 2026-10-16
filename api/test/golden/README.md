# Golden fixtures

`legacy-contract.json` is the frozen JSON contract of the legacy routes (`/multisig`, `/addresses`, `/proposals`, `/auth`). `legacy-contract.test.ts` drives 31 legacy calls through the old SDK, normalizes the responses, and compares them with this file.

Normalization replaces values that change between runs with placeholders numbered in order of first appearance: `<address:n>`, `<publicKey:n>`, `<signature:n>`, `<digest:n>`, `<txBytes:n>`, `<id:n>` (`<id:n:string>` when the id is sent as a string), `<opaque:n>`, and `<timestamp>`. Field names, field order, nulls, status codes and every other value are compared as recorded.

Do not regenerate this file to make the test pass. The legacy routes are frozen (see `docs/account-rotation.md`, "Rollout"); a difference means a legacy response changed, and the fix belongs in the route or in `api/src/legacy/serializers.ts`.

If a change to a legacy response is intended, regenerate and commit the fixture in the same pull request, so the change is reviewed as a diff:

```bash
cd api
UPDATE_GOLDEN=1 bun test ./test/legacy-contract.test.ts
git diff test/golden/
```

The test needs the local Sui network, like the other e2e tests. If you change the calls the test makes, the placeholders shift too: regenerate and check that the diff only reflects the calls you changed.
