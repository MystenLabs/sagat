# Address aliases on Sui: what they are and what they mean for Sagat

_Research note, 2026-09-13. Status: early research, not a design._

## TL;DR

- Sui address aliases are **live on mainnet** (mainnet v1.68.1, protocol version 118). Every address has an alias set; by default `{self}`. A transaction whose `sender` is `A` is valid if it carries a signature from **any** address in `aliases(A)`. Same rule for `gas_owner`.
- The alias set is controlled through `sui::address_alias` (`enable`, `add`, `remove`, `replace_all`). Max 8 aliases, min 1, and the calls must be **top-level PTB commands** (cannot be wrapped by other Move code).
- Because a multisig address is just an address, aliases give us three flows that no other Sui multisig product has today:
  1. **Member rotation without changing the address**: multisig `M` adds the address of a new composition `M'` as an alias, then optionally removes itself.
  2. **Upgrade a plain account to a multisig**: address `A` (a keypair) adds multisig `M` as alias. `A` keeps every object, SuiNS name, and integration it already has, but is now controlled by the multisig.
  3. **Recovery / break-glass**: a multisig keeps a cold recovery key as an alias, or a plain account keeps a multisig as a recovery alias.
- The TypeScript SDK (v2.33.1, which the app uses) has **no client helpers** for aliases. Only the generated gRPC, JSON-RPC and BCS types know about the end-of-epoch `AddressAliasStateCreate` transaction and the `address_aliases_versions` field in checkpoint contents. Reading and writing aliases is on us.

## Protocol facts

| Item              | Value                                                                                                                                             |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| Singleton         | `AddressAliasState` shared object at `0xa`                                                                                                        |
| Per-address state | `AddressAliases { id: UID, aliases: VecSet<address> }`, a **derived object** with parent `0xa` and key `AliasKey { address }`                     |
| Module            | `sui::address_alias`                                                                                                                              |
| Limits            | `MAX_ALIASES = 8`, cannot remove the last alias                                                                                                   |
| Errors            | `ENoSuchAlias`, `EAliasAlreadyExists`, `ECannotRemoveLastAlias`, `ETooManyAliases`                                                                |
| Verification      | For `sender` and `gas_owner`, one signature from an address in the respective alias set. `TxContext::sender` is still the sender, not the signer. |
| Checkpoint record | `CheckpointContents.address_aliases_versions` stores the `AddressAliases` object version used to verify each signature (contents version >= 2)    |

Move API (all take the sender from `TxContext`; the object is the sender's own `AddressAliases`):

```text
enable(state: &mut AddressAliasState, ctx)          -- creates AddressAliases for sender, initial set {sender}
add(aliases: &mut AddressAliases, alias: address)
remove(aliases: &mut AddressAliases, alias: address)
replace_all(aliases: &mut AddressAliases, new: vector<address>)
```

CLI reference from the docs:

```bash
sui client ptb --move-call sui::address_alias::enable @0xa --gas-budget 50000000
sui client ptb --move-call sui::address_alias::add @<ALIASES_OBJECT_ID> @<ADDRESS> --gas-budget 50000000
```

## How to read the alias set from the app or API

There is no dedicated RPC. The object id is deterministic, so we can compute it and fetch the object:

```ts
import { deriveObjectID } from '@mysten/sui/utils';
import { bcs } from '@mysten/sui/bcs';

const aliasesId = deriveObjectID(
	'0xa',
	'0x2::address_alias::AliasKey',
	bcs.Address.serialize(address).toBytes(),
);
// then client.getObject({ objectId: aliasesId }) and decode
// AddressAliases { id, aliases: VecSet<address> } from BCS.
```

To verify before building on it: `deriveObjectID` wraps the key type as `0x2::derived_object::DerivedObjectKey<AliasKey>` internally, which matches how `derived_object` derives ids. A spike should confirm against a testnet address that has called `enable`.

If the object does not exist, the address has never called `enable` and its alias set is `{self}`.

## What changes for Sagat

Today Sagat's identity model is **address == composition**: a multisig row is keyed by the combined address, members are the public keys, the app rebuilds `MultiSigPublicKey` from the members to combine signatures, and the API checks membership by public key.

With aliases the model becomes **account address + one or more signer sets**:

- A Sagat "account" is the on-chain address that owns the assets (`M`, or a plain address `A`).
- A "signer set" is a composition (public keys, weights, threshold) whose derived address is in `aliases(account)`. The account's own composition is the default signer set when it is still an alias of itself.
- A proposal sets `sender = account`. Signatures are collected against a chosen signer set. Execution combines partial signatures with that signer set's `MultiSigPublicKey`. The sender field is untouched.

Concrete implications:

1. **Schema**: `multisigs` needs to split into `accounts` (address, name) and `signer_sets` (composition, derived address, `is_alias_of`). Proposals reference the account and record which signer set is being used. Superseded: [account-rotation.md](../account-rotation.md) uses `account_aliases` and `account_signer_sets` instead of `signer_sets.is_alias_of`.
2. **API validation**: `createProposal` and `vote` must accept a signature from a member of any signer set that is currently an alias of the account. Membership checks move from "is pubkey in this multisig" to "is pubkey in a signer set that is an alias of this account".
3. **Alias state must be read on-chain**, not trusted from the DB. Aliases can be changed by a transaction that did not go through Sagat. The API should re-read `aliases(account)` on proposal creation, on vote, and before execution, and cache it with a short TTL.
4. **Pending proposals can go stale**. If the alias set changes after signatures are collected, a signed proposal may no longer verify. Rotation must either drain pending proposals first or mark them as "needs re-signing".
5. **Wallets already sign with `sender != connected address`** for the current multisig flow, so alias signing needs nothing new from wallets.
6. **Gas owner**: sponsored proposals become simpler, since the gas owner's alias set is checked independently. Worth noting for a later "Sagat pays gas" feature.
7. **Safety rails in the UI**: a lockout means losing every controllable alias, not removing the original address. `replace_all([M'])` drops `M` but keeps the account controllable for as long as `M'` is controlled; a set with no alias whose keys anyone holds locks the account out permanently. Every rotation flow must dry-run, show the resulting alias set, and refuse to submit a set that leaves no controllable alias unless the user explicitly acknowledges it.

## Suggested phases

| Phase                     | Deliverable                                                                                                                                                                                 | Notes                                                                                       |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| 0. Spike (1 to 2 days)    | Testnet script that enables aliases on a multisig, adds a second composition, signs a tx from the new composition with `sender = M`, executes. Confirm object id derivation and BCS decode. | Unblocks everything else; proves the protocol behaves as documented for multisig addresses. |
| 1. Read-only              | Overview tab shows the account's alias set, flags whether the account is still its own alias, warns if aliases exist that Sagat does not know.                                              | Low risk, immediately useful for security review of existing multisigs.                     |
| 2. Data model             | Accounts + signer sets split, migration for existing rows (every existing multisig becomes an account with one signer set equal to itself).                                                 | Prerequisite for 3 and 4.                                                                   |
| 3. Rotation wizard        | Propose new composition, invite members, then build the `add` PTB as a normal proposal, then optional `remove(old)`. Handles pending proposals.                                             | The headline feature.                                                                       |
| 4. Import a plain account | Connect wallet, create a multisig composition, propose `enable` + `add(M)` from the plain account (single signature), then the account shows up in Sagat as multisig-controlled.            | Big onboarding unlock: teams keep their existing addresses.                                 |
| 5. Recovery alias         | Add a recovery address (cold key or another multisig), with clear display and removal flow.                                                                                                 | Optional; ties into notifications.                                                          |

## Open questions

- Does the wallet-standard `signTransaction` path in the Slush wallet or Ledger app show the `sender` mismatch as a warning? Worth checking before phase 3 because it affects UX copy.
- How do explorers display alias-signed transactions today? Affects how we explain "signed by" in the proposal detail page.
- Should Sagat allow an account to have more than one active signer set at a time (each a separate alias), or enforce exactly one and treat extra aliases as recovery-only? Simpler to enforce one active set in v1.
- Ordering constraint: alias modifications must be top-level PTB commands. The proposal builder needs to reject wrapping them in `moveCall` helpers that add extra commands around them.

## Sources

- Sui docs, Address Aliases: https://docs.sui.io/develop/transactions/transaction-auth/address-aliases
- Sui framework reference, `sui::address_alias`: https://docs.sui.io/references/framework/sui_sui/address_alias
- Move source: https://github.com/MystenLabs/sui/blob/main/crates/sui-framework/packages/sui-framework/sources/address_alias.move
- Mainnet v1.68.1 release notes (protocol 118, aliases enabled): https://github.com/MystenLabs/sui/releases/tag/mainnet-v1.68.1
- SDK evidence: `@mysten/sui@2.16.0` gRPC proto `checkpoint_contents` (`address_aliases_versions`), `transaction` (`ADDRESS_ALIAS_STATE_CREATE`), and `utils/derived-objects` (`deriveObjectID`).

## Spike results (2026-10-14)

Run on localnet: `sui` 1.81.1 (`1.81.1-e04cf9aa915c`), protocol version 138, feature flag `address_aliases = true`. Regression suite: `api/test/address-aliases.test.ts` (`cd api && bun test address-aliases`, needs a running localnet, no database). Helpers: `api/src/utils/aliases.ts`. Both are added in #95, the next PR of this stack. The suite passed 9 runs in a row after the polling fix described under "Test environment".

Setup: `M` = 2-of-3 `{k1, k2, k3}`, `M'` = 2-of-3 `{k2, k3, k4}`, `M''` = 1-of-2 `{k5, k6}`, `K` = single ed25519 key `k7`.

| Step                                   | Result    | Evidence                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| -------------------------------------- | --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1. `enable` then `add(M')`, id and BCS | CONFIRMED | Created object id equals `deriveObjectID('0xa', '0x2::address_alias::AliasKey', bcs.Address(M))`, type `0x2::address_alias::AddressAliases`. Decoded set after `add` is `[M, M']`, in insertion order. `enable` and `add` **cannot share a PTB**: the object does not exist when the PTB is built (`Object 0x… not found`), and `enable` returns nothing.                                                                                         |
| 2. `M'` signs for sender `M`           | CONFIRMED | Transfer with `sender = M` and a combined `M'` signature executes. `transaction.sender` and `gasData.owner` are `M`, and the gas coin stays owned by `M`. `M`'s own composition executes the next transaction at the same alias set version. Partials from `k2` and `k3` over one set of bytes combine into a valid signature for both `M` and `M'`. Bytes cannot be executed twice, so the "same bytes on chain twice" variant cannot be tested. |
| 3. One hop                             | CONFIRMED | `M'` aliases `{M', M''}`. `M''` signs for `M'` (control, succeeds). `M''` signing for `M` is rejected before execution: `Invalid user signature: Required Signature from <M> or <M'> is absent ["<M''>"]`.                                                                                                                                                                                                                                        |
| 4. `M'` removes `M`                    | CONFIRMED | Set becomes `[M']`. `M` signing for itself is rejected: `Invalid user signature: Required Signature from <M'> is absent ["<M>"]`. `M'` still signs for `M`.                                                                                                                                                                                                                                                                                       |
| 5. Limits and invalid changes          | CONFIRMED | Aborts surface as Move aborts in `address_alias` (see table below). They were observed in the builder's dry run, not executed on chain. Another sender passing `M`'s alias object is rejected at input checking (owner mismatch).                                                                                                                                                                                                                 |
| 6. Single key alias                    | CONFIRMED | `add(K)` (signed by `M'`), then `K` alone signs a transfer with `sender = M`. `K` was never funded and gas is paid by `M`. Six `add` commands in one PTB work (set reaches 8). A 9th aborts with `ETooManyAliases`.                                                                                                                                                                                                                               |

Abort codes (clever errors, `address_alias` at framework `0x2`):

| Case                       | Constant (code)              | Message                                                                                                                                                                           | Abort code             |
| -------------------------- | ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------- |
| Remove the last alias      | `ECannotRemoveLastAlias` (3) | `MoveAbort in 1st command, 'ECannotRemoveLastAlias': Cannot remove the last alias., in '0x…02::address_alias::remove' (line 99)`                                                  | `13835902905414451207` |
| Add a duplicate            | `EAliasAlreadyExists` (2)    | `MoveAbort in 1st command, 'EAliasAlreadyExists': Alias already exists., in '0x…02::address_alias::add' (line 83)`                                                                | `13835621361718132741` |
| Remove a non-member        | `ENoSuchAlias` (1)           | `MoveAbort in 1st command, 'ENoSuchAlias': Given alias does not exist., in '0x…02::address_alias::remove' (line 98)`                                                              | `13835339951165800451` |
| `enable` twice             | `EAliasAlreadyExists` (2)    | `MoveAbort in 1st command, 'EAliasAlreadyExists': Alias already exists., in '0x…02::address_alias::enable' (line 70)`                                                             | `13835621305883557893` |
| 9th alias                  | `ETooManyAliases` (4)        | `MoveAbort in 1st command, 'ETooManyAliases': The number of aliases exceeds the maximum allowed., in '0x…02::address_alias::add' (line 85)`                                       | `13836184320261750793` |
| Other sender uses the obj. | (not a Move abort)           | `Error checking transaction input objects: Transaction was not signed by the correct sender: Object <id> is owned by account address <M>, but given owner/signer address is <M'>` | n/a                    |

Gas on localnet (MIST, reference gas price 1000):

| Transaction                   | Computation | Storage   | Rebate                | Net                   |
| ----------------------------- | ----------- | --------- | --------------------- | --------------------- |
| `enable`                      | 1,000,000   | 6,612,000 | 4,890,600 – 6,357,780 | 1,254,220 – 2,721,400 |
| `add` (one)                   | 1,000,000   | 2,880,400 | 2,610,828             | 1,269,572             |
| `add` (six in one PTB)        | 1,000,000   | 4,339,600 | 2,851,596             | 2,488,004             |
| `remove`                      | 1,000,000   | 2,637,200 | 2,851,596             | 785,604               |
| SUI transfer signed via alias | 1,000,000   | 1,976,000 | 978,120               | 1,997,880             |

What we learned beyond the six steps:

- **Ownership.** The `AddressAliases` object is **party owned** (`ConsensusAddressOwner { owner: M }`), not address owned. `enable` also creates a `dynamic_field::Field<derived_object::Claimed, ClaimedStatus>` under `0xa`. Transactions that touch the alias object go through consensus. The SDK resolves `tx.object(aliasesId)` to a shared object input with `initialSharedVersion = startVersion`, so builders need nothing special.
- **Sender is not signer.** `Transaction` needs only `setSender(account)`. Gas coins are resolved from the account, and the signer can hold no SUI. No explicit gas owner is needed.
- **Rejections happen before execution.** An invalid alias signer gets a gRPC `INVALID_ARGUMENT` from `ExecuteTransaction`, with a URL-encoded message that lists the account's current alias set. No gas is charged.
- **Read path.** `client.core.getObjects({ objectIds: [id], include: { content: true } })`, which is `sui.rpc.v2.LedgerService/BatchGetObjects` with read mask `owner, object_type, digest, version, object_id, contents`. `contents` is the Move struct BCS. A missing object comes back as a per-object `ObjectError` with `reason === 'notFound'` (check that, not the message text), so use `getObjects`, not `getObject`, which throws.
- **BCS layout.** `AddressAliases { id: UID, aliases: VecSet<address> }` decodes as `struct { id: address, aliases: struct { contents: vector<address> } }`: 32 bytes, a ULEB128 length, then 32 bytes per alias.
- **Dry run on build.** With the gRPC client, `Transaction.build` always simulates when inputs are unresolved, even with an explicit gas budget. An aborting alias change therefore fails at build time with a `SimulationError` whose `executionError.MoveAbort.cleverError.constantName` names the constant.
- **Test environment.** The localnet fullnode serves only a few seconds of checkpoints over gRPC (`x-sui-lowest-available-checkpoint` trails the tip by about 10 to 20). `waitForTransaction` with the default poll schedule sometimes missed the window and hung until its 60 second timeout. The suite polls every 100 ms instead. This is an environment issue, not an alias issue.
