# Migrating an API integration to the v1 API

_Draft, 2026-09-28, revised 2026-10-14. Written ahead of the release from the design in [account-rotation.md](account-rotation.md). Names marked **proposed** are final only once the release ships; this guide is updated in the same pull request as the code._

_Direction revised 2026-11-17: `/v1` is built per feature and covers the account-scoped routes only, in one SDK package beside the existing client, with every signer set in an account's alias set that the API can identify acting on that network, signed message texts unchanged, and a signer change's signatures withheld until it is ready. Every section below except "Who needs this" predates that: routes, fields, SDK, signed messages, executing a proposal, exports and new routes for rotation. Each is corrected in the pull request that adds its route; until then [account-rotation.md](account-rotation.md) is the reference. The account routes (`/v1/accounts`, `/v1/invitations`) are corrected._

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

| Before                                       | After                                         | Notes                                                                                                                                                                 |
| -------------------------------------------- | --------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `POST /multisig`                             | `POST /v1/signer-sets`                        | **Proposed.** Creates a composition. Also creates the account with the same address, unless `forAccount` is given.                                                    |
| `GET /multisig/:address`                     | `GET /v1/accounts/:address`                   | The account on the network, see "Accounts" below. Open to any key of an acting signer set, accepted or invited.                                                       |
|                                              | `GET /v1/signer-sets/:address`                | **Proposed.** Returns one composition with its members.                                                                                                               |
| `POST /multisig/:address/accept`             | `POST /v1/accounts/:address/accept`           | A key's answer to the account, for any key of an acting signer set. Body `signature` and `expiry`, signed with the new accept message. The address must be canonical. |
| `POST /multisig/:address/reject`             | `POST /v1/accounts/:address/reject`           | As accept, with the new reject message.                                                                                                                               |
| `POST /multisig/:address/add-proposer`       | `POST /v1/accounts/:address/proposers`        | Body `proposer`, `signature` and `expiry`, signed with the same message as before.                                                                                    |
| `POST /multisig/:address/remove-proposer`    | `DELETE /v1/accounts/:address/proposers`      | Same body and message as before. Cancels the proposer's pending proposals on the network.                                                                             |
| `GET /addresses/connections`                 | `GET /v1/accounts`                            | Accounts a key of the session has accepted on the network, each once, and the ones a key was removed from.                                                            |
| `GET /addresses/invitations/:publicKey`      | `GET /v1/invitations`                         | Accounts where a key of the session is in an acting signer set and has not answered. `showRejected=true` lists the rejected ones instead.                             |
| `POST /proposals`                            | `POST /v1/proposals`                          | **Proposed.** Body field renamed, see below.                                                                                                                          |
| `GET /proposals`                             | `GET /v1/proposals`                           | **Proposed.** Query parameter `multisigAddress` becomes `accountAddress`.                                                                                             |
| `POST /proposals/:id/vote`                   | `POST /v1/proposals/:id/vote`                 | **Proposed.** Response changed, see below.                                                                                                                            |
| `POST /proposals/:id/cancel`                 | `POST /v1/proposals/:id/cancel`               | **Proposed.**                                                                                                                                                         |
| `POST /proposals/:id/verify`                 | `POST /v1/proposals/:id/verify`               | **Proposed.**                                                                                                                                                         |
| `POST /proposals/:digest/verify-by-digest`   | `POST /v1/proposals/:digest/verify-by-digest` | **Proposed.**                                                                                                                                                         |
| `GET /proposals/digest/:digest`              | `GET /v1/proposals/:digest`                   | Response changed, see below.                                                                                                                                          |
| `POST /addresses`, `GET /addresses/:address` | `/v1/addresses`, same shape                   | **Proposed.**                                                                                                                                                         |
| `/auth/*`                                    | unchanged, shared by both route sets          |                                                                                                                                                                       |

Every `/v1` account route takes a required `network` query parameter, such as `?network=mainnet`, and answers for that network only. Each one first reads the account's alias set from the chain again when the last read is older than a minute. When the chain cannot be read, the reads answer from the last read with `signersChecked: false`, and accept, reject and the proposer routes are refused with a 503.

New routes for rotation are listed at the end. You do not need them unless you rotate signers.

## Fields

| Where                | Before                                                              | After                                                                                                                                                                                                                                                           |
| -------------------- | ------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Create proposal body | `multisigAddress`                                                   | `accountAddress`                                                                                                                                                                                                                                                |
| Proposal             | `multisigAddress`                                                   | `accountAddress`                                                                                                                                                                                                                                                |
| Public proposal      | `multisigAddress`                                                   | `accountAddress`                                                                                                                                                                                                                                                |
| Public proposal      | `multisig.name`                                                     | `accountName`                                                                                                                                                                                                                                                   |
| Public proposal      | `multisig`                                                          | `signerSets`: the signer sets that act for the account on the proposal's network, one for an account that never changed and none or several once its alias set changes, each with `address`, `threshold`, `members`, `currentWeight` and `hasReachedThreshold`. |
| Public proposal      | `currentWeight`                                                     | Moved into each element of `signerSets`.                                                                                                                                                                                                                        |
| Public proposal      | `totalWeight`                                                       | Removed, see the note below the table.                                                                                                                                                                                                                          |
| Public proposal      |                                                                     | `hasReachedThreshold`: true when a set in `signerSets` has reached its threshold.                                                                                                                                                                               |
| Public proposal      | `events`                                                            | Unchanged: `created` and `proposer`, each an audit log event or null, as on the legacy route.                                                                                                                                                                   |
| Proposal             |                                                                     | `executedVia`: address of the signer set used at execution, or null.                                                                                                                                                                                            |
| Public proposal      | `signatures`                                                        | Unchanged.                                                                                                                                                                                                                                                      |
| Vote response        | `hasReachedThreshold`                                               | Still present. True when **any** signer set has reached its threshold.                                                                                                                                                                                          |
| Vote response        |                                                                     | `readySignerSets`: addresses of the sets that reached threshold.                                                                                                                                                                                                |
| Vote response        | `currentWeight`                                                     | Removed. Read `signerSets[].currentWeight` on the proposal; one tally per set.                                                                                                                                                                                  |
| Connections          | an object of multisigs per public key                               | `accounts`: each account once, sorted by address, and `removed`.                                                                                                                                                                                                |
| Invitations          | an array of multisigs                                               | `invitations`: each account once.                                                                                                                                                                                                                               |
| Account              | `isVerified`, `threshold`, `members`, `totalMembers`, `totalWeight` | `originalSignerSet`, `signerSets`, `otherSignerSets` and `signersChecked`, see "Accounts" below.                                                                                                                                                                |
| Account              | `draftedBy`                                                         | `createdBy`                                                                                                                                                                                                                                                     |
| Member               | `multisigAddress`, `isAccepted`, `isRejected`                       | `answer`: the key's answer to this account, `accepted`, `rejected` or `invited`. Members sit inside their set, so they carry no set address.                                                                                                                    |
| Member               | `label`                                                             | Unchanged.                                                                                                                                                                                                                                                      |
| Proposer             | `address`, `addedBy`, `addedAt`, `event`                            | Unchanged.                                                                                                                                                                                                                                                      |

The legacy `totalWeight` on `GET /proposals/digest/:digest` is the multisig's threshold, not the sum of member weights; the name was misleading. To check progress, compare `signerSets[].currentWeight` with `signerSets[].threshold`, or use `hasReachedThreshold`.

Shape of `signerSets` on a public proposal:

```json
{
	"hasReachedThreshold": false,
	"signerSets": [
		{
			"address": "0x...",
			"threshold": 2,
			"currentWeight": 1,
			"hasReachedThreshold": false,
			"members": [
				{
					"publicKey": "...",
					"weight": 1,
					"order": 0
				}
			]
		}
	]
}
```

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
	"signersChecked": true
}
```

- `signerSets` has one entry per signer set. The first is the original set, the one at the account's address, which the address is derived from. It is always returned, also on a network where it no longer acts. After it come the other addresses in the alias set on the network. For an account that never changed there is one entry.
- An entry is a composition the API holds (`kind: "signer_set"`) or an address the API cannot identify (`kind: "unknown"`), which carries only `address` and can sign for the account.
- `acting` is true when the set is in the alias set on the network, so it is false only for the original set once it was removed there.
- `original` is true for that first entry and false for the others. It is a convenience: the address is what identifies the original set.
- Each member carries `answer`, the key's answer to this account, and `label`, the account's name for the key or null.
- `signersChecked` is false when the alias set could not be read from the chain, so the signer sets are as last read.

`GET /v1/accounts/:address` adds `network`, `signerChangesAllowed`, `networksWithDifferentSigners` and `proposers`. It does not return signer changes yet.

`GET /v1/accounts` also returns `removed`: the accounts one of your keys was removed from on the network, each with the `publicKey`, the `signerSetAddress` that was removed, the `eventId` of its `alias.removed` row and `removedAt`. It names no transaction yet.

## SDK

| Before                                                                                                                 | After                                                                      |
| ---------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| `createMultisig`                                                                                                       | `createSignerSet` (proposed)                                               |
| `getMultisig`                                                                                                          | `getAccount(address, network)`, `getSignerSet` (proposed)                  |
| `acceptMultisigInvite`                                                                                                 | `acceptAccountInvite(address, { network, signature, expiry })`             |
| `rejectMultisigInvite`                                                                                                 | `rejectAccountInvite(address, { network, signature, expiry })`             |
| `getMultisigConnections`                                                                                               | `getAccounts(network)`                                                     |
| `addMultisigProposer`                                                                                                  | `addAccountProposer(address, { network, proposer, signature, expiry })`    |
| `removeMultisigProposer`                                                                                               | `removeAccountProposer(address, { network, proposer, signature, expiry })` |
| `getInvitations(publicKey, { showRejected })`                                                                          | `getInvitations(network, { showRejected })`, for every key of the session  |
| `getProposalByDigest`                                                                                                  | unchanged name, renamed fields                                             |
| `createProposal`, `getProposals`, `voteForProposal`, `cancelProposal`, `verifyProposal`, `verifyProposalByDigest`      | unchanged names, renamed fields (proposed)                                 |
| `connect`, `disconnect`, `checkAuth`, `registerPublicKey`, `registerPublicKeys`, `registerAddresses`, `getAddressInfo` | unchanged                                                                  |

The `/v1` client is `SagatV1Client` from `@mysten/sagat/v1`. It parses every response with the schemas exported beside it.

Types (proposed): `Multisig` becomes `SignerSet`, `MultisigWithMembers` becomes `SignerSetWithMembers`. Shipped: `MultisigMember` becomes `AccountMember`, `MultisigProposer` becomes `AccountProposer`, and `Account`, `AccountDetails`, `AccountList` and `InvitationList` are new.

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

1. Pick a signer set from `proposal.signerSets` where `hasReachedThreshold` is true.
2. Rebuild the combined key from that set's `members`, in `order`.
3. Combine only the signatures whose public key is in that set, in the same order.
4. Execute, then call verify as before.

```ts
import { MultiSigPublicKey } from '@mysten/sui/multisig';
import { publicKeyFromSuiBytes } from '@mysten/sui/verify';

const set = proposal.signerSets.find(
	(s) => s.hasReachedThreshold,
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

The alias set, with each entry classified, comes with `GET /v1/accounts/:address` as `signerSets` and `otherSignerSets`.

## Checklist

- [ ] New SDK installed, or `/v1` prefix added to direct calls
- [ ] `multisigAddress` replaced everywhere
- [ ] Renamed SDK calls and types
- [ ] Accept and reject messages updated, if built by hand
- [ ] Cancel message updated, if built by hand
- [ ] Execution code picks one signer set and filters signatures
- [ ] Any reader of `currentWeight`, `totalWeight`, or `multisig` moved to `signerSets`
- [ ] Tested against testnet
