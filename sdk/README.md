# Sagat SDK for the `/v1` API

The SDK for the `/v1` API: a thin client over it. Request and response types are generated from the API's OpenAPI spec (`api/openapi/v1.json`) into `src/generated/v1.ts`, so the client cannot drift from the server. The `/auth` routes are shared with the legacy API and typed by hand.

Marked private until the first publish. The legacy client that drives the old routes is `sdk-legacy/`, frozen at the `sdk-legacy` tag.

```ts
import { ApiClient } from '@mysten/sagat';

const client = new ApiClient({ apiUrl: 'https://...' });
const { publicKey } = await client.getAddressInfo('0x...');
```

Pass `token` for a script token (`POST /auth/script-connect`); without it the client sends the session cookie.

Every request is aborted after `timeoutMs` (default 20000), rejecting with a `TimeoutError` DOMException; a signal on the request still aborts it earlier.

When the spec changes, regenerate the types (also run by `bun run openapi:update` at the repository root):

```bash
bun run generate
```

CI fails if the committed types differ from the spec.
