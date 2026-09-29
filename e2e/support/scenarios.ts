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

import { type Chain, type GasCoin } from './chain';
import { type Identity } from './identity';

// Creates a multisig with `creator` as its first member. Unless `accept` is
// false, every other member accepts their invitation, so the multisig is
// ready for proposals.
export async function setupMultisig({
	creator,
	members,
	threshold,
	weights,
	name,
	accept = true,
}: {
	creator: Identity;
	members: Identity[];
	threshold: number;
	weights?: number[];
	name?: string;
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
	});

	if (accept)
		for (const member of members)
			await member.api.acceptMultisigInvite(
				multisig.address,
				{
					signature: await member.signMessage(
						PersonalMessages.acceptMultisigInvitation(
							multisig.address,
						),
					),
				},
			);
	return multisig;
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
	}: {
		multisigAddress: string;
		recipient: string;
		amount: bigint;
		description?: string;
		gasCoin?: GasCoin;
	},
) {
	const transactionBytes = await chain.buildSuiTransfer({
		sender: multisigAddress,
		recipient,
		amount,
		gasCoin,
	});
	return proposer.api.createProposal({
		multisigAddress,
		transactionBytes,
		signature: await proposer.signTransaction(
			transactionBytes,
		),
		description,
		network: 'localnet',
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
			PersonalMessages.cancelProposal(proposal.id),
		),
	});
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

function multisigPublicKeyOf(
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
