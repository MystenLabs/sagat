// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { PersonalMessages } from '@mysten/sagat';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { MultiSigPublicKey } from '@mysten/sui/multisig';
import {
	Transaction,
	TransactionDataBuilder,
} from '@mysten/sui/transactions';
import { toBase58, toBase64 } from '@mysten/sui/utils';
import { expect, test } from 'vitest';

import { type AliasRead } from '../src/lib/alias-set';
import {
	checkProposalProposer,
	trustedMembers,
	verifyProposers,
	type ProposerProposal,
} from '../src/lib/proposer-proofs';

/** The alias set of a pod that never changed its signers. */
const unchanged = (pod: string): AliasRead => ({
	kind: 'read',
	aliases: [pod],
});
const UNREAD: AliasRead = { kind: 'failed' };

async function accountWithProposer() {
	const keys = [new Ed25519Keypair(), new Ed25519Keypair()];
	const threshold = 1;
	const address = MultiSigPublicKey.fromPublicKeys({
		threshold,
		publicKeys: keys.map((key) => ({
			publicKey: key.getPublicKey(),
			weight: 1,
		})),
	}).toSuiAddress();
	const proposerKey = new Ed25519Keypair();
	const proposer = proposerKey.toSuiAddress();
	const expiry = '2026-11-16T10:00:00.000Z';
	const { signature } = await keys[0].signPersonalMessage(
		new TextEncoder().encode(
			PersonalMessages.addMultisigProposer(
				proposer,
				address,
				expiry,
			),
		),
	);
	const members = keys.map((key, order) => ({
		publicKey: key.getPublicKey().toSuiPublicKey(),
		weight: 1,
		order,
	}));
	const set = {
		address,
		threshold,
		members: members.map((member) => ({
			...member,
			answer: 'accepted' as const,
			label: null,
		})),
	};
	return {
		keys,
		signer: keys[0].toSuiAddress(),
		proposer,
		proposerKey,
		account: {
			address,
			threshold,
			members,
			signerSets: [
				{
					kind: 'signer_set' as const,
					...set,
					acting: true,
				},
			],
			proposers: [
				{
					address: proposer,
					addedBy: keys[0].toSuiAddress(),
					addedAt: '2026-11-16T09:55:00.000Z',
					event: {
						id: 1,
						action: 'proposer.added',
						actor: keys[0].toSuiAddress(),
						subject: proposer,
						proof: {
							kind: 'proposer.add',
							version: 1,
							signature,
							expiry,
						},
						createdAt: '2026-11-16T09:55:00.000Z',
					},
				},
			],
		},
	};
}

test('a signer of the account confirms a proposer', async () => {
	const { account, proposer, signer } =
		await accountWithProposer();

	const proof = (
		await verifyProposers(
			account,
			account.address,
			unchanged(account.address),
		)
	).get(proposer);

	expect(proof?.status).toBe('verified');
	expect(proof?.signer).toBe(signer);
});

test('signers whose set is not in the alias set confirm no one', async () => {
	const { account, proposer } = await accountWithProposer();
	const other = (await accountWithProposer()).account;

	const proof = (
		await verifyProposers(
			account,
			account.address,
			unchanged(other.address),
		)
	).get(proposer);

	expect(proof?.status).toBe('unverified');
});

test('signers confirm no one when the alias set could not be read', async () => {
	const { account, proposer } = await accountWithProposer();

	const proof = (
		await verifyProposers(account, account.address, UNREAD)
	).get(proposer);

	expect(proof?.status).toBe('unverified');
});

test('signers that do not make up the account confirm no one', async () => {
	const { account, proposer } = await accountWithProposer();

	const proof = (
		await verifyProposers(
			{
				...account,
				signerSets: account.signerSets.map((set) => ({
					...set,
					threshold: 2,
				})),
			},
			account.address,
			unchanged(account.address),
		)
	).get(proposer);

	expect(proof?.status).toBe('unverified');
});

test('signers of an account other than the one opened confirm no one', async () => {
	const { account, proposer } = await accountWithProposer();
	const opened = (await accountWithProposer()).account;

	const proof = (
		await verifyProposers(
			account,
			opened.address,
			unchanged(account.address),
		)
	).get(proposer);

	expect(proof?.status).toBe('unverified');
});

/** A transfer's bytes from `sender`, with their digest. */
async function transfer(sender: string) {
	const tx = new Transaction();
	tx.setSender(sender);
	tx.setGasPayment([
		{
			objectId: '0x2',
			version: '1',
			digest: toBase58(new Uint8Array(32)),
		},
	]);
	tx.setGasPrice(1000);
	tx.setGasBudget(10_000_000);
	tx.transferObjects([tx.gas], '0x3');
	const bytes = await tx.build();
	return {
		bytes,
		digest:
			TransactionDataBuilder.getDigestFromBytes(bytes),
	};
}

/** The account's set as a proposal lists it; the app reads only its members and threshold. */
function proposalSignerSet(
	account: Awaited<
		ReturnType<typeof accountWithProposer>
	>['account'],
) {
	return {
		address: account.address,
		threshold: account.threshold,
		currentWeight: 0,
		members: account.members,
	};
}

/** A proposal from the account's external proposer, with both events. */
async function externalProposal(): Promise<ProposerProposal> {
	const { account, proposer, proposerKey } =
		await accountWithProposer();
	const { bytes, digest } = await transfer(account.address);
	const { signature } =
		await proposerKey.signTransaction(bytes);
	return {
		digest,
		transactionBytes: toBase64(bytes),
		proposerAddress: proposer,
		accountAddress: account.address,
		signerSets: [proposalSignerSet(account)],
		signatures: [],
		events: {
			created: {
				id: 2,
				action: 'proposal.created',
				actor: proposer,
				subject: digest,
				proof: {
					kind: 'proposal.create',
					version: 1,
					signature,
				},
				createdAt: '2026-11-16T10:00:00.000Z',
			},
			proposer: account.proposers[0].event,
		},
	};
}

test('a proposal whose signers do not make up its account is not confirmed', async () => {
	const proposal = await externalProposal();

	expect(
		await checkProposalProposer(
			{
				...proposal,
				signerSets: proposal.signerSets.map((set) => ({
					...set,
					threshold: 2,
				})),
			},
			unchanged(proposal.accountAddress),
		),
	).toBe('unverified');
});

test('a proposal whose signers are not in the alias set is not confirmed', async () => {
	const proposal = await externalProposal();
	const other = (await accountWithProposer()).account;

	expect(
		await checkProposalProposer(
			proposal,
			unchanged(proposal.accountAddress),
		),
	).toBeNull();
	expect(
		await checkProposalProposer(
			proposal,
			unchanged(other.address),
		),
	).toBe('unverified');
});

test('a proposal is not confirmed when the alias set could not be read', async () => {
	const proposal = await externalProposal();

	expect(
		await checkProposalProposer(proposal, UNREAD),
	).toBe('unverified');
});

test('an external proposer without a confirmation is unconfirmed', async () => {
	const proposal = await externalProposal();

	expect(
		await checkProposalProposer(
			{
				...proposal,
				events: {
					created: proposal.events!.created,
					proposer: null,
				},
			},
			unchanged(proposal.accountAddress),
		),
	).toBe('unverified');
});

test('a member proposer who signed the proposal is not flagged', async () => {
	const { account, keys } = await accountWithProposer();
	const { bytes, digest } = await transfer(account.address);
	const { signature } =
		await keys[1].signTransaction(bytes);

	expect(
		await checkProposalProposer(
			{
				digest,
				transactionBytes: toBase64(bytes),
				proposerAddress: keys[1].toSuiAddress(),
				accountAddress: account.address,
				signerSets: [proposalSignerSet(account)],
				signatures: [
					{
						publicKey: keys[1]
							.getPublicKey()
							.toSuiPublicKey(),
						signature,
					},
				],
				events: { created: null, proposer: null },
			},
			unchanged(account.address),
		),
	).toBeNull();
});

test('trusted members come from every signer set that is an alias, and none from one that isn’t', async () => {
	const current = (await accountWithProposer()).account;
	const recovery = (await accountWithProposer()).account;
	const stranger = (await accountWithProposer()).account;

	expect(
		trustedMembers(
			[current, recovery, stranger].map(proposalSignerSet),
			{
				kind: 'read',
				aliases: [current.address, recovery.address],
			},
		),
	).toEqual([...current.members, ...recovery.members]);
});
