// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { type Keypair } from '@mysten/sui/cryptography';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { Secp256k1Keypair } from '@mysten/sui/keypairs/secp256k1';
import { toBase64 } from '@mysten/sui/utils';
import { describe, expect, test } from 'bun:test';

import {
	PersonalMessages,
	verifyAccountEvent,
	verifyProposalCreated,
	verifyProposalProposer,
	verifyProposer,
	type AccountEvent,
	type PublicProposal,
} from '../src/index.js';

const member = new Ed25519Keypair();
const otherMember = new Secp256k1Keypair();
const outsider = new Ed25519Keypair();
const proposer = new Ed25519Keypair().toSuiAddress();
const accountAddress = `0x${'ab'.repeat(32)}`;
const members = [member, otherMember].map((k) => ({
	publicKey: k.getPublicKey().toSuiPublicKey(),
}));
const context = { accountAddress, members };
const expiry = '2026-11-16T10:00:00.000Z';
const createdAt = '2026-11-16T09:55:00.000Z';

const signProposerChange = async (
	signer: Keypair,
	action: 'proposer.added' | 'proposer.removed',
	signedExpiry: string | number = expiry,
	subject = proposer,
): Promise<AccountEvent> => {
	const add = action === 'proposer.added';
	const message = (
		add
			? PersonalMessages.addMultisigProposer
			: PersonalMessages.removeMultisigProposer
	)(subject, accountAddress, String(signedExpiry));
	const { signature } = await signer.signPersonalMessage(
		new TextEncoder().encode(message),
	);
	return {
		id: 1,
		action,
		actor: signer.toSuiAddress(),
		subject,
		proof: {
			kind: add ? 'proposer.add' : 'proposer.remove',
			version: 1,
			signature,
			expiry: signedExpiry,
		},
		createdAt,
	};
};

const transactionBytes = toBase64(
	new Uint8Array([1, 2, 3, 4]),
);
const digest = 'DigestOfTheProposal';

const signCreated = async (
	signer: Keypair,
	proposerAddress = signer.toSuiAddress(),
) => {
	const { signature } = await signer.signTransaction(
		new Uint8Array([1, 2, 3, 4]),
	);
	const event: AccountEvent = {
		id: 2,
		action: 'proposal.created',
		actor: signer.toSuiAddress(),
		subject: digest,
		proof: {
			kind: 'proposal.create',
			version: 1,
			signature,
		},
		createdAt,
	};
	return {
		event,
		proposal: { digest, proposerAddress, transactionBytes },
	};
};

describe('verifyAccountEvent', () => {
	test('verifies a proposer add signed by a member', async () => {
		const event = await signProposerChange(
			member,
			'proposer.added',
		);
		expect(
			await verifyAccountEvent(event, context),
		).toEqual({
			status: 'verified',
			signer: member.toSuiAddress(),
			createdAt,
		});
	});

	test('verifies a proposer removal signed by a Secp256k1 member', async () => {
		const event = await signProposerChange(
			otherMember,
			'proposer.removed',
		);
		const result = await verifyAccountEvent(event, context);
		expect(result.status).toBe('verified');
		expect(result.signer).toBe(otherMember.toSuiAddress());
	});

	test('accepts a padded base64 signature', async () => {
		const event = await signProposerChange(
			member,
			'proposer.added',
		);
		expect(event.proof?.signature).toEndWith('=');
		expect(
			(await verifyAccountEvent(event, context)).status,
		).toBe('verified');
	});

	test('is invalid when the signature is not over the rebuilt message', async () => {
		const event = await signProposerChange(
			member,
			'proposer.added',
		);
		event.subject = new Ed25519Keypair().toSuiAddress();
		expect(
			(await verifyAccountEvent(event, context)).status,
		).toBe('invalid');
	});

	test('is invalid when the signer is not the actor', async () => {
		const event = await signProposerChange(
			member,
			'proposer.added',
		);
		event.actor = otherMember.toSuiAddress();
		expect(
			(await verifyAccountEvent(event, context)).status,
		).toBe('invalid');
	});

	test('is invalid when the signer is not a member', async () => {
		const event = await signProposerChange(
			outsider,
			'proposer.added',
		);
		expect(
			await verifyAccountEvent(event, context),
		).toEqual({
			status: 'invalid',
			signer: null,
			createdAt,
		});
	});

	test('is unverified without an event', async () => {
		expect(await verifyAccountEvent(null, context)).toEqual(
			{
				status: 'unverified',
				signer: null,
				createdAt: null,
			},
		);
	});

	test('is unverified when the proof is null', async () => {
		const event = await signProposerChange(
			member,
			'proposer.added',
		);
		event.proof = null;
		expect(
			(await verifyAccountEvent(event, context)).status,
		).toBe('unverified');
	});

	test('is unverified for an unknown proof version', async () => {
		const event = await signProposerChange(
			member,
			'proposer.added',
		);
		event.proof = { ...event.proof, version: 2 };
		expect(
			(await verifyAccountEvent(event, context)).status,
		).toBe('unverified');
	});

	test('rebuilds a numeric or non-ISO expiry as it was signed', async () => {
		const numeric = await signProposerChange(
			member,
			'proposer.added',
			1763287200000,
		);
		const plain = await signProposerChange(
			member,
			'proposer.added',
			'tomorrow',
		);
		expect(
			(await verifyAccountEvent(numeric, context)).status,
		).toBe('verified');
		expect(
			(await verifyAccountEvent(plain, context)).status,
		).toBe('verified');
	});
});

describe('verifyProposer', () => {
	test('verifies a member proposer by membership alone', async () => {
		const result = await verifyProposer({
			proposer: otherMember.toSuiAddress(),
			event: null,
			...context,
		});
		expect(result.status).toBe('verified');
	});

	test('verifies an external proposer by their add event', async () => {
		const event = await signProposerChange(
			member,
			'proposer.added',
		);
		const result = await verifyProposer({
			proposer,
			event,
			...context,
		});
		expect(result.status).toBe('verified');
	});

	test('is unverified when the newest event is a removal', async () => {
		const event = await signProposerChange(
			member,
			'proposer.removed',
		);
		const result = await verifyProposer({
			proposer,
			event,
			...context,
		});
		expect(result.status).toBe('unverified');
	});

	test('is invalid when the event names another proposer', async () => {
		const event = await signProposerChange(
			member,
			'proposer.added',
		);
		const result = await verifyProposer({
			proposer: outsider.toSuiAddress(),
			event,
			...context,
		});
		expect(result.status).toBe('invalid');
	});
});

describe('verifyProposalCreated', () => {
	test('verifies the proposer’s signature over the transaction bytes', async () => {
		const { event, proposal } = await signCreated(outsider);
		expect(
			await verifyProposalCreated(event, proposal),
		).toEqual({
			status: 'verified',
			signer: outsider.toSuiAddress(),
			createdAt,
		});
	});

	test('is invalid when someone other than the proposer signed', async () => {
		const { event, proposal } = await signCreated(
			outsider,
			proposer,
		);
		expect(
			(await verifyProposalCreated(event, proposal)).status,
		).toBe('invalid');
	});

	test('is invalid when the event names another digest', async () => {
		const { event, proposal } = await signCreated(outsider);
		event.subject = 'AnotherDigest';
		expect(
			(await verifyProposalCreated(event, proposal)).status,
		).toBe('invalid');
	});
});

describe('verifyProposalProposer', () => {
	const proposalOf = (
		proposerAddress: string,
		events: PublicProposal['events'],
	) =>
		({
			digest,
			transactionBytes,
			proposerAddress,
			multisigAddress: accountAddress,
			events,
		}) as PublicProposal;

	test('takes the worse of the created and proposer results', async () => {
		const { event: created } = await signCreated(outsider);
		const proposerEvent = await signProposerChange(
			member,
			'proposer.removed',
			expiry,
			outsider.toSuiAddress(),
		);
		const result = await verifyProposalProposer(
			proposalOf(outsider.toSuiAddress(), {
				created,
				proposer: proposerEvent,
			}),
			{ members },
		);
		expect(result.created.status).toBe('verified');
		expect(result.status).toBe('unverified');
	});
});
