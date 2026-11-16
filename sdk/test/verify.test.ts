// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import {
	createHash,
	generateKeyPairSync,
	sign,
} from 'node:crypto';
import { type Signer } from '@mysten/sui/cryptography';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import {
	PasskeyKeypair,
	type PasskeyProvider,
} from '@mysten/sui/keypairs/passkey';
import { Secp256k1Keypair } from '@mysten/sui/keypairs/secp256k1';
import { MultiSigPublicKey } from '@mysten/sui/multisig';
import {
	Transaction,
	TransactionDataBuilder,
} from '@mysten/sui/transactions';
import {
	fromBase64,
	toBase58,
	toBase64,
} from '@mysten/sui/utils';
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
	signer: Signer,
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

// Stands in for WebAuthn with a local P-256 key.
const fakePasskeyProvider = (): PasskeyProvider => {
	const { privateKey, publicKey } = generateKeyPairSync(
		'ec',
		{
			namedCurve: 'P-256',
		},
	);
	const authenticatorData = new Uint8Array(37);
	return {
		create: async () => ({
			rawId: new ArrayBuffer(1),
			response: {
				getPublicKey: () =>
					publicKey.export({ format: 'der', type: 'spki' }),
			},
		}),
		get: async (challenge: Uint8Array) => {
			const clientDataJSON = new TextEncoder().encode(
				JSON.stringify({
					type: 'webauthn.get',
					challenge:
						Buffer.from(challenge).toString('base64url'),
				}),
			);
			const signed = Buffer.concat([
				authenticatorData,
				createHash('sha256')
					.update(clientDataJSON)
					.digest(),
			]);
			return {
				response: {
					authenticatorData,
					clientDataJSON,
					signature: sign('sha256', signed, privateKey),
				},
			};
		},
	} as unknown as PasskeyProvider;
};

// A transfer's bytes and digest, sent by the given address.
const buildTransaction = async (sender: string) => {
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
		transactionBytes: toBase64(bytes),
		digest:
			TransactionDataBuilder.getDigestFromBytes(bytes),
	};
};

const { transactionBytes, digest } =
	await buildTransaction(accountAddress);

const signCreated = async (
	signer: Signer,
	proposerAddress = signer.toSuiAddress(),
	transaction = { transactionBytes, digest },
) => {
	const { signature } = await signer.signTransaction(
		fromBase64(transaction.transactionBytes),
	);
	const event: AccountEvent = {
		id: 2,
		action: 'proposal.created',
		actor: signer.toSuiAddress(),
		subject: transaction.digest,
		proof: {
			kind: 'proposal.create',
			version: 1,
			signature,
		},
		createdAt,
	};
	return {
		event,
		proposal: {
			...transaction,
			proposerAddress,
			multisigAddress: accountAddress,
		},
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

	test('accepts an unpadded base64 signature', async () => {
		const event = await signProposerChange(
			member,
			'proposer.added',
		);
		event.proof!.signature = String(
			event.proof?.signature,
		).replace(/=+$/, '');
		expect(
			(await verifyAccountEvent(event, context)).status,
		).toBe('verified');
	});

	test('verifies a proposer add signed by a passkey member', async () => {
		const passkey = await PasskeyKeypair.getPasskeyInstance(
			fakePasskeyProvider(),
		);
		const event = await signProposerChange(
			passkey,
			'proposer.added',
		);
		const result = await verifyAccountEvent(event, {
			accountAddress,
			members: [
				{
					publicKey: passkey
						.getPublicKey()
						.toSuiPublicKey(),
				},
			],
		});
		expect(result.status).toBe('verified');
		expect(result.signer).toBe(passkey.toSuiAddress());
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

	test('is unverified for a signature scheme it can’t check offline', async () => {
		const multisig = MultiSigPublicKey.fromPublicKeys({
			threshold: 1,
			publicKeys: [
				{ publicKey: member.getPublicKey(), weight: 1 },
			],
		});
		const event = await signProposerChange(
			member,
			'proposer.added',
		);
		event.actor = multisig.toSuiAddress();
		event.proof!.signature =
			multisig.combinePartialSignatures([
				String(event.proof?.signature),
			]);
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

	test('is invalid when a removal’s signature doesn’t check out', async () => {
		// Signed for another subject, served as this proposer's.
		const event = await signProposerChange(
			member,
			'proposer.removed',
			expiry,
			outsider.toSuiAddress(),
		);
		event.subject = proposer;
		const result = await verifyProposer({
			proposer,
			event,
			...context,
		});
		expect(result.status).toBe('invalid');
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
		event.actor = proposer;
		expect(
			(await verifyProposalCreated(event, proposal)).status,
		).toBe('invalid');
	});

	test('is invalid when the actor is not the proposal’s proposer', async () => {
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

	test('is invalid when the proposal names another digest', async () => {
		const { event, proposal } = await signCreated(outsider);
		proposal.digest = 'AnotherDigest';
		expect(
			(await verifyProposalCreated(event, proposal)).status,
		).toBe('invalid');
	});

	test('is invalid when the digest does not match the bytes', async () => {
		const { event, proposal } = await signCreated(outsider);
		event.subject = 'AnotherDigest';
		proposal.digest = 'AnotherDigest';
		expect(
			(await verifyProposalCreated(event, proposal)).status,
		).toBe('invalid');
	});

	test('is invalid when the bytes are sent by another account', async () => {
		const { event, proposal } = await signCreated(
			outsider,
			undefined,
			await buildTransaction(outsider.toSuiAddress()),
		);
		expect(
			(await verifyProposalCreated(event, proposal)).status,
		).toBe('invalid');
	});
});

describe('verifyProposalProposer', () => {
	const proposalOf = (
		proposerAddress: string,
		events: PublicProposal['events'],
		signatures: PublicProposal['signatures'] = [],
	) =>
		({
			digest,
			transactionBytes,
			proposerAddress,
			multisigAddress: accountAddress,
			events,
			signatures,
		}) as PublicProposal;

	const voteBy = async (signer: Signer) => ({
		proposalId: 1,
		publicKey: signer.getPublicKey().toSuiPublicKey(),
		signature: (
			await signer.signTransaction(
				fromBase64(transactionBytes),
			)
		).signature,
	});

	test('verifies a confirmed external proposer', async () => {
		const { event: created } = await signCreated(outsider);
		const proposerEvent = await signProposerChange(
			member,
			'proposer.added',
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
		expect(result.status).toBe('verified');
	});

	test('is unverified for an external proposal with no creation event', async () => {
		const proposerEvent = await signProposerChange(
			member,
			'proposer.added',
			expiry,
			outsider.toSuiAddress(),
		);
		const result = await verifyProposalProposer(
			proposalOf(outsider.toSuiAddress(), {
				created: null,
				proposer: proposerEvent,
			}),
			{ members },
		);
		expect(result.proposer.status).toBe('verified');
		expect(result.status).toBe('unverified');
	});

	test('verifies a member by their own vote', async () => {
		const result = await verifyProposalProposer(
			proposalOf(
				member.toSuiAddress(),
				{ created: null, proposer: null },
				[await voteBy(member)],
			),
			{ members },
		);
		expect(result.status).toBe('verified');
	});

	test('is unverified for a member whose own signature isn’t on the proposal', async () => {
		const result = await verifyProposalProposer(
			proposalOf(
				member.toSuiAddress(),
				{ created: null, proposer: null },
				[await voteBy(otherMember)],
			),
			{ members },
		);
		expect(result.status).toBe('unverified');
	});

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

	test('is invalid for a member whose created proof is invalid', async () => {
		const { event: created } = await signCreated(member);
		created.subject = 'AnotherDigest';
		const result = await verifyProposalProposer(
			proposalOf(member.toSuiAddress(), {
				created,
				proposer: null,
			}),
			{ members },
		);
		expect(result.status).toBe('invalid');
	});
});
