// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

// Sets up state through the real API, signing as the given users. Use these
// to get to the step under test quickly; drive that step through the UI.
import {
	defaultExpiry,
	PersonalMessages,
	type Proposal,
} from '@mysten/sagat';
import { MultiSigPublicKey } from '@mysten/sui/multisig';
import { MIST_PER_SUI } from '@mysten/sui/utils';
import { expect } from '@playwright/test';

import {
	randomAddress,
	type Chain,
	type Expiration,
	type GasCoin,
} from './chain';
import { type Fixtures } from './fixtures';
import { type Identity } from './identity';

// Creates a multisig with `creator` as its first member. Unless `accept` is
// false, every other member accepts their invitation, so the multisig is
// ready for proposals. `labels`, like `weights`, are aligned with the
// creator followed by `members`.
export async function setupMultisig({
	creator,
	members,
	threshold,
	weights,
	name,
	labels,
	accept = true,
}: {
	creator: Identity;
	members: Identity[];
	threshold: number;
	weights?: number[];
	name?: string;
	labels?: (string | null)[];
	accept?: boolean;
}) {
	// The API accepts the invitation right away for a signed-in creator.
	await signInViaApi(creator);
	const all = [creator, ...members];
	const multisig = await creator.api.createMultisig({
		publicKeys: all.map((m) => m.publicKey),
		weights: weights ?? all.map(() => 1),
		threshold,
		name,
		labels,
	});

	if (accept)
		for (const member of members)
			await acceptInvitation(member, multisig.address);
	return multisig;
}

export async function acceptInvitation(
	member: Identity,
	multisigAddress: string,
) {
	return member.api.acceptMultisigInvite(multisigAddress, {
		signature: await member.signMessage(
			PersonalMessages.acceptMultisigInvitation(
				multisigAddress,
			),
		),
	});
}

export async function rejectInvitation(
	member: Identity,
	multisigAddress: string,
) {
	return member.api.rejectMultisigInvite(multisigAddress, {
		signature: await member.signMessage(
			PersonalMessages.rejectMultisigInvitation(
				multisigAddress,
			),
		),
	});
}

// Signs in to the API with the identity's key, which also registers its
// address (so others can look up its public key).
export async function signInViaApi(identity: Identity) {
	const expiry = defaultExpiry();
	await identity.api.connect(
		await identity.signMessage(
			PersonalMessages.connect(expiry),
		),
		expiry,
	);
}

// Proposes a SUI transfer from the multisig. Proposing counts as the
// proposer's signature. Pass `gasCoin` when several proposals are pending at
// once: the API rejects two pending proposals that use the same coin.
export async function proposeTransfer(
	chain: Chain,
	proposer: Identity,
	{
		multisigAddress,
		recipient,
		amount,
		description,
		gasCoin,
		expiration,
		network = 'localnet',
	}: {
		multisigAddress: string;
		recipient: string;
		amount: bigint;
		description?: string;
		gasCoin?: GasCoin;
		expiration?: Expiration;
		network?: Parameters<
			Identity['api']['createProposal']
		>[0]['network'];
	},
) {
	const transactionBytes = await chain.buildSuiTransfer({
		sender: multisigAddress,
		recipient,
		amount,
		gasCoin,
		expiration,
	});
	return proposer.api.createProposal({
		multisigAddress,
		transactionBytes,
		signature: await proposer.signTransaction(
			transactionBytes,
		),
		description,
		network,
	});
}

export async function signProposal(
	member: Identity,
	proposal: Proposal,
) {
	return member.api.voteForProposal(proposal.id, {
		signature: await member.signTransaction(
			proposal.transactionBytes,
		),
	});
}

export async function cancelProposal(
	member: Identity,
	proposal: Proposal,
) {
	return member.api.cancelProposal(proposal.id, {
		signature: await member.signMessage(
			PersonalMessages.cancelProposal(
				proposal.digest,
				proposal.multisigAddress,
			),
		),
	});
}

// Adds `proposer` as an external proposer of the account, signed by `member`.
export async function addProposer(
	member: Identity,
	multisigAddress: string,
	proposer: string,
) {
	const expiry = defaultExpiry();
	return member.api.addMultisigProposer(
		multisigAddress,
		proposer,
		await member.signMessage(
			PersonalMessages.addMultisigProposer(
				proposer,
				multisigAddress,
				expiry,
			),
		),
		expiry,
	);
}

type MultisigMember = {
	identity: Identity;
	weight?: number;
};

export function multisigAddressOf(
	members: MultisigMember[],
	threshold: number,
) {
	return multisigPublicKeyOf(
		members,
		threshold,
	).toSuiAddress();
}

// Executes a transaction from the multisig directly on-chain, without the app
// or the API, e.g. to spend coins that a pending proposal also uses.
// `members` must be in the multisig's order; `signers` must meet the threshold.
export async function executeOutsideApp(
	chain: Chain,
	{
		members,
		threshold,
		signers,
		transactionBytes,
	}: {
		members: MultisigMember[];
		threshold: number;
		signers: Identity[];
		transactionBytes: string;
	},
) {
	const signatures = await Promise.all(
		members
			.filter(({ identity }) => signers.includes(identity))
			.map(({ identity }) =>
				identity.signTransaction(transactionBytes),
			),
	);
	await chain.execute(
		transactionBytes,
		multisigPublicKeyOf(
			members,
			threshold,
		).combinePartialSignatures(signatures),
	);
}

// Proposes a SUI transfer of more than the account holds, signed by
// `signers` (the first proposes), and executes it on-chain, where it fails.
// The API then records it as failed. `members` as for `executeOutsideApp`.
export async function proposeFailedTransfer(
	chain: Chain,
	{
		members,
		threshold,
		signers,
		gasCoin,
	}: {
		members: MultisigMember[];
		threshold: number;
		signers: Identity[];
		gasCoin?: GasCoin;
	},
) {
	const multisigAddress = multisigAddressOf(
		members,
		threshold,
	);
	const transactionBytes =
		await chain.buildOverdrawnSuiTransfer({
			sender: multisigAddress,
			recipient: randomAddress(),
			gasCoin,
		});
	const [proposer, ...others] = signers;
	const proposal = await proposer.api.createProposal({
		multisigAddress,
		transactionBytes,
		signature: await proposer.signTransaction(
			transactionBytes,
		),
		network: 'localnet',
	});
	for (const signer of others)
		await signProposal(signer, proposal);
	await expect(
		executeOutsideApp(chain, {
			members,
			threshold,
			signers,
			transactionBytes,
		}),
	).rejects.toThrow('Transaction failed');
	await chain.client.waitForTransaction({
		digest: proposal.digest,
	});
	await proposer.api.verifyProposalByDigest(
		proposal.digest,
	);
	return proposal;
}

// Alice proposes 1 SUI from her funded account; only Bob gets a browser.
export async function setupProposal(
	{ createActor, createIdentity, chain }: Fixtures,
	{
		others = [],
		threshold = 2,
		expiration,
		bob: bobOptions,
	}: {
		others?: Identity[];
		threshold?: number;
		expiration?: Expiration;
		bob?: Parameters<Fixtures['createActor']>[1];
	} = {},
) {
	const alice = createIdentity('alice');
	const bob = await createActor('bob', bobOptions);
	const multisig = await setupMultisig({
		creator: alice,
		members: [bob, ...others],
		threshold,
	});
	await chain.fund(multisig.address);
	const proposal = await proposeTransfer(chain, alice, {
		multisigAddress: multisig.address,
		recipient: randomAddress(),
		amount: MIST_PER_SUI,
		expiration,
	});
	return { alice, bob, multisig, proposal };
}

export function multisigPublicKeyOf(
	members: MultisigMember[],
	threshold: number,
) {
	return MultiSigPublicKey.fromPublicKeys({
		threshold,
		publicKeys: members.map(({ identity, weight }) => ({
			publicKey: identity.keypair.getPublicKey(),
			weight: weight ?? 1,
		})),
	});
}
