# Sagat SDK for the `/v1` API

A thin client over the `/v1` API. Request and response types are generated from the API's OpenAPI spec (`api/openapi/v1.json`) into `src/generated/v1.ts`, so the client cannot drift from the server. The `/auth` routes are shared with the legacy API and typed by hand.

The package name is a placeholder until the first publish.

```ts
import { ApiClient } from '@mysten/sagat-v1';

const client = new ApiClient({ apiUrl: 'https://...' });
const { publicKey } = await client.getAddressInfo('0x...');
```

Pass `token` for a script token (`POST /auth/script-connect`); without it the client sends the session cookie.

When the spec changes, regenerate the types (also run by `bun run openapi:update` at the repository root):

```bash
bun run generate
```

CI fails if the committed types differ from the spec.
