# Account rotation

_Design. First drafted 2026-09-28, redone 2026-11-17 against main and the designer's "Change signers" screens, after the schema rename, the services extraction and the audit log shipped. Every rule below was decided or confirmed on 2026-11-17 unless it carries an older date. The protocol behaviour was validated on localnet on 2026-10-14, see the spike results in [research/address-aliases.md](research/address-aliases.md)._

## Goal

Let a team change who controls a multisig account (members, weights, threshold) **without changing the account's address**. Assets, SuiNS names, `UpgradeCap`s and integrations stay where they are.

This uses Sui address aliases: the account adds the address of a new composition to its alias set and removes the old one, and the new composition then signs transactions whose sender is the account.

## The design in short

- A signer change is **one proposal**. The current signers approve it at the current threshold. When it executes, the new signers replace the old ones at once, on that network.
- An account has **one acting signer set per network**. Any other address in its alias set is listed as another signer set, with a warning, and cannot act through Sagat.
- New signers are **invited after** the change executes, as when an account is created.
- A change can only execute once the signers who stay have signed it for the new threshold, so a change cannot lock the account out.
- The transaction carries both compositions, so anyone can check what it does without Sagat.
- Everything follows a network: rights, the list of accounts, the signers shown.

## Status

| Part                                                                                                    | State                                                                                                                                  |
| ------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| Schema: accounts, signer sets, `account_signer_sets`, the alias mirror tables, `proposals.executed_via` | Shipped in 0009. The mirror tables and `executed_via` have no writer yet.                                                              |
| Alias helpers and the localnet spike                                                                    | Shipped: `api/src/utils/aliases.ts`, `api/test/address-aliases.test.ts`.                                                               |
| Request flows as services                                                                               | Shipped. Every membership check and tally still reads the composition at the account's address.                                        |
| Key labels (0010) and the audit log (0011)                                                              | Shipped. The log has no rotation actions and no system writer yet.                                                                     |
| The app's own checks before showing or signing                                                          | Shipped, and they require the signer set to rebuild the account address, so they would refuse a changed account. See the app's checks. |
| Alias mirror and resolver                                                                               | Not built. An earlier draft exists, see earlier work.                                                                                  |
| `/v1`                                                                                                   | Foundation and `GET /v1/proposals/:digest` shipped. No other route.                                                                    |
| Changing signers                                                                                        | Not built.                                                                                                                             |

What follows needs one additive migration: two nullable columns on `account_alias_state`, for the acting signer set and the alias object version it was recorded at. Every other table and column already exists.

## Vocabulary

| Term                    | Meaning                                                                                                                                                    |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Account**             | The on-chain address that owns assets and is the `sender` of proposals. The interface calls it a pod.                                                      |
| **Signer set**          | A composition: public keys, weights, threshold, in order. Its address is derived from the composition, so it is immutable. Today's "multisig" row.         |
| **Original signer set** | The signer set whose derived address equals the account address. Not special in storage.                                                                   |
| **Alias set**           | The on-chain set of addresses allowed to sign for an account, **per network**. Defaults to `{account}` when the account never called `enable`.             |
| **Acting signer set**   | The one signer set that signs for the account through Sagat on a network. The interface calls its members the pod's signers.                               |
| **Other signer set**    | Any other address in the alias set on that network. It controls the account on chain like the acting set does.                                             |
| **Signer change**       | A proposal that replaces the acting signer set on one network. The interface calls it "Change signers".                                                    |
| **Mirror**              | The database copy of an account's alias set per network: `account_aliases` and `account_alias_state`.                                                      |
| **Changed**             | An account whose mirrored alias set is anything other than exactly `{account}` on at least one supported network. `enable` alone does not make it changed. |

## Rules the design relies on

1. **One hop.** The signer's address must be in the sender's alias set. The signer's own aliases are not consulted. _Confirmed on localnet, 2026-10-14._
2. **Leaves are public keys.** A multisig member signs with the exact key in the composition. A member's personal aliases never matter.
3. **Aliases are per network.** Changing signers on testnet does nothing on mainnet.
4. **Chain is the source of truth.** The alias set can change outside Sagat. The database only mirrors it.
5. **Signatures belong to keys, not to signer sets.** A member signs the transaction bytes with their own key. The signature is the same whichever signer set ends up combining it.
6. **Compositions are immutable.** There is no "edit signer set". A change is a new signer set, and so is a new order of the same keys.

## Data model

Shipped in 0009 to 0011, with the names of this doc.

```text
accounts            (address, name, created_at)
signer_sets         (address, threshold, is_verified, name)            name kept for legacy routes
signer_set_members  (signer_set_address, public_key, weight, order,
                     is_accepted, is_rejected)
account_proposers   (account_address, address, added_by, added_at)
proposals           (account_address, network, executed_via, ...)      executed_via has no writer yet
proposal_signatures (proposal_id, public_key, signature)
account_aliases     (account_address, network, alias_address)          mirror of chain, no writer yet
account_alias_state (account_address, network, exists,
                     observed_version, observed_at,
                     acting_signer_set, acting_version)                one row per refreshed network; last two to add
account_signer_sets (account_address, signer_set_address, label,
                     status, drafted_by, created_at)                   account to signer set link
account_keys        (account_address, public_key, label,
                     updated_by, updated_at)                           0010; what an account calls a key
account_events      (id, account_address, network, actor, action,
                     subject, before, after, proof, created_at)        0011; audit log, see below
```

Alias entries are stored as **addresses**. The resolver classifies each at read time.

**`account_signer_sets` is the link between an account and a signer set** (decided 2026-10-15), one row per pair. A composition is content-addressed and can be shared by several accounts, so anything said about it on behalf of one account lives on the pair. Every account has a row for its original composition, `(A, A)`, written by the create route. A signer change writes the row for its new composition when the change is proposed, with the proposer in `drafted_by`. Whether a set is valid on a network is **not** stored here: it comes from the mirror. Nor does a link decide who acts: it only says the account has used or proposed that composition. The status is `verified` once every member has accepted and `inviting` until then; `draft` and `abandoned` are not written by this design.

`account_alias_state` records what the last refresh saw on a network: whether the alias object exists, its version, and when it was read. It separates "never checked" (no state row) from "not changed" (`exists` is false). An account whose state row says the object does not exist has the alias set `{account}`. It has no `account_aliases` rows. `acting_signer_set` and `acting_version` are empty until a signer change succeeds, which means the original set.

Nothing stores where a signer change stands. A pending change is a pending proposal, an executed one is in the mirror, and both are read when needed.

## One acting signer set

Aliases cannot be scoped: every address in the alias set has full control of the account. Sagat lets exactly one of them act, per network, and shows the rest.

- **The acting signer set** is recorded per account and network, next to the mirror's state. It starts as the original set. It moves only when a signer change of that account succeeds on that network, and only forwards. With the acting set, Sagat records the version that change's transaction gave the alias object, and a change moves the acting set only if its version is higher than the recorded one. So the order in which Sagat learns of changes does not matter, verifying an old change moves nothing, and a change that executed and failed moves nothing. Proposing a change never moves the acting set, cancelling one never moves it back, and nothing that happens on another network moves it.
- **Proposals are checked and tallied against the acting set** of their network, and executed with it. `executed_via` records the address that actually signed for the sender, as it is, when the proposal is verified.
- **Other signer sets** are every other alias on that network: a composition Sagat knows, a single known key, or an address it cannot resolve. They are listed on the members page with the warning that each can approve transactions from the address alone. Their members get no access to the account through Sagat. A set that is itself an account shows its name and a link only to a viewer who is one of its signers.
- **No acting set.** If the recorded acting set is no longer in the alias set on a network, nobody can act for the account through Sagat on that network. The members page says the address is controlled by other signer sets and lists them.

The data model does not limit an account to one acting set. Letting several sets act, with progress per set, can be added later without a migration.

## Signer resolver

One service answers "who signs for this account on this network". Routes and other services never read alias rows.

It classifies every address in the alias set:

| Kind         | When                                             | Shown as                                                                   |
| ------------ | ------------------------------------------------ | -------------------------------------------------------------------------- |
| `signer_set` | A composition Sagat knows hashes to the address. | The acting set, or another signer set with its signer count and threshold. |
| `key`        | A registered public key derives the address.     | Another signer set of one key.                                             |
| `unknown`    | Neither.                                         | Another signer set with no details.                                        |

Every request names a network, and rights come from the acting set on that network. Nothing uses "valid on any network".

| Action                               | Who                                                                                                                    |
| ------------------------------------ | ---------------------------------------------------------------------------------------------------------------------- |
| List accounts                        | An accepted key of the acting set.                                                                                     |
| Read an account                      | A key of the acting set, accepted or invited, as today.                                                                |
| List an account's proposals          | An accepted key of the acting set.                                                                                     |
| Read a proposal by digest            | Anyone, as today.                                                                                                      |
| Create a proposal                    | An accepted key of the acting set, or a proposer of the account.                                                       |
| Vote                                 | A key of the acting set, accepted or not, as today.                                                                    |
| Cancel                               | An accepted key of the acting set, or the external proposer while nobody has signed.                                   |
| Verify by digest                     | Anyone: it only reads the chain.                                                                                       |
| Add or remove a proposer             | An accepted key of the acting set. Removing cancels that proposer's proposals on that network, except a signer change. |
| Anything that calls the alias module | Signers only, never an external proposer. See changing signers.                                                        |
| Answer an invitation                 | A key of that composition, as today.                                                                                   |

The services take the acting set where they take the composition at the account's address today. For an account that never changed the two are the same set.

## Alias mirror and refresh

There is no background job and no dependency on a chain indexer. The API reads the alias state itself through one refresh function, which updates the mirror and returns what changed. A chain watcher can call the same function later.

**When.** Any decision that depends on who signs for an account refreshes first when the state row of that network is missing or older than 60 seconds, and decides on the result. That covers opening an account or a list, creating, signing and cancelling a proposal, and the legacy routes. A refresh also runs right after a proposal that calls `0x2::address_alias` is verified as executed. A key removed from the alias set outside Sagat therefore loses access within a minute.

**Read.** One derived-object read per account and network. Reads go through one loader per network, shared across requests, that collects the reads of 50 ms into batches of 50 and sends each account once per batch. It has no cache, so a refresh is never answered from a read made before it was asked for. A list of accounts therefore costs one `getObjects` call per 50 accounts. `getObjects` returns an error per object, so one bad read fails only its own account.

**Write.** The chain is read before any transaction opens.

- Unchanged: when the read shows the same existence and version as the state row, one statement moves `observed_at` forward, conditional on that version. No lock, no transaction.
- Changed, or no state row: one transaction per account. It takes the account lock (`lockAccount`), reads the state row again, applies the guard below, replaces the state row and alias rows, records the difference in the audit log, and records the outcome of the signer changes it found on chain, below. The account lock is the one `recordAccountEvent` takes. A request that writes several accounts in one transaction takes their locks in sorted order, and a flow that also locks a `signer_sets` row takes that one first.

The difference is between effective sets: no alias rows counts as `{account}`, so the first refresh after `enable` reports no change.

**Finding executed signer changes.** The alias object names only the last transaction that changed it, and a later alias change can sit on top of a signer change nobody has verified. So whenever a refresh sees the alias object changed, it also looks up on chain every signer change of that account and network that Sagat holds without an outcome. There is normally at most one. Each one it finds is recorded as succeeded or failed, as verifying it would, whatever its status in Sagat was, in the transaction that writes the mirror. A successful one moves the acting set under the rule in "One acting signer set"; a failed one is final and moves nothing. Verifying a proposal does the same for that one proposal, and the version rule makes the order of the two irrelevant. These lookups happen before the transaction opens, like the alias read.

**Never backwards.** If a fullnode serves an older object version than the mirror holds, the refresh writes nothing and `observed_at` does not move. The same holds when the node reports the alias object as missing after a refresh saw it: the object cannot be deleted, so the node is lagging or wrong. A stale read can therefore never give access back to a removed signer set. The decision is then made on the mirror as it is.

**When a refresh fails.** Anything that writes (create, vote, cancel, proposers) is refused with a 503 naming the account and network. A list falls back to the mirror as it is and marks the account as not checked, so one bad read does not empty the list.

**Not mirrored.** The order of aliases: the mirror returns them sorted by address, the chain keeps insertion order.

**Networks that reset (decided 2026-10-15, confirmed 2026-11-17).** Devnet and localnet start over from genesis, and afterwards the alias object is missing or back at a lower version, so the guard keeps the old mirror. This is accepted as a development-only limitation. After a reset, stop every API instance, run `BEGIN; DELETE FROM account_aliases WHERE network = '<network>'; DELETE FROM account_alias_state WHERE network = '<network>'; COMMIT;`, and start the API again. Stopping first matters: a refresh in flight can read the old chain and write after the cleanup. Mainnet and testnet never reset.

## Changing signers

```mermaid
sequenceDiagram
    participant P as Proposer (a signer who stays)
    participant A as Sagat API
    participant O as Current signers
    participant C as Sui
    participant N as New signers

    P->>A: Propose the change (one transaction, with both compositions)
    A->>A: Check the change, write the new signer set
    O->>A: Sign, at the current threshold
    A->>A: Ready once signers who stay meet the new threshold
    O->>C: Execute
    A->>C: Re-read alias set
    A-->>N: Invitations
```

### 0. Allow signer changes (once per network)

The alias object does not exist until the account calls `address_alias::enable`, and a change needs it as an input, so `enable` cannot share a transaction with the first change. The spike confirmed a combined transaction fails to build.

- The members page offers "allow signer changes" at any time: an ordinary proposal that calls `enable`, approved like any other. It changes nothing by itself: the alias set stays `{account}` and the account does not count as changed.
- A change started before that step was done begins with it.
- The account needs SUI on that network to pay for it.
- This step is kept apart from the change flow so that it can be removed if the protocol later lets the two share a transaction.

### 1. Edit and review

The editor starts from the acting set and produces a new composition: add, remove or replace a signer, change a weight, change the threshold, reorder. Its rules, as the screens draw them:

- A change is refused when nothing differs, when fewer than 2 or more than 10 signers remain, and when the threshold cannot be reached by the signers left.
- A threshold that one signer can meet alone is a warning, not an error.
- A signer cannot remove themselves. Someone who stays proposes it.
- **The signers who stay must be able to meet the new threshold by themselves**, counting only those who have accepted. Otherwise the change could never become ready, see step 3. A handover to a whole new team is therefore two changes: add the new signers, then remove the old ones.

Names typed for new signers are saved as key labels when the change is proposed. Renaming an existing signer is not part of this.

### 2. Propose

One transaction with `sender = account`:

- `address_alias::add(new set)` and `address_alias::remove(old set)`, both top-level commands. `add` comes first, because the last alias cannot be removed, unless the alias set is full, in which case `remove` comes first. If the new composition is already an alias, the transaction only removes the old one.
- The composition note, below.
- An expiration that names the chain, so bytes built for one network cannot be presented as another's.

The alias object is party-owned, so consensus orders the transactions that touch it and its version never goes stale in a pending proposal. The gas coin is an owned object, so the existing gas-coin collision check applies as for any proposal.

When the proposal is created, the API refreshes the mirror before it opens a transaction, and then, in one transaction under the account lock:

- requires the old set in the transaction to be the acting set, read from the mirror under the lock;
- checks the note and the editor's rules above, again;
- requires the proposer to be an accepted signer who stays;
- refuses the proposal while another pending proposal of that account and network calls the alias module: **one change at a time per account and network**;
- writes the new signer set, its members and its link to the account. In a new composition, signers who stay are accepted and new keys are not. A composition that already exists is linked as it is: nobody's acceptance in it is changed, because other accounts may use it, so a signer who stays but never accepted that composition is invited like a new one.

### 3. Sign

The current signers sign at the current threshold. That is all the chain asks. Sagat asks for more before it calls the change ready:

**A change is ready only when signers who stay have signed it for at least the new threshold**, by their new weights. Those signatures are the proof that the new set can sign with keys people hold today. A signer who is being removed can still sign, and their signature counts toward the current threshold, but not toward this.

Signatures are otherwise public: anyone could combine them and execute as soon as the current threshold is met. So for a change, the API returns who has signed but **withholds the signatures themselves until the change is ready**, on every route, the proposer's signature in the proposal's creation event included. A staying signer whose key is lost then blocks the change instead of locking the account. This covers what Sagat holds: a threshold of the current signers who exchange signatures outside Sagat can execute anything, a change included.

Only a signer who stays can cancel a change, and removing a proposer never cancels one: that route cancels the pending proposals of any address it is given, which would let a signer being removed cancel the change by naming its proposer. A cancel is recorded in Sagat only, as for any proposal.

### 4. Execute

Anyone with the released signatures combines them with the old set and executes. From that transaction on, on that network:

- the new set is the acting set and the old one cannot sign;
- the next refresh records the change, and verifying the proposal triggers one;
- members of the new set who have not accepted it find an invitation and are shown as invited. They can sign proposals at once, as an invited member of a new account can today, and get the rest of a member's rights when they accept;
- a new signer who rejects stays in the composition on chain. The account shows the rejection, and the team removes them with another change. The threshold never depends on them, because of step 1.

### Composition note in the transaction

An alias call names an address and nothing else, so the transaction by itself does not say who the new signers are. Every signer change therefore carries the compositions in its own bytes, as pure inputs that no command uses:

- one input with the account, and the alias set before and after as lists of addresses;
- one input per signer set in either list that Sagat can resolve: its address, threshold, and public keys with weights, in order. A single-key alias is its address and key. An alias Sagat cannot resolve is its address only.

Each is a UTF-8 string of JSON with a fixed field order and a version, built by one SDK function.

The note is never trusted as text. To check a transaction, anyone:

1. requires the note's account to be the transaction's sender;
2. rebuilds each signer set's address from its keys, weights and threshold, and requires it to equal the stated address;
3. requires `before` to equal the alias set on a node they pick, and takes `after` from that set with the transaction's alias calls applied, not from the note;
4. requires the note's `after` to equal it.

The app shows a change as a list of differences ("Add Priya", "Remove Hana", "Change the threshold from 4 of 7 to 5 of 8"). It computes that list from the note after these checks, and from nothing the API says. It refuses to sign a change that fails any of them. The API runs the same checks when the change is created. Names next to keys the account does not know yet come from the proposer and are shown as such; the key and address are always shown with them.

What this buys:

- **The change can be checked without Sagat**: by the app, by the API, by a script with the SDK, or by someone reading the transaction in an explorer.
- **The signers sign it.** The inputs are part of the transaction, so the threshold that approved the change also signed the statement of who the new signers are.
- **The chain keeps the composition.** A multisig address cannot be signed for without its full composition. The transaction that put a set in place holds it, so a team can rebuild its signer set without Sagat's database.

Only keys, weights and thresholds go in. No labels or names, because the chain is public and permanent. Unused pure inputs are valid in a normal transaction (the protocol limits them only for gasless ones) and each can be 16 KiB. The spike suite gains a test that such a transaction builds, executes and reads back unchanged. If that ever stops holding, the same strings are passed to a framework call that does nothing.

A proposal that calls the alias module without a valid note is a hand-written one, see safety rails.

## Open proposals across a change

Open proposals carry over. Each is recounted against the new weights and threshold: signatures from signers who stay keep counting, and signatures from removed signers are kept but count nowhere. A proposal that was ready can need more signatures afterwards. The review screen says so before the change is proposed.

If someone executes a proposal with a set the chain no longer accepts, the node rejects it before execution with no gas charged, and Sagat refreshes.

## Networks

- A signer change is a transaction on one network and changes the signers there only.
- Everything in the app follows the selected network: the list of accounts, the signers shown, and what a key may do. A signer removed on mainnet no longer sees the account there, and still does on a network where the change was never made.
- When an account's signers differ on another supported network, the members page says so and names the network. The dangerous case is believing a change happened everywhere when it happened on one network.
- A removed signer is told once: the list of accounts reports, per network, the accounts one of the caller's keys was removed from. It names the transaction only when that is known, see the audit log.
- Copy that says a signer "can no longer sign" is about the network the change is made on.

## Safety rails

Sagat is defensive about what it controls: the accuracy of the mirror, access decisions, the change flow, and never building a lockout. It does not try to prevent what happens outside it, such as a signer set added by hand or signatures combined elsewhere. Those are detected at the next refresh and shown.

- The app builds only `enable`, and `add` with `remove`. Never `replace_all`, so another signer set, such as a recovery set, survives a change.
- **Hand-written proposals that call `0x2::address_alias` are allowed for signers.** The preview shows a prominent "this changes who controls the account" warning, says that the app cannot show who is added, and calls out `replace_all`. They are refused from external proposers. They count for the one-at-a-time rule, in both directions. What they add shows up as another signer set. If one removes the acting set, the account has no acting set.
- A change is dry-run before signing, and the preview shows the resulting alias set.
- A different gas owner is refused when a proposal is created, as for any proposal.
- Maximum 8 aliases. The builder orders its two calls so a full set still works.
- Anything in the alias set that is not the acting set is shown on the members page after every refresh. There is no acknowledgement state.

## The app's own checks

The app does not take the API's word for who controls an account. Today it rebuilds the account address from the signers the API returned and refuses to show the address, propose or sign when they do not match. Under a signer change that rule is wrong in both directions: the new set rebuilds to another address, and the original set still rebuilds the account's address after it was removed.

The rule becomes: **the signers the app shows must rebuild to an address in the account's alias set on that network, read from the app's own node.** With no alias object the alias set is `{account}`, so an account that never changed is checked exactly as today.

- The alias set is one derived-object read per account and network, from the node the app already uses. The check is per network and asynchronous, with a third outcome next to "ok" and "refused": **could not check**.
- **Signing and proposing** need the connected key to be in the shown set, and that set to pass the rule on the proposal's network. The bytes' sender and gas owner are compared with the account address, never with the rebuilt set address. A proposal's bytes must name the chain the app's node reports for that network when they name one, and a signer change must name it.
- **Other signer sets** come from the node's alias list, not from the API: every alias that is not the shown set is listed. The API can add details for the ones it knows, which the app rebuilds before showing them; it cannot hide one.
- **The receive address** is shown when the rule passes. If an alias cannot be rebuilt from anything the app shows, the address is still shown, with a warning that a signer set the app cannot identify also controls it.
- **Could not check** blocks signing, proposing and the receive address, with a retry. The account's pages stay readable, with a notice.
- The audit log verifier takes its trusted members from the same place: the keys of the set that passes this rule on the proposal's network.
- The check for a list row comes from a per-network hook, and the pages that hide a refused account keep reading one field.
- Sign-in is unchanged: a session key must derive its own address.

These checks land before any account can change its signers through the app, see the build order.

## Legacy routes and `/v1`

**Decision (2026-10-14): one schema, two route sets, no breaking change.** **Decision (2026-11-16): `/v1` grows per feature.** The earlier plan to move the whole API to `/v1` in one stack is dropped, and its branch is closed.

### Legacy routes

- The existing routes stay mounted and **frozen in behaviour**: no field is removed, renamed or changes meaning. Additive response fields are fine, each a deliberate regeneration of the golden fixture in the same pull request.
- What they have gained so far: `label` on every member object; `draftedBy` and `createdAt` on every multisig object; `currentWeight` on the vote response; `event` on each proposer of `GET /multisig/:address`, and `events` (`created`, `proposer`) on the proposal from `GET /proposals/digest/:digest`. The create route also inserts the account row and its `account_signer_sets` row, the accept route flips link rows to `verified`, cancel accepts only the new signed message, and add-proposer re-confirms a proposer that is already there.
- **Legacy routes refuse a changed account** with a 409 that points at `/v1`: reading it, its proposals, creating, voting, cancelling, and its proposers. Their shape describes one composition with no network. The connection and invitation listings leave changed accounts out. `verify` and `verify-by-digest` are exempt: they only look up the chain state of an existing proposal.
- **They refresh like `/v1` does.** A legacy request about an account refreshes its alias state when it is older than a minute, on every supported network, because the gate is about any network. If the node cannot be read, create, vote, cancel and the proposer routes are refused with a 503, and reads decide on the mirror as it is.
- **A signer change is never served by a legacy route**, also while it is pending and the account has not changed yet: the listing leaves it out and the other routes refuse it. Its signatures are withheld, which the legacy shape cannot express.
- Routes keyed by a composition and not an account stay open: create (`POST /multisig`), and accept and reject for an account's original set. So do sign-in and the address routes.
- Legacy routes are removed when their traffic reaches zero, read from the request counter's route label.

### `/v1`

A changed account is served by `/v1` only. The app calls only legacy routes today, and eleven of its calls are about one account, so it moves each of them in the pull request that follows its route, for every account and not only changed ones. The gate lands when the last one has moved. Each handler is thin: the flows are already services.

| `/v1` route                                             | Replaces for the app                    | Notes                                                                                                                    |
| ------------------------------------------------------- | --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `GET /v1/accounts`                                      | `GET /addresses/connections`            | Takes the network. Also reports accounts the caller was removed from.                                                    |
| `GET /v1/accounts/:address`                             | `GET /multisig/:address`                | Takes the network. The acting set, other signer sets, whether changes are allowed, an open change, networks that differ. |
| `GET /v1/invitations`                                   | `GET /addresses/invitations/:publicKey` | Takes the network. A key that has not answered for a set that is an account's acting set.                                |
| `POST /v1/signer-sets/:address/accept`, `/reject`       | accept, reject                          | For any set, including one put in place by a change.                                                                     |
| `POST`, `DELETE /v1/accounts/:address/proposers`        | add-proposer, remove-proposer           | Takes the network.                                                                                                       |
| `POST /v1/proposals`                                    | `POST /proposals`                       | A signer change is recognised from the bytes, and its checks run.                                                        |
| `GET /v1/proposals`, `GET /v1/proposals/:digest`        | list, by digest                         | The tally against the acting set, `executedVia`, and for a change its note, its readiness and withheld signatures.       |
| `POST /v1/proposals/:digest/vote`, `/cancel`, `/verify` | vote, cancel, verify-by-digest          | Verify has no threshold pre-check and refreshes after an alias change.                                                   |

Not under `/v1`: sign-in, registering keys, address lookup and creating an account. A signer change does not touch them.

- **One SDK package.** The zod 4 schemas live in `sdk/`, beside the existing client. The API validates requests and responses with them through `@hono/zod-openapi`, and a `/v1` client in the same package parses every response with them as untrusted input. Types are inferred from the schemas. The spec is committed as a snapshot with a CI check, like the golden fixture.
- **Proposals are addressed by digest.** A client can recompute it from the bytes, and the numeric id is only the server's word.
- **Signed messages keep their text.** Every reworded message would be a new proof version that verifiers carry forever.
- **Tests move with the routes.** A legacy route keeps the golden contract test and its spot checks. A flow test is switched to `/v1` in the route's pull request, never duplicated for both route sets.

### Public vocabulary

| Surface         | Change                                                                                                                                             |
| --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| API routes      | Account-scoped routes under `/v1`, in the table above. Legacy routes stay, frozen, until traffic is zero.                                          |
| API fields      | Under `/v1`: `accountAddress` replaces `multisigAddress`, and reads take a `network`.                                                              |
| SDK             | One package: the legacy client as it is, and a `/v1` client with its schemas beside it.                                                            |
| Signed messages | Unchanged texts.                                                                                                                                   |
| Metrics         | Names unchanged. New rotation metrics get new names.                                                                                               |
| Exports         | Already carry `type` and `version: 1`. An export of a changed account is version 2, with the network and the acting set. Version 1 stays readable. |

The full before and after mapping lives in the [migration guide](migration-guide.md), which predates this revision and is updated in the same pull request as each route.

## Scope

**Decision (2026-09-28), revised 2026-11-17.** This work covers changing an account's signers: per-network alias state, one acting signer set, the change flow, and the `/v1` routes those need. The schema rename has shipped.

Out of scope: notifications, channels, persons, a background chain watcher, an event outbox, a history page, renaming a signer, and letting several signer sets act for one account.

### Room left for later

Each of these is a property of the rotation design, not extra work. Together they mean the out of scope items can be added without reshaping anything.

| Later feature        | What the rotation design already provides                                                                                                              |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Notifications        | The resolver returns the acting set's keys for an account and network. That list is the recipient list.                                                |
| Several acting sets  | The mirror and the link table already hold every set. Only the resolver's "one acting set" rule and the tally would change.                            |
| Chain watcher        | The refresh function takes accounts and a network, updates the mirror, and returns a diff. A watcher can call the same function.                       |
| Alias changed alerts | The diff from the refresh function is recorded as `alias.added` and `alias.removed` events. The state row keeps the observed version and time.         |
| Event outbox         | Rotation changes are rows in `account_events`, written in the change's transaction. An outbox can read that table.                                     |
| Persons              | Audit fields stay as addresses. Nothing is keyed on the group of keys in a browser session. No contact details are stored anywhere.                    |
| Per-network anything | Every alias row and proposal carries the network. A recorded change carries it only when the change is per-network, so proposer events leave it empty. |

Rules that keep this true while building:

1. Signer resolution lives in one service. Routes never read alias rows directly.
2. Alias state is written only by the refresh function.
3. States such as "signers differ on another network" and where a signer change stands are computed on read, not stored.
4. Rotation changes are recorded with `recordAccountEvent`. Counts go to plain metric counters, next to the code that causes them.

### Per-account key labels (0010, shipped)

Teams want to name the keys in a signer set ("Alice's Ledger"). The label belongs to the account and public key, not to the signer set member row: a key carries over across rotations, and a composition can be shared by several accounts, so a label on the member row would have to be re-entered per set and would leak between accounts. `account_keys` is keyed by account address and public key, with `label`, `updated_by` and `updated_at`. The table is named after the pair, not the label, because the same row later takes a role, a last-active time, and the link to a person record; each is one nullable column, and the name stays true (decided 2026-10-15).

Decisions (2026-10-19):

- **Labels are optional.** No row is required per key. The create route takes an optional `labels` array aligned with `publicKeys`; null and blank entries are skipped, the rest are trimmed and limited to 64 characters. Only labelled keys get a row.
- **Set at creation only.** There is no update route. Creating an account labels its keys. Proposing a signer change is the second creation step: it labels any new keys, while keys the account already knows keep their row. Whether to add renaming later is an open question; `updated_by` and `updated_at` are what such a route would write.
- **Legacy routes show them, authenticated only.** Every member object in the legacy multisig responses carries `label: string | null`, joined from the account with the same address. This is the one additive field on the frozen routes. Labels are never returned on an unauthenticated route: the public proposal-by-digest lookup keeps its member shape (key, weight, order), and a test asserts it. Labels reach a response only through the legacy serializer, which is called by the four routes behind `authMiddleware` (get multisig, create, connections, invitations).
- The label is inside Sagat's control, so the create route refuses a `labels` array that does not line up with the keys, and refuses control and formatting characters (bidi overrides, zero-width characters) that could spoof what sits next to a key. Only a caller who is a member of the composition may label it: anyone holding a key can still set up a multisig for others, but an outsider must not plant labels that nobody can change. It does not try to keep labels unique.

### Audit log (0011)

Signed changes store their proof: the signature plus any semantic fields needed to rebuild the signed message. So far that covers adding and removing a proposer, and creating and cancelling a proposal, directly or by removing its proposer. Other changes are not recorded yet, so a missing event for one is not a sign of a withheld row. The server verifies at write time. A client will re-verify at read time, rebuilding any message from the fields with the same SDK builders and never trusting stored text. `GET /multisig/:address` and `GET /proposals/digest/:digest` return the newest relevant events with their proofs. The SDK verifies `proposer.added`, `proposer.removed` and `proposal.created` rows (`sdk/src/verify.ts`). Still to come: a full read route, verifying `proposer.removal_unmatched`, cancel and `caused_by` rows, the alias-set rule for rotated accounts, and checking the chain named in the bytes against the client's own node. Once built, this covers a hostile or impersonated API forging a signed change. It does not cover a hostile frontend, which can show any result and ask the wallet to sign other bytes, or withholding rows, and it does not prove when a change happened or in what order, because `created_at` and `id` are the server's word. A hash chain is a possible later step.

```text
account_events (id, account_address, network, actor, action, subject,
                before, after, proof, created_at)
```

- `actor` is the signer's address, or `system` for a later row nobody signed. On a `caused_by` row it is the signer of the row it points at. `before` and `after` hold the changed fields only, never whole rows.
- The `kind` and `version` of a proof over a personal message name the SDK message template: version 1 is the legacy text. Cancel already writes version 2 on the existing route, and the other `/v1` writers will too. New text for the same signed thing is a new `version`; a change in what is signed is a new `kind`. Old templates stay available to verifiers because old rows keep verifying with them. A reader answers "unknown" for a version it does not know, never "forged". After a message moves to a new version, a reader sets a minimum version per action and treats an older row as needing re-confirmation. `proposal.create` signs transaction bytes and has no template, so its `version` names the proof's format. `expiry` is part of the message, and a reader does not reject a row because it has passed. Message text is never stored.
- A `proposal.cancel` proof is version 2: the key signed `Cancelling proposal <digest> on multisig <account>`, with the digest taken from `subject` and the account from the row's `account_address`. Older rows hold version 1, which proves only that the key signed `Cancel proposal <id>`, with the id taken from `proof.proposalId`. Nothing binds that number to the digest or the account, because the id is the server's, so `subject` does not make a version 1 cancel any stronger. It is the one row that can verify one value and show another. Those rows keep verifying with the version 1 template. The message has no expiry, but PENDING to CANCELLED only happens once, so it cannot produce a second row. A cancel only changes the database, so it does not prove the transaction never executed.
- `proposer.removal_unmatched` is a signed removal of an address that is not in the proposers list but has pending proposals, which it cancelled. The route takes any address, so a member can pass another member's address and cancel that member's pending proposals. It is separate from `proposer.removed` so that action stays true, written only when a proposer was really deleted, while every `caused_by` row still points at a row holding the member's signature. It has the same proof and template. A removal matching no proposer and no pending proposal records nothing.
- Append-only, written in the same transaction as the change. Read newest first with a keyset on `id`, never an offset. `recordAccountEvent` takes the account lock because ids are assigned at insert, not commit: without it, a lower id could become visible after a reader has paged past it. With it, an account's ids follow commit order, which the keyset and a later hash chain rely on. No retention. Only the two legacy responses above return events, the newest relevant ones; a full read route comes later.
- Rows from before their action was first recorded have no event and stay unverified, as does a change made by a replica still on the old code during a rolling deploy. No backfill.

To verify a row:

- The row's `action`, not `proof.kind`, decides which proof kinds are allowed, and each allowed kind has one template or transaction check, so a proof cannot be relabelled as another action, except between `proposer.removed` and `proposer.removal_unmatched`, which share a message, and between a member's vote and `proposal.created`, which sign the same bytes, so which of the two it is remains the server's word.
- A `proposal.create` proof is checked with `verifyTransaction` over the proposal's transaction bytes, which can be fetched by digest. Proposal rows use the digest as `subject`, and the digest recomputed from the bytes must equal it. The sender in those bytes must be the row's account, the only thing binding the signature to it. For a member the row proves the key signed these bytes, not that it proposed them, because a vote signs the same bytes. An external proposer cannot vote, so their signature does prove they proposed. Where the bytes name a chain (`chain` in a `ValidDuring` or `Validity` expiration), the client compares it with the chain id its own node reports for `network`. Without one, `network` is the server's word. The API does not make this comparison at write time. The proof has no expiry. Digests are unique across all proposals, so one signature never honestly appears on two such rows.
- A `caused_by` row holds no signature, and its `subject` is the cancelled proposal's digest. Verify the row its `eventId` points at, which must be a `proposer.removed` or `proposer.removal_unmatched` of the same account, whose subject is the address that proposed that proposal (the `actor` of the `proposal.created` row with the same digest, where it has one). Its `id` is lower than the child's, and the child's `actor` must equal that row's `actor`. The removal's signature does not name the proposals, so which ones it cancelled is the server's word. A removal signature already in the log changes nothing; before that, or on a replica still on the old code, a replay until its expiry could cancel proposals created after it was signed.
- The key recovered from the signature must match `actor` and must be a key of a currently valid signer set. The composition must hash to the address of a valid signer set, and which sets are valid always comes from a node the client picks: the alias set where the alias object exists, otherwise the account's own address once the node shows no alias object. A retired set still hashes to the address, so the hash alone is not enough. An external proposer's address must instead be the `subject` of a verified `proposer.added` event, or the row stays unverified, as for a proposer added before this table. That proves a member once added it, not that it was still a proposer, and a withheld removal cannot be detected from the rows alone. Compare addresses normalised, because a proposer event's `subject` is stored exactly as signed. A newer verified `proposer.removed` or `proposer.removal_unmatched` for that address means the proposer is not verified until a later add. `actor` by itself proves nothing: anyone can sign a message.
- A signature from a key that has since been rotated out does not count. It cannot be told apart from one signed after the rotation, because a signature does not prove when it was made, so an old or leaked key could otherwise vouch for anyone. History can still show the row, but before signing a proposal a current member must confirm that proposer again. They do so by adding the proposer again, which keeps the row and records a new signed `proposer.added`.
- A proposer event has no network, while signer sets are per network. When it backs a proposal, its key must be valid on that proposal's network, so a set valid only on testnet cannot vouch for a mainnet proposal.
- A `proposal.cancelled` signed by an external proposer verifies only if the signer is the `proposerAddress` of the proposal whose digest is the row's `subject`, and the `subject` of a verified `proposer.added`. That the proposal had no signatures at the time is the server's word.
- A proposer signature already in the log changes nothing, so a resent one records no row. Older rows, or rows from a replica still on the old code, may hold the same signature twice, because a signed change could then be replayed until its expiry. A reader can flag that but cannot treat it as forgery. An old proof shown again as a new row cannot be told apart from history by the signature alone; a `created_at` later than the expiry is a sign of it.

To add an audited operation: one entry in the registry in `api/src/services/account-events.service.ts`, and one `recordAccountEvent(tx, ...)` call at the write site, in the change's transaction, after `lockAccount`. This holds when the write site already has a transaction, touches one account and can tell that something changed. Otherwise the writer also needs a transaction with `lockAccount` first, a re-read under the lock of any status it checked before, and a guard so repeating a change writes no row. Writes across several accounts must take locks in sorted order, because `recordAccountEvent` locks in call order. An event with no account cannot be stored, because `account_address` is required. Each action also needs a verifier branch and a display branch. No migration: actions and proof kinds are checked by TypeScript, not by a database constraint. To find the proof of a current row, take the newest event for its account, action and subject.

Rules for writers:

- Only signed fields are proven. `before` never is.
- A verifier rebuilds the signed text from the row's fields, the ones the UI displays, so a row cannot verify one value and show another. Refuse input that would be normalised after signing, because such a row can never verify.
- A new message names what it covers: account, action, values, network where one applies, and expiry. An expiry is an ISO 8601 date-time with `Z` or an offset and is stored as signed, a signature is canonical base64, and addresses are canonical. An expiry or signature in any other form is refused before anything is stored.
- Each action states its own verify rule. "A key of a currently valid signer set" does not fit every action: an invited key is not in one yet.
- Before storing a person's name or other personal data, decide how it can be erased. The table is append-only, and a kept signature confirms a guessed value even after the value is blanked.
- A message builder takes explicit fields and never serialises the JSON column, because `jsonb` reorders keys.
- Large values such as icons are stored as a URL or hash.
- A change caused by another (removing a proposer cancels its proposals) stores a `caused_by` proof naming the signed row, written first in the same transaction.

### Rotation events in the audit log

A signer change adds these actions to the registry. Nothing else about the log changes.

| Action                                       | Actor                       | Subject           | Network | Proof                                                                                       |
| -------------------------------------------- | --------------------------- | ----------------- | ------- | ------------------------------------------------------------------------------------------- |
| `alias.added`, `alias.removed`               | `system`                    | The alias address | Set     | `chain`: the digest of the transaction that last changed the alias object, and its version. |
| `signer_set.accepted`, `signer_set.rejected` | The answering key's address | The set's address | None    | The existing accept or reject message, version 1.                                           |

**A signer change has no action of its own.** It is a proposal, so it already has a `proposal.created` row holding the proposer's signature over bytes anyone can read, note included, and when it executes the next refresh writes `alias.added` and `alias.removed` with the same digest. Together they say who proposed the change, what it was, and that the chain applied it. The threshold that approved it is in the executed transaction's own signature.

Writers:

- **Alias rows** are written by the refresh, in the transaction that changes the mirror, one row per address in the difference. They are the first rows with the `system` actor and a `chain` proof, which gains the object version. The digest is the alias object's previous transaction at the version read. When several changes happened between two refreshes, every row of that difference carries the digest of the last one.
- **Accept and reject rows** are written by the accept and reject routes, which discard those signatures today. One row goes to every account that links the composition, the account at the composition's own address included, so creating an account records its acceptances too. Several accounts mean several locks, taken in sorted order after the `signer_sets` row.
- A signer who stays writes no row when the change creates the composition: they are accepted in it already, and their part in the change is their signature on it. In a composition that already existed, a staying signer who never accepted it is invited and answers like a new signer.

To verify them:

- An alias row never decides who signs for an account. That always comes from the alias set on a node the client picks. To check a row, read the transaction by its digest from that node: its sender must be the account, it must have succeeded, and it must contain an alias call that explains the row (`add` or `remove` of the subject, `replace_all`, or `enable`). A row the transaction does not explain is unverified, not forged, because of the shared digest above. When the transaction carries a composition note, the reader shows the composition from it.
- For accept and reject, "a key of a currently valid signer set" does not fit every case: an invited key of a new account is not in one yet. The recovered key must match `actor` and be a key of the composition that rebuilds to `subject`. The message names the set and not the account, and has no expiry, so the row proves the key agreed to be in that composition, for whichever account uses it. A member answers once, so it cannot produce a second row on the same account.
- "A key of a currently valid signer set", wherever the rules above use it, means a key of the acting set on the network in question.
- None of these rows stores a label or a name.

The notice to a removed signer is read from the `alias.removed` rows: a key of a set that was removed on a network, and is not in the acting set there, was removed. The row's digest is the last change to the alias object, which is not always the one that removed the set. The notice therefore names a transaction only when that digest is a signer change Sagat holds whose note removes the set, and says only that the signer was removed otherwise.

## Edge cases

| Case                                                  | Behaviour                                                                                                                                     |
| ----------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Same signers, new threshold or weights                | Everyone stays, so the proof needs signatures up to the new threshold. Raising 2 of 3 to 3 of 3 needs all three to sign the change.           |
| Removing one signer                                   | The signers who stay must meet the new threshold. The removed signer can sign the change but cannot cancel it.                                |
| Replacing a signer's key                              | The old key is removed and the new one added, in one change. The new key is invited after it executes.                                        |
| Reordering signers                                    | A change like any other: the order is part of the address.                                                                                    |
| Replacing most of the team                            | Refused when the signers who stay cannot meet the new threshold. Done as two changes.                                                         |
| A staying signer lost their key                       | The change may never become ready. Cancel it and propose one that also replaces that key.                                                     |
| The new composition is the original one               | Allowed. The transaction adds the account's own address back and removes the current set.                                                     |
| The new composition already exists in Sagat           | Linked to this account as it is. Its members keep the acceptance they have there and nothing is written to them.                              |
| The change is cancelled or expires                    | Nothing changed on chain. The new set's rows stay, unused. A new change can start, and an account can still be created with that composition. |
| The change executes and fails on chain                | Final. The alias set and the acting set are unchanged. Propose the change again.                                                              |
| The change was cancelled in Sagat but executed anyway | The chain wins: a refresh or a verify that sees it succeeded makes the new set the acting set, whatever the proposal's status.                |
| A new signer rejects the invitation                   | They remain in the composition on chain. The account shows the rejection. Another change removes them.                                        |
| `enable` executed, nothing changed                    | The alias set is `{account}`. Nothing changes, and the account does not count as changed.                                                     |
| Changed on testnet only                               | Counts as changed: legacy routes refuse the account. On mainnet the original signers still act, and the members page says the signers differ. |
| Another signer set is added by hand                   | Listed under other signer sets. It can sign on chain, and grants nothing in Sagat.                                                            |
| The acting set is removed by hand                     | No acting set on that network. Nobody can act there through Sagat. The members page says who controls the address.                            |
| `replace_all` executed outside Sagat                  | The next refresh records the removals and additions, and the rules above apply to what is left.                                               |
| The node serves an older alias object version         | The mirror is kept. The decision is made on the mirror.                                                                                       |
| The node cannot be read                               | Writes are refused with a 503 until a read succeeds. The app's own check shows "could not check".                                             |
| Eight aliases already                                 | A change still works: it removes before it adds.                                                                                              |
| The proposer of an external proposer was removed      | The proposer stays, shown as unverified until a current signer confirms it again, as the audit log section describes.                         |

## Changes to existing code

- **Membership checks and tallies** in the services take the acting set for a network from the resolver, where they load the composition at the account's address today.
- **Proposal creation** recognises a signer change from the bytes and runs its checks, and refuses alias calls from external proposers.
- **Proposal reads** withhold a change's signatures until it is ready, and report its readiness.
- **Cancel** of a change needs a signer who stays.
- **Verify** records a signer change's outcome and moves the acting set when it succeeded with a higher alias version, writes `executed_via`, drops its threshold pre-check under `/v1`, and refreshes the mirror after an alias change.
- **Accept and reject** record their signatures in the audit log.
- **Account creation** tells "this composition exists" apart from "this account exists". Today it refuses any composition it already holds, so a composition left by a change that never executed could not become an account.
- **Limits.** The cap of accounts per public key counts accounts, not signer sets, or a signer would use one slot per change.
- **Removing a proposer** cancels that proposer's proposals on the request's network only, and never a signer change.
- **Execution** in the app combines with the acting set.
- **The app's checks** compare against the alias set from the app's node.
- **Lists and pages** in the app take the selected network.

## What the screens still need

The designer's screens cover the editor, the review, the change as a proposal, the lists before and after, the edge cases of the editor, other signer sets, a pending change, a cancelled change and the removed signer. This design needs a few states they do not have yet:

- allowing signer changes, the one-time step;
- the editor's error when the signers who stay cannot meet the new threshold;
- on the change's page, how far the signers who stay are from the new threshold, and that a removed signer's signature does not count toward it;
- the notice that signers differ on another network;
- an account with no acting set;
- "could not check", and the warning on the receive address for a signer set the app cannot identify;
- the warning on a hand-written transaction that calls the alias module.

Copy follows the screens. Two lines are only true per network and are worded for the network in question: that a removed signer "can no longer sign", and that a removed signer is "not in any pods".

## Test plan

A signer change decides who controls funds, so every rule above is tested where it is enforced, and the dangerous transitions are tested on a real chain.

The cast, shared by every suite: account `A` with original set `S1` = 2-of-3 of `k1`, `k2`, `k3`, all accepted; changes to `S2` = `k1`, `k2`, `k4` (replace one), `S3` = 3-of-3 of the same keys (threshold only), and `S4` = `k4`, `k5` (nobody stays); `R`, another account's composition added by hand; `K`, a single key; `U`, an address nobody knows; an external proposer; a second network.

| Layer          | Runs on                                     | Covers                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| -------------- | ------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Pure functions | No database, no chain                       | Building the change transaction in each order; building and checking the note, with every way it can lie (wrong account, a set that does not rebuild, `after` that does not follow, a stale `before`); who stays; the proof weight; the alias-call detector with its arguments; the acting set from an alias list; the app's sign and receive rules for every state.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| Access         | API routes, mirror rows written directly    | The whole access table per network, for a key that stays, a removed key, a new key before and after accepting, a key of another signer set, a proposer and an outsider. Per-network lists. Lists of 51 accounts costing two reads. Key labels never crossing accounts.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| Mirror         | API against localnet, with a wrapped client | First refresh, an unchanged refresh takes no lock, a change records its events once, never backwards on an older version and on "not found", a read error leaves the mirror alone, one failed object in a batch, two refreshes of one account at once, the 60 second rule, a list falling back. A signer change followed by another alias change before the next refresh is still found. Verifying an old signer change after a newer one moves nothing, also when its set was added back by hand. Two changes learned of in the wrong order end on the later one. A change that executed and failed moves nothing, through the refresh and through verify.                                                                                                                                                                                                                       |
| Whole changes  | API against localnet                        | Enable, then each change of the cast from proposal to execution, with the old keys refused and the new ones invited afterwards. A change that is not ready is not executable from anything the API returns. `S4` is refused. A second change, a hand-written alias proposal and a proposer's alias proposal are refused while one is pending. A removed signer cannot propose or cancel, also not by removing the proposer. Proposing a change to a composition that is already an alias moves nothing until it executes, and nothing on the other network. A reused composition keeps its own acceptances. A composition left by a cancelled change can still become an account. Open proposals are recounted. Changes made outside Sagat at every step: another set added, the acting set removed, `replace_all`. The same change on the second network leaves the first alone. |
| Audit rows     | API and SDK                                 | Every new action is written once, in order, and verifies with the SDK. A forged or relabelled row does not. Every field of the response is treated as hostile.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| Legacy         | API                                         | The golden fixture is unchanged for an account that never changed. Every legacy route refuses a changed account, verify excepted, and the listings leave it out. A pending change is not served. Writes are refused when the node cannot be read. The old frontend's suite stays green.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| The app        | Playwright against localnet                 | The editor and its edge states, the change from review to execution, the lists before and after, the removed signer, other signer sets, the differing-network notice, and the app's checks against a tampered API: a change whose note lies cannot be signed, a set that is no alias cannot be signed with, a hidden alias is still listed, an unreachable node shows "could not check".                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |

A second network in the API suites is a stub client, since tests run one localnet.

## Build order

Each step is one pull request and lands on main by itself. Steps 1 to 4 change nothing a user can see.

1. **`/v1` foundation.** zod 4 and `@hono/zod-openapi`, the shared schemas in `sdk/`, the `/v1` client, the committed spec with its CI check, and one real route to prove it: `GET /v1/proposals/:digest`.
2. **Alias mirror.** The batched reader, the refresh with its two write paths and the guard, the alias events, the 503 error, the reset note in the API README. No route calls it yet.
3. **Resolver.** The acting set column, classification, and every service taking the acting set for a network. Nothing changes for an account that never changed, so the golden fixture does not move.
4. **The app's checks per network.** The alias set from the app's node, the sign and receive rules, "could not check", bytes checked against the account address and the chain.
5. **`/v1` account routes** (list, read, invitations, accept, reject, proposers, with the accept and reject events), then **the app reads through them**: lists and pages take the network, the members page shows other signer sets and the differing-network notice.
6. **`/v1` proposal routes** with `executed_via`, then **the app proposes, signs, cancels, verifies and executes through them**.
7. **The legacy gate**, with the legacy refresh. Lands once the app makes no gated call.
8. **Signer changes in the API and SDK.** The builders and the note, recognising a change, its checks, the proof rule and withheld signatures, the cancel rule, the new set's rows, the key cap.
9. **Allow signer changes** in the app.
10. **The change editor and review** in the app.
11. **The change as a proposal** in the app: its page for a staying and a removed signer, the pending banner, the cancelled state, the lists and members page afterwards, and the notice to a removed signer.

Steps 5 and 6 are an API pull request followed by an app pull request. The user documentation for each screen is written with the screen.

## Earlier work

Two branches built parts of an earlier design before the services extraction and the audit log. Neither is merged, and both are far behind main. Their ideas are reused where they still apply; their code is ported file by file where it still fits.

From the services draft (pull request 98):

- **Kept:** the refresh's rules (chain read before the transaction, the never-backwards guard, the difference between effective sets), the 60 second rule, classifying aliases as signer set, key or unknown, the alias-call detector, the 503 error, and its mirror tests.
- **Reworked:** one account per refresh becomes a batched read with a lock-free path for the unchanged case; its own advisory lock becomes the account lock that event recording already takes; the resolver returns one acting set where it returned every valid set.
- **Dropped:** its recording function, which only counted metrics and overlaps the audit log, and progress per signer set.

From the `/v1` branch:

- **Kept:** one resolver behind every check and tally, verify recording the executing address as it is, a key valid only on another network being refused, the key cap counting accounts, and the way its rotation tests set up state.
- **Dropped:** moving the whole API and the app in one stack, generated SDK types, a second SDK package, drafts and their invitations, tallies per signer set, and its copies of the proposer, cancel and create flows, which predate the audit log.

## Decisions

Decided on 2026-11-17, replacing the October design where they differ:

| Topic                     | Decision                                                                                                         | Replaces                                                      |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| Shape of a change         | One proposal that adds the new set and removes the old one.                                                      | Link the new set, then retire the old one, as two proposals.  |
| Several signer sets       | One acting set per network. The rest are listed.                                                                 | Any valid set can act, with progress per set.                 |
| Invitations               | After the change executes.                                                                                       | A draft that every new key accepts before it can be proposed. |
| `enable`                  | Offered at any time, and a change falls back to it. May go away if the protocol allows.                          | Part of the wizard's first rotation.                          |
| Proof                     | Ready only when signers who stay have signed for the new threshold. Signatures are withheld until then.          | The retire being executed by the new set.                     |
| Composition note          | Required on every change, as JSON strings. The app shows the change from it.                                     | Nothing.                                                      |
| Open changes              | One per account and network. Signers only.                                                                       | One active wizard rotation per account and network.           |
| Hand-written alias calls  | Allowed for signers, with the warning. Refused from external proposers.                                          | Allowed on every route, never refused.                        |
| Who proposes and cancels  | A signer who stays, enforced by the API.                                                                         | Any accepted member.                                          |
| Networks                  | Everything follows the request's network, the list of accounts included. A notice when signers differ elsewhere. | Reads and proposer changes for a key valid on any network.    |
| Editor rules              | As the screens draw them.                                                                                        | Nothing.                                                      |
| Legacy gate               | A changed account is `/v1` only, verify excepted.                                                                | The same.                                                     |
| Legacy and the chain      | Legacy routes refresh too. Their writes are refused when the node cannot be read.                                | Nothing.                                                      |
| `/v1` conventions         | One SDK package, message texts unchanged, proposals by digest.                                                   | A second package, reworded messages, numeric ids.             |
| Networks that reset       | The manual clear stays.                                                                                          | The same.                                                     |
| A set nobody can identify | The receive address is shown with a warning.                                                                     | Nothing.                                                      |
| Audit log                 | Alias changes as system rows, and accept and reject signatures.                                                  | Also drafts and invitations.                                  |
| History                   | No history page. A removed signer is told once.                                                                  | Nothing.                                                      |

Still open:

1. **Proposers per network.** They are account-wide rows, while rights are per network. A signer removed on mainnet who still acts on another network can add or remove a proposer there, and it applies everywhere. Making proposers per network needs a column and a signed message that names the network.
2. **Whether "could not check" hides the receive address** or shows it with a notice. This doc hides it.
3. **Weakest link.** Other signer sets are only warned about. Whether the app should help remove one is not decided.
4. **Acceptance carried between accounts.** Member rows belong to a composition. A composition that a change created holds the acceptances of that account's signers, and another account that later uses the same composition inherits them.
5. **Alias login.** Not proposed: it conflicts with the sign-in rule that a key derives its own address.

## Shipped: the schema rename (0009)

Kept for operators. Legacy routes keep their JSON contract through explicit serializers in `api/src/legacy/serializers.ts`, because the ORM property names changed with the columns and new columns must not leak into old responses. The renames were `multisigs` to `signer_sets`, `multisig_members` to `signer_set_members`, `multisig_proposers` to `account_proposers`, and `multisig_address` to `account_address` on proposals and proposers.

### Migration

One migration, one transaction. It is small because renames are metadata changes and the only data written is two rows per existing multisig: the account and its link to its original signer set.

1. Rename the tables and columns.
2. Create `accounts` and fill it from `signer_sets` with address and name.
3. Point the foreign keys on `proposals` and `account_proposers` at `accounts`.
4. Create `account_aliases`, `account_alias_state` and `account_signer_sets`. Seed one `account_signer_sets` row per account, `(A, A)`, with the multisig name as label and status `verified` or `inviting` from `is_verified`. Add `proposals.executed_via` as nullable.
5. Drop the old `multisig_address_idx` instead of renaming it: it indexes the primary key column.

The migration is hand-written (`api/drizzle/0009_account_rotation.sql`, added in #96, later in this stack). Drizzle's generated SQL was not usable even with every rename answered correctly: it added the foreign keys to `accounts` before filling the table, dropped and recreated indexes instead of renaming them, and never inserted the account rows. Keep the generated snapshot, write the SQL by hand, and prove data preservation on a populated scratch database.

### Deploying 0009

Before deploying 0009:

- As a role that owns the tables, `SELECT count(*), max(created_at) FROM drizzle.__drizzle_migrations;` returns 9 rows (the journal through 0008). If not, the database was not built with drizzle migrations: baseline it as described below, deploy with `MIGRATE_ON_START=false` and, as the owner, run `DATABASE_URL=... bun dist/db/migrate-cli.js` in the API image (working directory `/monorepo/api`); from a source checkout, `bun run db:migrate:prod` does the same. Both are added in #101 of this stack: `MIGRATE_ON_START` (on unless set to `false`) makes the API apply pending migrations at startup, and `bun run db:migrate:prod` applies them as a separate step.
- `SELECT DISTINCT tableowner FROM pg_tables WHERE schemaname = 'public';` returns the role the API connects with. Otherwise startup migrations fail on the renames.
- Grant the read-only roles access to `accounts`, `account_signer_sets`, `account_aliases`, `account_alias_state`, after 0010 `account_keys` and, after 0011, `account_events`, or set default privileges. Otherwise the new tables are invisible to them.
- Anything outside the API that queries `multisigs`, `multisig_members` or `multisig_proposers` by name breaks at the rename. Check dashboards and scripts.
- Deploy with recreate, not a rolling update (see below).

Baselining a database that was not built with drizzle migrations is manual. Drizzle's migrator (drizzle-orm 0.44, node-postgres) records applied migrations in `drizzle.__drizzle_migrations`. It reads the row with the highest `created_at` and applies every entry of `api/drizzle/meta/_journal.json` whose `when` is greater, so an entry counts as applied when a row has `created_at` >= its `when`. The `hash` column is the SHA-256 of the migration's `.sql` file; the migrator stores it but does not compare it. As the owner:

1. Confirm the live schema matches 0008: compare it against `api/drizzle/meta/0008_snapshot.json`, or against what the migration safety test expects of a database at 0008. Do not baseline a database that differs.
2. Create the schema and table as drizzle does:

   ```sql
   CREATE SCHEMA IF NOT EXISTS drizzle;
   CREATE TABLE IF NOT EXISTS drizzle.__drizzle_migrations (id SERIAL PRIMARY KEY, hash text NOT NULL, created_at bigint);
   ```

3. Insert one row per journal entry 0000 to 0008, with `hash` the SHA-256 of the `.sql` file and `created_at` the entry's `when`. From `api/`:

   ```sh
   for f in drizzle/000[0-8]_*.sql; do
     tag=$(basename "$f" .sql)
     when=$(bun -e "console.log(require('./drizzle/meta/_journal.json').entries.find((e) => e.tag === '$tag').when)")
     hash=$(shasum -a 256 "$f" | cut -d ' ' -f 1)
     echo "INSERT INTO drizzle.__drizzle_migrations (hash, created_at) VALUES ('$hash', $when);"
   done > baseline.sql
   psql "$DATABASE_URL" -1 -f baseline.sql
   ```

   The check above now returns 9 rows.

4. Stop here. Do not apply 0009 yet: the database is now baselined through 0008 and the journal says so. 0009 is applied in deployment step 3 below, after the snapshot and after the old API is stopped, by the new API on startup or by `bun dist/db/migrate-cli.js` in the API image (`bun run db:migrate:prod` from a source checkout). Either should apply exactly one migration.

Steps:

1. Publish [migration-guide.md](migration-guide.md).
2. Take a database snapshot.
3. Stop the API, run the migration, start the new API, deploy the new app. Expected downtime is under a minute.
4. Watch legacy route traffic. Remove the routes and the old SDK when it is zero.

The API applies pending migrations on startup. Migration 0009 renames tables, so the previous API version cannot run against the migrated database: deploy it with a stop-and-start (recreate) rather than a rolling update, or expect the old replicas to fail until they are replaced. Migrations after 0009 should be additive (expand, then contract in a later release), so rolling updates keep working.

### Protocol validation

All five steps passed on localnet on 2026-10-14 (sui 1.81.1, protocol 138). The test (`api/test/address-aliases.test.ts`) and the helpers (`api/src/utils/aliases.ts`) are added in #95, the next PR of this stack. Full results are in the research note.

1. Multisig account calls `enable`, then `add` with a second composition's address.
2. Transaction with `sender = account` signed by the second composition executes.
3. Confirm the one-hop rule: give the second composition its own alias and check that alias cannot sign for the account.
4. Second composition executes `remove` of the original. Confirm the original can no longer sign.
5. Confirm the alias object id derivation and BCS decoding from the research note.
