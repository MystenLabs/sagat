# Sagat CLI Design

## Goal

Let the Sui CLI discover and operate Sagat-managed multisigs without making local config the source of truth for multisig membership, proposal state, or proposer permissions.

## Core Model

The CLI should separate three concepts:

```text
active_identity = local Sui key used to sign/authenticate
active_account = address being operated on, possibly a multisig
connected_identities = local keys that have Sagat JWTs
```

A multisig address may not have a local private key. The CLI operates on that multisig by using a local key that is either a multisig member or an approved external proposer.

## State Ownership

The Sui keystore owns local signing keys.

The Sagat service owns canonical product state:

- multisigs
- multisig members and weights
- invitations and acceptance/rejection state
- proposals
- proposal signatures
- external proposers

The CLI config owns preferences and auth material:

```yaml
sagat:
  api_url: https://api.sagat.mystenlabs.com
  active_identity: <local-address>
  active_account: <local-or-multisig-address>
  identities:
    <local-address>:
      public_key: <sui-public-key>
      token: <jwt>
      token_expires_at: <timestamp>
```

Local multisig data may be cached for convenience, but Sagat should remain the source of truth.

## Authentication

`sui sagat auth connect --address <local-address>` signs the Sagat connect message with a local key and calls:

```http
POST /auth/script-connect
```

The server verifies the signature and returns a short-lived JWT. The CLI stores the JWT under that local identity.

`disconnect` is local-only for now: the CLI clears the stored JWT. Server-side JWT revocation does not exist today.

`check_auth` calls:

```http
GET /auth/check
Authorization: Bearer <jwt>
```

This is the real check for whether the current JWT is still accepted by the configured Sagat API.

## Discovery

Someone else can create a multisig that includes one of the user's public keys. Local config will not know that. Discovery must query Sagat.

`sui sagat multisig list` should:

1. Iterate over Sagat-connected local identities.
2. Use each identity's JWT.
3. Query connections and invitations.
4. Merge results by multisig address.
5. Show which local identity has access, has a pending invitation, or has external proposer access.

The CLI should not automatically authenticate every local Sui key. Users explicitly connect the local identities they want Sagat to know about.

## Selecting A Multisig

`sui sagat multisig use <address>` sets `active_account`.

The CLI sanity-checks the address by querying Sagat with connected identities until one succeeds:

```http
GET /multisig/<address>
Authorization: Bearer <jwt>
```

When one succeeds, store the matching local identity as `active_identity` for that multisig. This avoids searching across all keys on every command.

## External Proposers

External proposers are local addresses that are allowed to create proposals for a multisig without being members of the multisig.

They should be modeled as part of Sagat's canonical state, not local-only CLI state.

The CLI should support:

```text
sui sagat proposer list
sui sagat proposer add <multisig-address> <proposer-address>
sui sagat proposer remove <multisig-address> <proposer-address>
```

Adding or removing an external proposer requires a valid member signature over the Sagat proposer message. After proposer access is granted, the external proposer should be able to authenticate with Sagat using its own local key and create proposals for that multisig.

Discovery should show proposer access separately from member access so users understand what authority the active identity has.

## Operating As A Multisig

When `active_account` is a Sagat multisig:

1. Use `active_identity` as the local signing key.
2. Confirm the identity has member or external proposer access.
3. Build transaction bytes with the multisig as sender.
4. Sign the proposal payload with the local identity.
5. Call Sagat to create, sign, cancel, or verify proposals.
6. Let Sagat store proposal state so other members can discover and act on it.

The CLI should think:

```text
I am operating on this multisig account using this local identity as my signer.
```

## Principle

The CLI should cache for convenience, but Sagat remains the source of truth for multisig membership, invitations, external proposer permissions, and proposal state. The CLI remembers which local keys are connected and which account is active; the service answers what those keys can do.
