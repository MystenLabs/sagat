# Migrating an API integration to the v1 API

_Draft, 2026-09-28, revised 2026-10-14. Written ahead of the release from the design in [account-rotation.md](account-rotation.md). Names marked **proposed** are final only once the release ships; this guide is updated in the same pull request as the code._

_Direction revised 2026-11-17: `/v1` is built per feature and covers the account-scoped routes only, in one SDK package beside the existing client, with every signer set in an account's alias set that the API can identify acting on that network, signed message texts unchanged, and a signer change's signatures withheld until it is ready. Every section below except "Who needs this" predates that: routes, fields, SDK, signed messages, executing a proposal, exports and new routes for rotation. Each is corrected in the pull request that adds its route; until then [account-rotation.md](account-rotation.md) is the reference. The account routes (`/v1/accounts`, `/v1/invitations`) and the proposal routes (`/v1/proposals`) are corrected, and signer changes have their own section, which replaces the proposed new routes for rotation._

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

| Before                                                                   | After                                    | Notes                                                                                                                                                                                                                                               |
| ------------------------------------------------------------------------ | ---------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `POST /multisig`                                                         | `POST /v1/signer-sets`                   | **Proposed.** Creates a composition. Also creates the account with the same address.                                                                                                                                                                |
| `GET /multisig/:address`                                                 | `GET /v1/accounts/:address`              | The account on the network, see "Accounts" below. Open to any key of an acting signer set, whatever its answer.                                                                                                                                     |
|                                                                          | `GET /v1/signer-sets/:address`           | **Proposed.** Returns one composition with its members.                                                                                                                                                                                             |
| `POST /multisig/:address/accept`                                         | `POST /v1/accounts/:address/accept`      | A key's answer to the account, for any key of an acting signer set. Body `signature` and `expiry`, signed with the new accept message. The address must be canonical.                                                                               |
| `POST /multisig/:address/reject`                                         | `POST /v1/accounts/:address/reject`      | As accept, with the new reject message. Rejecting again answers as the first time and records nothing.                                                                                                                                              |
| `POST /multisig/:address/add-proposer`                                   | `POST /v1/accounts/:address/proposers`   | Body `proposer`, `signature` and `expiry`, signed with the same message as before.                                                                                                                                                                  |
| `POST /multisig/:address/remove-proposer`                                | `DELETE /v1/accounts/:address/proposers` | Same body and message as before. Cancels the proposer's pending proposals on the network, never a signer change. Answers `{ removed, cancelledProposals }`: whether this call removed the proposer, and the digests of the proposals it cancelled.  |
| `GET /addresses/connections`                                             | `GET /v1/accounts`                       | Accounts a key of the session has accepted on the network, each once, and the ones a key was removed from.                                                                                                                                          |
| `GET /addresses/invitations/:publicKey`                                  | `GET /v1/invitations`                    | Accounts where a key of the session is in an acting signer set and has not answered. `showRejected=true` lists the rejected ones instead.                                                                                                           |
| `POST /proposals`                                                        | `POST /v1/proposals?network=`            | Body `accountAddress`, `transactionBytes`, `signature`, an optional `description` and, for a signer change, optional `labels`. The address must be canonical; one that is no account gets the 403 a non-signer gets. Answers 201 with the proposal. |
| `GET /proposals`                                                         | `GET /v1/proposals`                      | Query `accountAddress`, `network`, and optional `status`, `nextCursor` and `perPage`. Needs a session.                                                                                                                                              |
| `POST /proposals/:id/vote`                                               | `POST /v1/proposals/:digest/vote`        | Addressed by digest. Body `signature`. Answers with the proposal. A signer change takes signatures only from keys of the set it replaces.                                                                                                           |
| `POST /proposals/:id/cancel`                                             | `POST /v1/proposals/:digest/cancel`      | Addressed by digest. Body `signature`, signed with the same message as before. Answers with the proposal. A signer change only by an accepted signer who stays.                                                                                     |
| `POST /proposals/:id/verify`, `POST /proposals/:digest/verify-by-digest` | `POST /v1/proposals/:digest/verify`      | Addressed by digest, no body, open to anyone. Records `executedVia`. Also looks up a cancelled proposal that calls `0x2::address_alias`. Answers with the proposal.                                                                                 |
| `GET /proposals/digest/:digest`                                          | `GET /v1/proposals/:digest`              | Public. Response changed, see below.                                                                                                                                                                                                                |
| `POST /addresses`, `GET /addresses/:address`                             | `/v1/addresses`, same shape              | **Proposed.**                                                                                                                                                                                                                                       |
| `/auth/*`                                                                | unchanged, shared by both route sets     |                                                                                                                                                                                                                                                     |

Every `/v1` account route takes a required `network` query parameter, such as `?network=mainnet`, and answers for that network only. Each one first reads the account's alias set from the chain again when the last read is older than a minute. When the chain cannot be read, the reads answer from the last read with `signerSetsStale: true`, and accept, reject and the proposer routes are refused with a 503.

The proposal routes follow the same rule for the proposal's account and network. Create, vote and cancel are refused with a 503 when the alias set cannot be read; the list and `GET /v1/proposals/:digest` answer from the last read with `signerSetsStale: true`. The routes addressed by digest take no `network`: the proposal names it. Verify does not check the threshold first. It also looks up a cancelled proposal that calls `0x2::address_alias`: when the chain has it, the proposal takes its on-chain outcome in place of cancelled, with `executedVia`, and otherwise it stays cancelled. After it records a proposal that calls `0x2::address_alias` and succeeded, it reads the account's alias set again. A transaction that calls `0x2::address_alias` is refused with a 400 while another proposal of the account and network that calls it is pending: one at a time per account and network. A pending one whose expiration epoch has passed no longer counts. Who may call each route is the access table in [account-rotation.md](account-rotation.md#signer-resolver).

A `/v1` route’s own errors answer `{ "error": "…" }` as JSON, also a request with no session (401, `Unauthorized`) and a body over the size limit (413, `Payload Too Large`). Three answers come as plain text from the shared middleware: a body that is not valid JSON (400, `Malformed JSON in request body`), a method and path that match no `/v1` route, a wrong method on an existing path included, as there is no 405 (404, `404 Not Found`), and the origin check (403, `Forbidden`), which refuses only a request from an origin that is not allowed when it is not a GET and has a form-like or missing content type. A key in no acting signer set of the account on the network, and an address that is no account, get a 403 with “You are not a signer of this account on this network.” A signer who has not accepted the account, on a route that needs an accepted signer, gets a 403 with “You have not accepted this account.”

Signer changes are described at the end. You do not need them unless you rotate signers.

## Fields

| Where                | Before                                                              | After                                                                                                                                                                                                                                                                                                                                                                                                                                |
| -------------------- | ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Create proposal body | `multisigAddress`                                                   | `accountAddress`. `network` moves to the query.                                                                                                                                                                                                                                                                                                                                                                                      |
| Proposal             | `multisigAddress`                                                   | `accountAddress`                                                                                                                                                                                                                                                                                                                                                                                                                     |
| Proposal             | `multisig.name`                                                     | `accountName`                                                                                                                                                                                                                                                                                                                                                                                                                        |
| Proposal             | `multisig`                                                          | `signerSets`: the signer sets that act for the account on the proposal's network, one for an account that never changed and none or several once its alias set changes, then the original set when it no longer acts there, each with `address`, `threshold`, `members`, `currentWeight`, `acting` and `original`. For a signer change, only the set it replaces, while that set acts, then the original set when it no longer acts. |
| Proposal             | `currentWeight`                                                     | Moved into each element of `signerSets`.                                                                                                                                                                                                                                                                                                                                                                                             |
| Proposal             | `totalWeight`                                                       | Removed, see the note below the table.                                                                                                                                                                                                                                                                                                                                                                                               |
| Proposal             | `id`                                                                | Removed. A proposal is addressed by `digest`.                                                                                                                                                                                                                                                                                                                                                                                        |
| Proposal             | `status`                                                            | A name: `PENDING`, `CANCELLED`, `SUCCESS` or `FAILURE`, as the list's `status` filter takes.                                                                                                                                                                                                                                                                                                                                         |
| Proposal             |                                                                     | `ready`: true when an acting set in `signerSets` has reached its threshold. For a signer change, true once it is ready.                                                                                                                                                                                                                                                                                                              |
| Proposal             | `events`                                                            | `created` and `proposer`, each an audit log event or null, as on the legacy route, and `cancelled`: the proposal’s newest `proposal.cancelled` event, or null. For a signer change that is not ready, `created` comes without the signature in its proof.                                                                                                                                                                            |
| Proposal             | `signatures`                                                        | Each `{ publicKey, signature }`, without `proposalId`. `signature` is null while a signer change that is not ready withholds it, see "Signer changes".                                                                                                                                                                                                                                                                               |
| Proposal             |                                                                     | `executedVia`: the address that signed for the account at execution, as it is, recorded when the proposal is verified. Null until then, or when it could not be read.                                                                                                                                                                                                                                                                |
| Proposal             |                                                                     | `kind`: `transaction`, `alias_call` for a transaction that calls `0x2::address_alias`, or `signer_change`.                                                                                                                                                                                                                                                                                                                           |
| Proposal             |                                                                     | `signerChange`: `{ removes, adds }`, what the API reads of a signer change in the bytes, or null when `kind` is not `signer_change`, see "Signer changes".                                                                                                                                                                                                                                                                           |
| Proposal             |                                                                     | `signerSetsStale`: true when the alias set could not be read from the chain, so `signerSets` are as last read.                                                                                                                                                                                                                                                                                                                       |
| Proposal list        | `data`                                                              | `proposals`, beside `network`, `accountAddress`, `hasNextPage`, `nextCursor` and `perPage`.                                                                                                                                                                                                                                                                                                                                          |
| Vote response        | `hasReachedThreshold`, `currentWeight`                              | The proposal. Read `ready` on it, and `signerSets[].currentWeight` for one tally per set.                                                                                                                                                                                                                                                                                                                                            |
| Connections          | an object of multisigs per public key                               | `accounts`: each account once, sorted by address, and `removed`.                                                                                                                                                                                                                                                                                                                                                                     |
| Invitations          | an array of multisigs                                               | `invitations`: each account once.                                                                                                                                                                                                                                                                                                                                                                                                    |
| Account              | `isVerified`, `threshold`, `members`, `totalMembers`, `totalWeight` | `signerSets` and `signerSetsStale`, see "Accounts" below.                                                                                                                                                                                                                                                                                                                                                                            |
| Account              | `draftedBy`                                                         | `createdBy`                                                                                                                                                                                                                                                                                                                                                                                                                          |
| Member               | `multisigAddress`, `isAccepted`, `isRejected`                       | `answer`: the key's answer to this account, `accepted`, `rejected` or `invited`. Members sit inside their set, so they carry no set address.                                                                                                                                                                                                                                                                                         |
| Member               | `label`                                                             | Unchanged.                                                                                                                                                                                                                                                                                                                                                                                                                           |
| Proposer             | `address`, `addedBy`, `addedAt`, `event`                            | Unchanged.                                                                                                                                                                                                                                                                                                                                                                                                                           |

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

`GET /v1/accounts/:address` adds `network`, `signerChangesEnabled`, `networksWithDifferentSigners`, `proposers`, `signerChanges` and `openSignerChange`. `signerChanges` are the signer changes that succeeded on the network, oldest first, each `{ digest }`, so a client can read each transaction from its own node and follow the path from the original signers. `openSignerChange` is the newest pending signer change, `{ digest }`, or null.

`GET /v1/accounts` also returns `removed`: the accounts one of your keys was removed from on the network, each with the `publicKey`, the `signerSetAddress` that was removed, the `eventId` of its `alias.removed` row, `removedAt` and `transactionDigest`. `transactionDigest` is null unless the last change to the alias object is a signer change the API holds whose note removes that set.

## SDK

| Before                                                                                                                 | After                                                                                           |
| ---------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `createMultisig`                                                                                                       | `createSignerSet` (proposed)                                                                    |
| `getMultisig`                                                                                                          | `getAccount(address, network)`, `getSignerSet` (proposed)                                       |
| `acceptMultisigInvite`                                                                                                 | `acceptAccountInvite(address, { network, signature, expiry })`                                  |
| `rejectMultisigInvite`                                                                                                 | `rejectAccountInvite(address, { network, signature, expiry })`                                  |
| `getMultisigConnections`                                                                                               | `getAccounts(network)`                                                                          |
| `addMultisigProposer`                                                                                                  | `addAccountProposer(address, { network, proposer, signature, expiry })`                         |
| `removeMultisigProposer`                                                                                               | `removeAccountProposer(address, { network, proposer, signature, expiry })`                      |
| `getInvitations(publicKey, { showRejected })`                                                                          | `getInvitations(network, { showRejected })`, for every key of the session                       |
| `createProposal`                                                                                                       | `createProposal({ network, accountAddress, transactionBytes, signature, description, labels })` |
| `getProposals`                                                                                                         | `getProposals({ accountAddress, network, status, nextCursor, perPage })`                        |
| `getProposalByDigest`                                                                                                  | unchanged name, renamed fields                                                                  |
| `voteForProposal`                                                                                                      | `voteForProposal(digest, { signature })`                                                        |
| `cancelProposal`                                                                                                       | `cancelProposal(digest, { signature })`                                                         |
| `verifyProposalByDigest`                                                                                               | unchanged name: `verifyProposalByDigest(digest)`                                                |
| `verifyProposal(proposalId)`                                                                                           | none; use `verifyProposalByDigest(digest)`                                                      |
| `connect`, `disconnect`, `checkAuth`, `registerPublicKey`, `registerPublicKeys`, `registerAddresses`, `getAddressInfo` | unchanged                                                                                       |

The `/v1` client is `SagatV1Client` from `@mysten/sagat/v1`. It parses every response with the schemas exported beside it. `findAliasCalls`, exported from `@mysten/sagat`, lists the calls to `0x2::address_alias` in a transaction. The builders and checks for signer changes are exported beside it, see "Signer changes".

Types: `MultisigMember` becomes `AccountMember`, `MultisigProposer` becomes `AccountProposer`, and `Account`, `AccountDetails`, `AccountList`, `InvitationList`, `ProposalList`, `AliasCall`, `ProposalSignerChange` and `NoteEntry` are new.

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

const signatures = members.flatMap(
	(m) =>
		proposal.signatures.find(
			(s) => s.publicKey === m.publicKey,
		)?.signature ?? [],
);

const combined = key.combinePartialSignatures(signatures);
```

Passing a signature from a key outside the chosen set makes the combination fail. This is the most likely mistake when migrating.

For a signer change, `ready` is true once the change is ready. Until then each `signature` is null, even when the set it replaces has reached its threshold.

The transaction sender is the account address. It is not the signer set address, and you do not change it.

## Exports

Exported files carry `type` and `version`. A composition export (`sagat.multisig-composition`) is still `version: 1`. A proposal export (`sagat.proposal`) is `version: 2`: it drops the proposal id, keeps `digest` and `network`, and keeps the old names `multisigAddress` and `multisig`.

## Things that did not change

- Legacy routes. They keep working until their traffic is zero, except for rotated accounts, the stricter input and the new cancel message listed at the top of this guide, and signer changes, which they never serve.
- Authentication, tokens, and cookies. One session works against both route sets.
- Proposal ids and digests. Existing proposals keep both.
- Account addresses. Every existing multisig address is now an account with the same address.
- Signatures already collected on pending proposals.
- Limits on proposers and page sizes.

## Signer changes

A signer change is a proposal that replaces one acting signer set with another on one network, see [account-rotation.md](account-rotation.md#changing-signers). It has no route of its own: it goes through the proposal routes, and the `/v1` routes read the alias set from the chain again before they decide. The alias set, with each entry classified, comes with `GET /v1/accounts/:address` as `signerSets`.

### Building one

1. Allow signer changes once per network: propose a transaction built with `buildEnable(tx)` and execute it like any proposal. `enable` cannot share a transaction with the first change.
2. Build the change with `buildSignerChange(tx, { account, aliases, oldSet, newSet, known, chain, epoch })`, on a transaction whose sender is the account. `aliases` is the account's alias set from a node you pick, `oldSet` the address of the set being replaced, `newSet` the new composition, `known` every composition you know for the aliases, the old set included, `chain` the network's chain identifier and `epoch` the current epoch. It appends `add` and `remove` in the order the alias set allows, or only `remove` when the new set is already an alias, then the composition note, and an expiration that names the chain and is valid through the end of the next epoch. A change that expired is proposed again. It stays listed as pending, but no longer counts for one at a time.
3. Propose it with `POST /v1/proposals`, signed by an accepted signer of the old set who stays in the new one. `labels` names the new set's keys, in the order of the note. Only keys new to the account are labelled.

### The composition note

The note is a list of pure string inputs that no command uses, each a line of JSON with its fields in a fixed order and `version: 1`. `compositionNote` writes them: the change first, then one input per address in `before` and `after` together, in address order. One of each type:

```text
{"type":"signer_change","version":1,"account":"0x...","before":["0x...","0x..."],"after":["0x...","0x..."]}
{"type":"signer_set","version":1,"address":"0x...","threshold":2,"members":[{"publicKey":"...","weight":1},{"publicKey":"...","weight":1}]}
{"type":"other_signer_set","version":1,"address":"0x..."}
```

A `signer_set` is a composition with its keys in order, and an `other_signer_set` is any other alias, a registered key's own address included. Addresses are normalised, lists are sorted, and public keys are Sui public keys in base64. A note holds no labels or names.

`readCompositionNote(transactionData)` reads the note. It returns null when the transaction calls no alias function or carries no note. It throws a `SignerChangeError`, with a `reason`, when the transaction carries a note but is not a well-formed change: an input that is not exactly what `compositionNote` writes, an input nothing uses, commands other than one `add` and one `remove`, or one `remove`, on the account's alias set, a removed set or added composition missing from the note, or a failure of rule 1 or 2 below.

`checkSignerChange(transactionData, aliases)` applies the four rules and returns the change, with its `oldSet` and `newSets`:

1. The note's account is the transaction's sender.
2. Each signer set in the note rebuilds its stated address.
3. The note's `before` equals `aliases`, the alias set from a node you pick. For an executed change, pass the note's own `before`, since the chain no longer holds that state.
4. The note's `after` equals `aliases` with the transaction's alias calls applied.

`isSignerChangeReady(change, signedKeys)` is true when the keys that signed reach the old set's threshold and signers who stay have signed for the new threshold, by their new weights.

Check the bytes yourself with these before you sign or show a change, and never trust what the API says about one. `signerChange` on a proposal is only the API's reading of the bytes. `SignerChange` from `@mysten/sagat` is the checked change `checkSignerChange` returns; `ProposalSignerChange` from `@mysten/sagat/v1` is that reading.

### What the API does

`POST /v1/proposals` treats alias calls with a composition note as a signer change. It checks the change against the alias set it just read and the signers acting on the network, then writes the new signer set, its members and its link to the account. A composition it already holds is linked as it is. It refuses:

- with a 400: a note that does not check; a change built against an alias set that has changed since; bytes whose expiration does not name the network's chain, or has no last epoch by the end of the next one; an old set the API cannot identify as acting; a change that leaves no set the API can identify; a new composition outside the limits on signers and weights; signers who stay, counting only those who accepted the account, who cannot meet the new threshold; another pending proposal of the account and network that calls `0x2::address_alias`, unless its expiration epoch has passed; and `labels` on any proposal but a change that adds a set;
- with a 403: a proposer who is not an accepted signer of the old set who stays in the new one.

`signerChange` on a proposal holds `removes`, the set the change replaces, and `adds`, the set it adds, or null for a change that only removes. `removes` is null when the note does not check, in which case the change is never ready.

Until the change is ready, each `signature` is null and the proof of the `created` event has no signature. Once it is ready, both come back whole. `signerSets` holds only the set the change replaces, while that set acts.

Only a key of the set the change replaces may vote on it, accepted or not; anyone else gets a 403. While that set acts, only an accepted signer of it who stays in the new one may cancel the change: a key that is not an accepted signer of the account gets the 403 any cancel gives it, and an accepted signer who does not stay gets a 403. Once the set no longer acts, the change can never execute, and any accepted signer may cancel it. Removing a proposer never cancels a signer change.

The legacy routes never serve a signer change, also while it is pending. Create, `GET /proposals/digest/:digest`, vote and cancel answer with a 409 that points at `/v1`, and the list leaves the change out. `verify` and `verify-by-digest` stay open.

## Checklist

- [ ] New SDK installed, or `/v1` prefix added to direct calls
- [ ] `multisigAddress` replaced everywhere
- [ ] Renamed SDK calls and types
- [ ] Vote, cancel and verify called by digest, not by id
- [ ] Accept and reject messages updated, if built by hand
- [ ] Cancel message updated, if built by hand
- [ ] Execution code picks one signer set and filters signatures
- [ ] Signer changes checked with the SDK before signing or showing them, if you rotate signers
- [ ] Any reader of `currentWeight`, `totalWeight`, or `multisig` moved to `signerSets`, of `hasReachedThreshold` to `ready`, and of a numeric `status` to its name
- [ ] Tested against testnet
