# Migrating an API integration to the v1 API

_Draft, 2026-09-28, revised 2026-10-14. Written ahead of the release from the design in [account-rotation.md](account-rotation.md). Names marked **proposed** are final only once the release ships; this guide is updated in the same pull request as the code._

_Direction revised 2026-11-17: `/v1` is built per feature and covers the account-scoped routes only, in one SDK package beside the existing client, with every signer set in an account's alias set that the API can identify acting on that network, signed message texts unchanged, and a signer change's signatures withheld until it is ready. Every section below except "Who needs this" predates that: routes, fields, SDK, signed messages, executing a proposal, exports and new routes for rotation. Each is corrected in the pull request that adds its route; until then [account-rotation.md](account-rotation.md) is the reference. The account routes (`/v1/accounts`, `/v1/invitations`) and the proposal routes (`/v1/proposals`) are corrected._

## Who needs this

Anyone calling the Sagat API directly or through the SDK from the repository: scripts, CI jobs, the Rust client.

The web app needs nothing from you. It updates with the release.

**Nothing breaks on release day, apart from the stricter input and the new cancel message listed below.** The routes you use today keep working, frozen, on top of the new schema. The new API lives under `/v1`. The session cookie and script token are shared, so you can move one call at a time.

Four things to plan for:

- **Legacy routes refuse accounts that have rotated signers.** They return an error pointing at `/v1`. Two exceptions: `verify` and `verify-by-digest` still work, so a proposal that rotated the account can be verified, and the connection and invitation listings (`GET /addresses/connections`, `GET /addresses/invitations/:publicKey`) leave rotated accounts out silently rather than failing. A rotated account missing from a listing is not deleted and your membership is not lost; it is only visible under `/v1`. If your team never rotates, you never see any of this.
- **Legacy routes are removed once their traffic reaches zero.** There is no fixed date. Migrating early keeps you off the last-user list.
- **Stricter input on some legacy routes.** `add-proposer` and `remove-proposer` accept `expiry` only in the form `YYYY-MM-DDTHH:MM:SS`, with an optional fraction of up to nine digits, followed by `Z` or a `±HH:MM` offset, such as `2026-11-05T13:48:41.000Z`. Create, vote, cancel, accept, reject, `add-proposer` and `remove-proposer` accept a signature only as canonical base64. Other forms get a 400.
- **Cancel takes only the new message.** `POST /proposals/:id/cancel` accepts only the signed text `Cancelling proposal <digest> on multisig <address>`. The old `Cancel proposal <id>` gets a 400. See "Signed messages" below.

## What changed, in one paragraph

A "multisig" used to be both the address that owns assets and the list of keys that sign for it. These are now two things. The **account** is the address that owns assets and sends transactions. A **signer set** is a list of keys, weights, and a threshold. An account can have several signer sets, and they can differ per network.

If you never rotate signers, your account has one signer set with the same address as the account, and your integration does the same work as before under new names.

## Five-minute migration for the common case

The common case is a script that authenticates, creates proposals, and perhaps signs or reads them.

1. Install the new SDK package. It talks to `/v1` only.
2. Replace `multisigAddress` with `accountAddress` wherever you send or read it.
3. Rename the SDK calls using the table below.
4. If you combine signatures and execute yourself, read "Executing a proposal".
5. Run your script against testnet.

If you call the API directly without the SDK, prefix every path with `/v1` and apply the route table.

Authentication does not change. The connect message, the script token, and its one hour lifetime are the same.

## Routes

| Before                                                                   | After                                    | Notes                                                                                                                                                                                                                       |
| ------------------------------------------------------------------------ | ---------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `POST /multisig`                                                         | `POST /v1/signer-sets`                   | **Proposed.** Creates a composition. Also creates the account with the same address, unless `forAccount` is given.                                                                                                          |
| `GET /multisig/:address`                                                 | `GET /v1/accounts/:address`              | The account on the network, see "Accounts" below. Open to any key of an acting signer set, whatever its answer.                                                                                                             |
|                                                                          | `GET /v1/signer-sets/:address`           | **Proposed.** Returns one composition with its members.                                                                                                                                                                     |
| `POST /multisig/:address/accept`                                         | `POST /v1/accounts/:address/accept`      | A key's answer to the account, for any key of an acting signer set. Body `signature` and `expiry`, signed with the new accept message. The address must be canonical.                                                       |
| `POST /multisig/:address/reject`                                         | `POST /v1/accounts/:address/reject`      | As accept, with the new reject message. Rejecting again answers as the first time and records nothing.                                                                                                                      |
| `POST /multisig/:address/add-proposer`                                   | `POST /v1/accounts/:address/proposers`   | Body `proposer`, `signature` and `expiry`, signed with the same message as before.                                                                                                                                          |
| `POST /multisig/:address/remove-proposer`                                | `DELETE /v1/accounts/:address/proposers` | Same body and message as before. Cancels the proposer's pending proposals on the network. Answers `{ removed, cancelledProposals }`: whether this call removed the proposer, and the digests of the proposals it cancelled. |
| `GET /addresses/connections`                                             | `GET /v1/accounts`                       | Accounts a key of the session has accepted on the network, each once, and the ones a key was removed from.                                                                                                                  |
| `GET /addresses/invitations/:publicKey`                                  | `GET /v1/invitations`                    | Accounts where a key of the session is in an acting signer set and has not answered. `showRejected=true` lists the rejected ones instead.                                                                                   |
| `POST /proposals`                                                        | `POST /v1/proposals?network=`            | Body `accountAddress`, `transactionBytes`, `signature` and an optional `description`. The address must be canonical; one that is no account gets the 403 a non-signer gets. Answers 201 with the proposal.                  |
| `GET /proposals`                                                         | `GET /v1/proposals`                      | Query `accountAddress`, `network`, and optional `status`, `nextCursor` and `perPage`. Needs a session.                                                                                                                      |
| `POST /proposals/:id/vote`                                               | `POST /v1/proposals/:digest/vote`        | Addressed by digest. Body `signature`. Answers with the proposal.                                                                                                                                                           |
| `POST /proposals/:id/cancel`                                             | `POST /v1/proposals/:digest/cancel`      | Addressed by digest. Body `signature`, signed with the same message as before. Answers with the proposal.                                                                                                                   |
| `POST /proposals/:id/verify`, `POST /proposals/:digest/verify-by-digest` | `POST /v1/proposals/:digest/verify`      | Addressed by digest, no body, open to anyone. Records `executedVia`. Answers with the proposal.                                                                                                                             |
| `GET /proposals/digest/:digest`                                          | `GET /v1/proposals/:digest`              | Public. Response changed, see below.                                                                                                                                                                                        |
| `POST /addresses`, `GET /addresses/:address`                             | `/v1/addresses`, same shape              | **Proposed.**                                                                                                                                                                                                               |
| `/auth/*`                                                                | unchanged, shared by both route sets     |                                                                                                                                                                                                                             |

Every `/v1` account route takes a required `network` query parameter, such as `?network=mainnet`, and answers for that network only. Each one first reads the account's alias set from the chain again when the last read is older than a minute. When the chain cannot be read, the reads answer from the last read with `signerSetsStale: true`, and accept, reject and the proposer routes are refused with a 503.

The proposal routes follow the same rule for the proposal's account and network. Create, vote and cancel are refused with a 503 when the alias set cannot be read; the list and `GET /v1/proposals/:digest` answer from the last read with `signerSetsStale: true`. The routes addressed by digest take no `network`: the proposal names it. Verify does not check the threshold first. After it records a proposal that calls `0x2::address_alias` and succeeded, it reads the account's alias set again. Who may call each route is the access table in [account-rotation.md](account-rotation.md#signer-resolver).

A `/v1` route’s own errors answer `{ "error": "…" }` as JSON, also a request with no session (401, `Unauthorized`) and a body over the size limit (413, `Payload Too Large`). Three answers come as plain text from the shared middleware: a body that is not valid JSON (400, `Malformed JSON in request body`), a path that matches no `/v1` route (404, `404 Not Found`), and the origin check (403, `Forbidden`), which refuses only a request from an origin that is not allowed when it is not a GET and has a form-like or missing content type. A key in no acting signer set of the account on the network, and an address that is no account, get a 403 with “You are not a signer of this account on this network.” A signer who has not accepted the account, on a route that needs an accepted signer, gets a 403 with “You have not accepted this account.”

New routes for rotation are listed at the end. You do not need them unless you rotate signers.

## Fields

| Where                | Before                                                              | After                                                                                                                                                                                                                                                                                                              |
| -------------------- | ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Create proposal body | `multisigAddress`                                                   | `accountAddress`. `network` moves to the query.                                                                                                                                                                                                                                                                    |
| Proposal             | `multisigAddress`                                                   | `accountAddress`                                                                                                                                                                                                                                                                                                   |
| Proposal             | `multisig.name`                                                     | `accountName`                                                                                                                                                                                                                                                                                                      |
| Proposal             | `multisig`                                                          | `signerSets`: the signer sets that act for the account on the proposal's network, one for an account that never changed and none or several once its alias set changes, then the original set when it no longer acts there, each with `address`, `threshold`, `members`, `currentWeight`, `acting` and `original`. |
| Proposal             | `currentWeight`                                                     | Moved into each element of `signerSets`.                                                                                                                                                                                                                                                                           |
| Proposal             | `totalWeight`                                                       | Removed, see the note below the table.                                                                                                                                                                                                                                                                             |
| Proposal             | `id`                                                                | Removed. A proposal is addressed by `digest`.                                                                                                                                                                                                                                                                      |
| Proposal             | `status`                                                            | A name: `PENDING`, `CANCELLED`, `SUCCESS` or `FAILURE`, as the list's `status` filter takes.                                                                                                                                                                                                                       |
| Proposal             |                                                                     | `ready`: true when an acting set in `signerSets` has reached its threshold.                                                                                                                                                                                                                                        |
| Proposal             | `events`                                                            | `created` and `proposer`, each an audit log event or null, as on the legacy route, and `cancelled`: the proposal’s newest `proposal.cancelled` event, or null.                                                                                                                                                     |
| Proposal             | `signatures`                                                        | Each `{ publicKey, signature }`, without `proposalId`.                                                                                                                                                                                                                                                             |
| Proposal             |                                                                     | `executedVia`: the address that signed for the account at execution, as it is, recorded when the proposal is verified. Null until then, or when it could not be read.                                                                                                                                              |
| Proposal             |                                                                     | `kind`: `transaction`, or `alias_call` for a transaction that calls `0x2::address_alias`.                                                                                                                                                                                                                          |
| Proposal             |                                                                     | `signerSetsStale`: true when the alias set could not be read from the chain, so `signerSets` are as last read.                                                                                                                                                                                                     |
| Proposal list        | `data`                                                              | `proposals`, beside `network`, `accountAddress`, `hasNextPage`, `nextCursor` and `perPage`.                                                                                                                                                                                                                        |
| Vote response        | `hasReachedThreshold`, `currentWeight`                              | The proposal. Read `ready` on it, and `signerSets[].currentWeight` for one tally per set.                                                                                                                                                                                                                          |
| Connections          | an object of multisigs per public key                               | `accounts`: each account once, sorted by address, and `removed`.                                                                                                                                                                                                                                                   |
| Invitations          | an array of multisigs                                               | `invitations`: each account once.                                                                                                                                                                                                                                                                                  |
| Account              | `isVerified`, `threshold`, `members`, `totalMembers`, `totalWeight` | `signerSets` and `signerSetsStale`, see "Accounts" below.                                                                                                                                                                                                                                                          |
| Account              | `draftedBy`                                                         | `createdBy`                                                                                                                                                                                                                                                                                                        |
| Member               | `multisigAddress`, `isAccepted`, `isRejected`                       | `answer`: the key's answer to this account, `accepted`, `rejected` or `invited`. Members sit inside their set, so they carry no set address.                                                                                                                                                                       |
| Member               | `label`                                                             | Unchanged.                                                                                                                                                                                                                                                                                                         |
| Proposer             | `address`, `addedBy`, `addedAt`, `event`                            | Unchanged.                                                                                                                                                                                                                                                                                                         |

Every `/v1` proposal route answers with the proposal in one shape, the one `GET /v1/proposals/:digest` returns. The legacy routes return a shorter proposal from create and the list, and the public one from `GET /proposals/digest/:digest`; cancel and verify return no proposal.

The legacy `totalWeight` on `GET /proposals/digest/:digest` is the multisig's threshold, not the sum of member weights; the name was misleading. To check progress, compare `signerSets[].currentWeight` with `signerSets[].threshold`, or use `ready`.

Shape of `signerSets` on a proposal:

```json
{
	"ready": false,
	"signerSets": [
		{
			"address": "0x...",
			"threshold": 2,
			"currentWeight": 1,
			"members": [
				{
					"publicKey": "...",
					"weight": 1,
					"order": 0
				}
			],
			"acting": true,
			"original": true
		}
	]
}
```

- The sets that act on the proposal's network come first, each with `acting: true`. `original` is true on the one at the account's address. It is a convenience: the address is what identifies the original set.
- Once the original set no longer acts there, it comes last with `acting: false`, `original: true` and `currentWeight: 0`. It counts no signatures and changes nothing that is counted: `ready`, the status, or which keys may vote, cancel or create. It is listed so a client without the account can rebuild the account's address from it.

Members here carry no `label`: key labels (0010) are returned only on authenticated member listings, never on proposal shapes or public lookups.

## Accounts

`GET /v1/accounts`, `GET /v1/invitations` and `GET /v1/accounts/:address` return accounts in this shape, for the network in the query:

```json
{
	"address": "0x...",
	"name": "Treasury",
	"createdBy": "0x...",
	"createdAt": "2026-11-20T10:00:00.000Z",
	"signerSets": [
		{
			"kind": "signer_set",
			"address": "0x...",
			"threshold": 2,
			"members": [
				{
					"publicKey": "...",
					"weight": 1,
					"order": 0,
					"answer": "accepted",
					"label": "Alice's Ledger"
				}
			],
			"acting": true,
			"original": true
		}
	],
	"signerSetsStale": false
}
```

- `signerSets` has one entry per signer set. The first is the original set, the one at the account's address, which the address is derived from. It is always returned, also on a network where it no longer acts. After it come the other addresses in the alias set on the network. For an account that never changed there is one entry.
- An entry is a composition the API holds (`kind: "signer_set"`) or an address the API cannot identify (`kind: "unknown"`), which carries only `address` and can sign for the account.
- `acting` is true when the set is in the alias set on the network, so it is false only for the original set once it was removed there.
- `original` is true for that first entry and false for the others. It is a convenience: the address is what identifies the original set.
- Each member carries `answer`, the key's answer to this account, and `label`, the account's name for the key or null.
- `signerSetsStale` is true when the alias set could not be read from the chain, so the signer sets are as last read. It is false otherwise.

`GET /v1/accounts/:address` adds `network`, `signerChangesEnabled`, `networksWithDifferentSigners` and `proposers`. It does not return signer changes yet.

`GET /v1/accounts` also returns `removed`: the accounts one of your keys was removed from on the network, each with the `publicKey`, the `signerSetAddress` that was removed, the `eventId` of its `alias.removed` row and `removedAt`. It names no transaction yet.

## SDK

| Before                                                                                                                 | After                                                                                   |
| ---------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| `createMultisig`                                                                                                       | `createSignerSet` (proposed)                                                            |
| `getMultisig`                                                                                                          | `getAccount(address, network)`, `getSignerSet` (proposed)                               |
| `acceptMultisigInvite`                                                                                                 | `acceptAccountInvite(address, { network, signature, expiry })`                          |
| `rejectMultisigInvite`                                                                                                 | `rejectAccountInvite(address, { network, signature, expiry })`                          |
| `getMultisigConnections`                                                                                               | `getAccounts(network)`                                                                  |
| `addMultisigProposer`                                                                                                  | `addAccountProposer(address, { network, proposer, signature, expiry })`                 |
| `removeMultisigProposer`                                                                                               | `removeAccountProposer(address, { network, proposer, signature, expiry })`              |
| `getInvitations(publicKey, { showRejected })`                                                                          | `getInvitations(network, { showRejected })`, for every key of the session               |
| `createProposal`                                                                                                       | `createProposal({ network, accountAddress, transactionBytes, signature, description })` |
| `getProposals`                                                                                                         | `getProposals({ accountAddress, network, status, nextCursor, perPage })`                |
| `getProposalByDigest`                                                                                                  | unchanged name, renamed fields                                                          |
| `voteForProposal`                                                                                                      | `voteForProposal(digest, { signature })`                                                |
| `cancelProposal`                                                                                                       | `cancelProposal(digest, { signature })`                                                 |
| `verifyProposalByDigest`                                                                                               | unchanged name: `verifyProposalByDigest(digest)`                                        |
| `verifyProposal(proposalId)`                                                                                           | none; use `verifyProposalByDigest(digest)`                                              |
| `connect`, `disconnect`, `checkAuth`, `registerPublicKey`, `registerPublicKeys`, `registerAddresses`, `getAddressInfo` | unchanged                                                                               |

The `/v1` client is `SagatV1Client` from `@mysten/sagat/v1`. It parses every response with the schemas exported beside it. `findAliasCalls`, exported from `@mysten/sagat`, lists the calls to `0x2::address_alias` in a transaction.

Types: `MultisigMember` becomes `AccountMember`, `MultisigProposer` becomes `AccountProposer`, and `Account`, `AccountDetails`, `AccountList`, `InvitationList`, `ProposalList` and `AliasCall` are new.

The package name may change before the first publish. If it does, this guide will say so here.

## Signed messages

Under `/v1`, accept and reject take two new messages that name the account and carry an expiry: `PersonalMessages.acceptAccountInvitation` and `PersonalMessages.rejectAccountInvitation`. The `expiry` takes the same form as on the proposer routes. Every other text is unchanged, so the proposer routes under `/v1` take the same messages as the legacy ones. Legacy routes keep verifying the old text, except cancel, which already takes only the new text. If you build these strings yourself instead of using `PersonalMessages` from the SDK, update a cancel string now, and the accept and reject strings when you move those calls.

| Purpose           | Before                                                                 | Under `/v1`                                                        |
| ----------------- | ---------------------------------------------------------------------- | ------------------------------------------------------------------ |
| Connect           | `Verifying address ownership until: <expiry>`                          | unchanged                                                          |
| Accept invitation | `Participating in multisig <address>`                                  | `Accepting invitation to account <address>. Valid until: <expiry>` |
| Reject invitation | `Rejecting multisig invitation <address>`                              | `Rejecting invitation to account <address>. Valid until: <expiry>` |
| Add proposer      | `Adding proposer <p> to multisig <address>. Valid until: <expiry>`     | unchanged                                                          |
| Remove proposer   | `Removing proposer <p> from multisig <address>. Valid until: <expiry>` | unchanged                                                          |
| Cancel proposal   | `Cancel proposal <id>`                                                 | `Cancelling proposal <digest> on multisig <address>`               |

## Executing a proposal

Execution still happens in the client. What changed is which keys you combine.

Before, you rebuilt the combined key from `proposal.multisig.members` and combined every signature.

After:

1. Once `proposal.ready` is true, pick a signer set from `proposal.signerSets` whose `currentWeight` is at least its `threshold`.
2. Rebuild the combined key from that set's `members`, in `order`.
3. Combine only the signatures whose public key is in that set, in the same order.
4. Execute, then call `POST /v1/proposals/:digest/verify`. The proposal it returns names the set you used in `executedVia`.

```ts
import { MultiSigPublicKey } from '@mysten/sui/multisig';
import { publicKeyFromSuiBytes } from '@mysten/sui/verify';

const set = proposal.signerSets.find(
	(s) => s.currentWeight >= s.threshold,
);
if (!set)
	throw new Error('No signer set has reached threshold');

const members = [...set.members].sort(
	(a, b) => a.order - b.order,
);

const key = MultiSigPublicKey.fromPublicKeys({
	threshold: set.threshold,
	publicKeys: members.map((m) => ({
		publicKey: publicKeyFromSuiBytes(m.publicKey),
		weight: m.weight,
	})),
});

const signatures = members
	.map((m) =>
		proposal.signatures.find(
			(s) => s.publicKey === m.publicKey,
		),
	)
	.filter(
		(s): s is NonNullable<typeof s> => s !== undefined,
	)
	.map((s) => s.signature);

const combined = key.combinePartialSignatures(signatures);
```

Passing a signature from a key outside the chosen set makes the combination fail. This is the most likely mistake when migrating.

The transaction sender is the account address. It is not the signer set address, and you do not change it.

## Exports

Exported files carry `type` and `version`. Files with `version: 1` keep the old field names and stay readable. New exports are `version: 2` and use the fields in this guide.

## Things that did not change

- Legacy routes. They keep working until their traffic is zero, except for rotated accounts, the stricter input and the new cancel message listed at the top of this guide.
- Authentication, tokens, and cookies. One session works against both route sets.
- Proposal ids and digests. Existing proposals keep both.
- Account addresses. Every existing multisig address is now an account with the same address.
- Signatures already collected on pending proposals.
- Limits on proposers and page sizes.

## New routes for rotation (proposed)

| Route                                                 | Purpose                                          |
| ----------------------------------------------------- | ------------------------------------------------ |
| `POST /v1/accounts/:address/aliases/refresh?network=` | Re-read from chain and return what changed.      |
| `POST /v1/signer-sets` with `forAccount`              | Draft a new signer set for an account.           |
| `GET /v1/accounts/:address/drafts`                    | Drafted signer sets and their invitation status. |

The alias set, with each entry classified, comes with `GET /v1/accounts/:address` as `signerSets`.

## Checklist

- [ ] New SDK installed, or `/v1` prefix added to direct calls
- [ ] `multisigAddress` replaced everywhere
- [ ] Renamed SDK calls and types
- [ ] Vote, cancel and verify called by digest, not by id
- [ ] Accept and reject messages updated, if built by hand
- [ ] Cancel message updated, if built by hand
- [ ] Execution code picks one signer set and filters signatures
- [ ] Any reader of `currentWeight`, `totalWeight`, or `multisig` moved to `signerSets`, of `hasReachedThreshold` to `ready`, and of a numeric `status` to its name
- [ ] Tested against testnet
