# Migrating an API integration to the v1 API

_Draft, 2026-09-28, revised 2026-10-14. Written ahead of the release from the design in [account-rotation.md](account-rotation.md). Names marked **proposed** are final only once the release ships; this guide is updated in the same pull request as the code._

## Who needs this

Anyone calling the Sagat API directly or through the SDK from the repository: scripts, CI jobs, the Rust client.

The web app needs nothing from you. It updates with the release.

**Nothing breaks on release day.** The routes you use today keep working, frozen, on top of the new schema. The new API lives under `/v1`. The session cookie and script token are shared, so you can move one call at a time.

Two things to plan for:

- **Legacy routes refuse accounts that have rotated signers.** They return an error pointing at `/v1`. Two exceptions: `verify` and `verify-by-digest` still work, so a proposal that rotated the account can be verified, and the connection and invitation listings (`GET /addresses/connections`, `GET /addresses/invitations/:publicKey`) leave rotated accounts out silently rather than failing. A rotated account missing from a listing is not deleted and your membership is not lost; it is only visible under `/v1`. If your team never rotates, you never see any of this.
- **Legacy routes are removed once their traffic reaches zero.** There is no fixed date. Migrating early keeps you off the last-user list.

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

| Before                                       | After (proposed)                                   | Notes                                                                                                |
| -------------------------------------------- | -------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `POST /multisig`                             | `POST /v1/signer-sets`                             | Creates a composition. Also creates the account with the same address, unless `forAccount` is given. |
| `GET /multisig/:address`                     | `GET /v1/accounts/:address`                        | Returns the account with its signer sets, each with `validOn`, and its alias set per network.        |
|                                              | `GET /v1/signer-sets/:address`                     | Returns one composition with its members, without key labels, and its `links` to accounts.           |
| `POST /multisig/:address/accept`             | `POST /v1/signer-sets/:address/accept`             |                                                                                                      |
| `POST /multisig/:address/reject`             | `POST /v1/signer-sets/:address/reject`             |                                                                                                      |
| `POST /multisig/:address/add-proposer`       | `POST /v1/accounts/:address/proposers`             |                                                                                                      |
| `POST /multisig/:address/remove-proposer`    | `DELETE /v1/accounts/:address/proposers/:proposer` |                                                                                                      |
| `GET /addresses/connections`                 | `GET /v1/accounts`                                 | Accounts you can sign for: one of your keys accepted in a signer set valid on some network.          |
| `GET /addresses/invitations/:publicKey`      | `GET /v1/signer-sets/invitations/:publicKey`       | One item per account and signer set, with `accountAddress` and `accountName`.                        |
| `POST /proposals`                            | `POST /v1/proposals`                               | Body field renamed, see below.                                                                       |
| `GET /proposals`                             | `GET /v1/proposals`                                | Query parameter `multisigAddress` becomes `accountAddress`. Items carry `signerSets`.                |
| `POST /proposals/:id/vote`                   | `POST /v1/proposals/:id/vote`                      | Response changed, see below.                                                                         |
| `POST /proposals/:id/cancel`                 | `POST /v1/proposals/:id/cancel`                    |                                                                                                      |
| `POST /proposals/:id/verify`                 | `POST /v1/proposals/:id/verify`                    | No threshold check: reads the chain and records `executedVia`.                                       |
| `POST /proposals/:digest/verify-by-digest`   | `POST /v1/proposals/:digest/verify-by-digest`      | Same as verify.                                                                                      |
| `GET /proposals/digest/:digest`              | `GET /v1/proposals/digest/:digest`                 | Response changed, see below.                                                                         |
| `POST /addresses`, `GET /addresses/:address` | `/v1/addresses`, same shape                        |                                                                                                      |
| `/auth/*`                                    | unchanged, shared by both route sets               |                                                                                                      |

New routes for rotation are listed at the end. You do not need them unless you rotate signers.

## Fields

| Where                | Before                         | After                                                                  |
| -------------------- | ------------------------------ | ---------------------------------------------------------------------- |
| Create proposal body | `multisigAddress`              | `accountAddress`                                                       |
| Proposal             | `multisigAddress`              | `accountAddress`                                                       |
| Public proposal      | `currentWeight`, `totalWeight` | Removed, see the note below the table.                                 |
| Proposal             |                                | `executedVia`: address that signed at execution, or null. See below.   |
| Public proposal      | `multisig`                     | Removed. Use `signerSets`.                                             |
| Public proposal      | `signatures`                   | Still every signature collected, by public key.                        |
| Vote response        | `hasReachedThreshold`          | Still present. True when **any** signer set has reached its threshold. |
| Vote response        |                                | `readySignerSets`: addresses of the sets that reached threshold.       |
| Member               | `multisigAddress`              | `signerSetAddress`                                                     |
| Proposer             | `multisigAddress`              | `accountAddress`                                                       |
| Proposal list item   |                                | `signerSets`, as on the public proposal.                               |
| Account signer set   |                                | `validOn`: the networks where it can sign for the account.             |
| Account              |                                | `aliases`: the alias set per network, as last read from chain.         |
| Invitation           |                                | `accountAddress`, `accountName`: the account it is drafted for.        |

The legacy `totalWeight` on `GET /proposals/digest/:digest` is the multisig's threshold, not the sum of member weights; the name was misleading. To check progress, compare `signerSets[].currentWeight` with `signerSets[].threshold`, or use `signerSets[].hasReachedThreshold`. `signerSets[].totalWeight` is the sum of member weights.

Shape of `signerSets` on a proposal:

```json
{
	"signerSets": [
		{
			"address": "0x...",
			"label": "Operations",
			"threshold": 2,
			"totalWeight": 3,
			"currentWeight": 2,
			"hasReachedThreshold": true,
			"members": [
				{
					"publicKey": "...",
					"weight": 1,
					"order": 0,
					"hasSigned": true
				}
			]
		}
	]
}
```

Only signer sets that are valid for the account on the proposal's network are listed. A signature from a key in none of them is kept in `signatures` but counts nowhere. `label` belongs to the account's entry for that signer set, or is null; the same signer set can have a different label in another account. Members here carry no `label`: key labels (0010) are returned only on authenticated member listings, never on proposal shapes or public lookups. Each item of `GET /v1/proposals` has the same `signerSets`.

An account lists every signer set linked to it, drafts and retired sets included, and says where each is valid:

```json
{
	"signerSets": [
		{
			"address": "0x...",
			"label": "Operations",
			"status": "verified",
			"validOn": ["mainnet", "testnet"],
			"members": []
		}
	],
	"aliases": [
		{
			"network": "mainnet",
			"addresses": ["0x..."],
			"observedAt": null
		}
	]
}
```

A signer set is valid on a network when its address is in the account's alias set there. An account that never rotated has the alias set `{account}` on every network (`observedAt` is null), so its original signer set is valid everywhere. A draft has an empty `validOn`. `aliases` can hold addresses that are not linked signer sets: single keys, or sets added outside Sagat.

Access follows `validOn`. Creating, voting, cancelling and listing need an accepted key in a set valid on the proposal's network. Reading the account, changing proposers and verifying need one valid on any network. Members of a draft only see their invitation.

## SDK

| Before                                                                                                                                   | After (proposed)                |
| ---------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------- |
| `createMultisig`                                                                                                                         | `createSignerSet`               |
| `getMultisig`                                                                                                                            | `getAccount`, `getSignerSet`    |
| `acceptMultisigInvite`                                                                                                                   | `acceptSignerSetInvite`         |
| `rejectMultisigInvite`                                                                                                                   | `rejectSignerSetInvite`         |
| `getMultisigConnections`                                                                                                                 | `getAccounts`                   |
| `addMultisigProposer`                                                                                                                    | `addAccountProposer`            |
| `removeMultisigProposer`                                                                                                                 | `removeAccountProposer`         |
| `getInvitations`                                                                                                                         | unchanged                       |
| `createProposal`, `getProposals`, `getProposalByDigest`, `voteForProposal`, `cancelProposal`, `verifyProposal`, `verifyProposalByDigest` | unchanged names, renamed fields |
| `connect`, `disconnect`, `checkAuth`, `registerPublicKey`, `registerPublicKeys`, `registerAddresses`, `getAddressInfo`                   | unchanged                       |

Types: `Multisig` becomes `SignerSet`, `MultisigWithMembers` becomes `SignerSetWithMembers`, `MultisigMember` becomes `SignerSetMember`, `MultisigProposer` becomes `AccountProposer`. `Account` is new.

The package name may change before the first publish. If it does, this guide will say so here.

## Signed messages

Under `/v1`, messages that name the account changed. Legacy routes keep verifying the old text. If you build these strings yourself instead of using `PersonalMessages` from the SDK, update them when you move the call.

| Purpose           | Before                                                                 | After (proposed)                                                      |
| ----------------- | ---------------------------------------------------------------------- | --------------------------------------------------------------------- |
| Connect           | `Verifying address ownership until: <expiry>`                          | unchanged                                                             |
| Accept invitation | `Participating in multisig <address>`                                  | unchanged. The address is the signer set.                             |
| Reject invitation | `Rejecting multisig invitation <address>`                              | unchanged                                                             |
| Add proposer      | `Adding proposer <p> to multisig <address>. Valid until: <expiry>`     | `Adding proposer <p> to account <address>. Valid until: <expiry>`     |
| Remove proposer   | `Removing proposer <p> from multisig <address>. Valid until: <expiry>` | `Removing proposer <p> from account <address>. Valid until: <expiry>` |
| Cancel proposal   | `Cancel proposal <id>`                                                 | unchanged                                                             |

## Executing a proposal

Execution still happens in the client. What changed is which keys you combine.

Before, you rebuilt the combined key from `proposal.multisig.members` and combined every signature.

After:

1. Pick a signer set from `proposal.signerSets` where `hasReachedThreshold` is true.
2. Rebuild the combined key from that set's `members`, in `order`.
3. Combine only the signatures whose public key is in that set, in the same order.
4. Execute, then call verify as before. Verify reads the executed transaction and records the address that signed it in `executedVia`: the signer set you used, or a single key alias.

With the SDK, `combineSignerSetSignatures` does steps 2 and 3, and `signerSetPublicKey` returns the set's key on its own:

```ts
import { combineSignerSetSignatures } from '@mysten/sagat';

const set = proposal.signerSets.find(
	(s) => s.hasReachedThreshold,
);
if (!set)
	throw new Error('No signer set has reached threshold');

const combined = combineSignerSetSignatures(
	set,
	proposal.signatures,
);
```

Calling the API directly, the same steps by hand:

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

- Legacy routes. They keep working until their traffic is zero, except for rotated accounts.
- Authentication, tokens, and cookies. One session works against both route sets.
- Proposal ids and digests. Existing proposals keep both.
- Account addresses. Every existing multisig address is now an account with the same address.
- Signatures already collected on pending proposals.
- Limits on proposers and page sizes.

## New routes for rotation (proposed)

| Route                                                 | Purpose                                                            |
| ----------------------------------------------------- | ------------------------------------------------------------------ |
| `GET /v1/accounts/:address/aliases?network=`          | The alias set as last read from chain, with each entry classified. |
| `POST /v1/accounts/:address/aliases/refresh?network=` | Re-read from chain and return what changed.                        |
| `POST /v1/signer-sets` with `forAccount`              | Draft a new signer set for an account.                             |
| `GET /v1/accounts/:address/drafts`                    | Drafted signer sets and their invitation status.                   |

## Checklist

- [ ] New SDK installed, or `/v1` prefix added to direct calls
- [ ] `multisigAddress` replaced everywhere
- [ ] Renamed SDK calls and types
- [ ] Proposer messages updated, if built by hand
- [ ] Execution code picks one signer set and filters signatures
- [ ] Any reader of `currentWeight`, `totalWeight`, or `multisig` moved to `signerSets`
- [ ] Tested against testnet
