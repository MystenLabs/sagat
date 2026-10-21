// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

// Unit tests for the pure signer set math (no database, no network).

import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { MultiSigPublicKey } from '@mysten/sui/multisig';
import { normalizeSuiAddress } from '@mysten/sui/utils';
import {
	beforeAll,
	describe,
	expect,
	test,
} from 'bun:test';

import {
	accountRotationEvents,
	multisigProposalEvents,
} from '../src/metrics';
import {
	ALL_NETWORKS,
	recordEvent,
} from '../src/services/events';
import {
	orderedSignaturesFor,
	pickExecutableSignerSet,
	proposalProgress,
	type ProposalSignatures,
	type SignerSetComposition,
} from '../src/services/signer-progress';

const keys = Array.from(
	{ length: 5 },
	() => new Ed25519Keypair(),
);
const [k1, k2, k3, k4, k5] = keys;
const pk = (k: Ed25519Keypair) =>
	k.getPublicKey().toSuiPublicKey();

const BYTES = new TextEncoder().encode('proposal bytes');
const signatures = new Map<Ed25519Keypair, string>();
beforeAll(async () => {
	for (const k of keys) {
		signatures.set(
			k,
			(await k.signTransaction(BYTES)).signature,
		);
	}
});

function signerSet(
	label: string,
	members: [Ed25519Keypair, number][],
	threshold: number,
): SignerSetComposition & { multisig: MultiSigPublicKey } {
	const multisig = MultiSigPublicKey.fromPublicKeys({
		threshold,
		publicKeys: members.map(([k, weight]) => ({
			publicKey: k.getPublicKey(),
			weight,
		})),
	});
	return {
		address: multisig.toSuiAddress(),
		label,
		threshold,
		multisig,
		members: members.map(([k, weight], order) => ({
			publicKey: pk(k),
			weight,
			order,
			isAccepted: true,
		})),
	};
}

// The account's original composition, and a rotation that carries over k2
// and k3 and adds k4.
const A = signerSet(
	'Operations',
	[
		[k1, 1],
		[k2, 1],
		[k3, 1],
	],
	2,
);
const B = signerSet(
	'Board',
	[
		[k2, 1],
		[k3, 1],
		[k4, 1],
	],
	2,
);

function proposal(
	signers: Ed25519Keypair[],
	accountAddress = A.address,
): ProposalSignatures {
	return {
		accountAddress,
		signatures: signers.map((k) => ({
			publicKey: pk(k),
			signature: signatures.get(k)!,
		})),
	};
}

describe('proposalProgress', () => {
	test('one set: weights, threshold, and member order', () => {
		const [none] = proposalProgress(proposal([]), [A]);
		expect(none).toMatchObject({
			address: A.address,
			label: 'Operations',
			threshold: 2,
			totalWeight: 3,
			currentWeight: 0,
			hasReachedThreshold: false,
		});

		const [one] = proposalProgress(proposal([k3]), [A]);
		expect(one.currentWeight).toBe(1);
		expect(one.hasReachedThreshold).toBe(false);
		expect(
			one.members.map((m) => [m.order, m.hasSigned]),
		).toEqual([
			[0, false],
			[1, false],
			[2, true],
		]);

		const [two] = proposalProgress(proposal([k1, k3]), [A]);
		expect(two.currentWeight).toBe(2);
		expect(two.hasReachedThreshold).toBe(true);
	});

	test('members are returned in order even when stored out of order', () => {
		const shuffled = {
			...A,
			members: [...A.members].reverse(),
		};
		const [progress] = proposalProgress(proposal([k1]), [
			shuffled,
		]);
		expect(
			progress.members.map((m) => m.publicKey),
		).toEqual([pk(k1), pk(k2), pk(k3)]);
	});

	test('weighted members', () => {
		const W = signerSet(
			'Weighted',
			[
				[k1, 3],
				[k2, 1],
				[k5, 1],
			],
			3,
		);
		const [onlySmall] = proposalProgress(
			proposal([k2, k5]),
			[W],
		);
		expect(onlySmall.totalWeight).toBe(5);
		expect(onlySmall.currentWeight).toBe(2);
		expect(onlySmall.hasReachedThreshold).toBe(false);

		const [heavy] = proposalProgress(proposal([k1]), [W]);
		expect(heavy.currentWeight).toBe(3);
		expect(heavy.hasReachedThreshold).toBe(true);
	});

	test('two overlapping sets: a key in both signs once and counts in both', () => {
		const [a, b] = proposalProgress(proposal([k2]), [A, B]);
		expect(a.currentWeight).toBe(1);
		expect(b.currentWeight).toBe(1);
		expect(
			a.members.find((m) => m.publicKey === pk(k2))
				?.hasSigned,
		).toBe(true);
		expect(
			b.members.find((m) => m.publicKey === pk(k2))
				?.hasSigned,
		).toBe(true);
	});

	test('threshold reached in one set only', () => {
		const [a, b] = proposalProgress(proposal([k1, k2]), [
			A,
			B,
		]);
		expect(a.hasReachedThreshold).toBe(true);
		expect(b.hasReachedThreshold).toBe(false);
		expect(b.currentWeight).toBe(1);
	});

	test('unaccepted members are marked, and their weight still counts', () => {
		const pendingK4 = {
			...B,
			members: B.members.map((m) =>
				m.publicKey === pk(k4)
					? { ...m, isAccepted: false }
					: m,
			),
		};
		const [b] = proposalProgress(proposal([k3, k4]), [
			pendingK4,
		]);
		expect(
			b.members.map((m) => [m.publicKey, m.isAccepted]),
		).toEqual([
			[pk(k2), true],
			[pk(k3), true],
			[pk(k4), false],
		]);
		expect(b.currentWeight).toBe(2);
		expect(b.hasReachedThreshold).toBe(true);
	});

	test('signatures from keys in no valid set are ignored', () => {
		// After A is retired, k1 is no longer in any valid set.
		const [b] = proposalProgress(proposal([k1, k2, k5]), [
			B,
		]);
		expect(b.currentWeight).toBe(1);
		expect(b.hasReachedThreshold).toBe(false);
	});
});

describe('pickExecutableSignerSet', () => {
	test('null when no set has reached threshold', () => {
		expect(
			pickExecutableSignerSet(proposal([k1]), [A, B]),
		).toBeNull();
		expect(
			pickExecutableSignerSet(proposal([]), []),
		).toBeNull();
	});

	test('the set that reached threshold', () => {
		expect(
			pickExecutableSignerSet(proposal([k1, k2]), [A, B]),
		).toBe(A);
		expect(
			pickExecutableSignerSet(proposal([k3, k4]), [A, B]),
		).toBe(B);
	});

	test('prefers the original composition, whatever the weight', () => {
		// A: 3 of 2, B: 2 of 2; A is the account.
		expect(
			pickExecutableSignerSet(proposal([k1, k2, k3]), [
				B,
				A,
			]),
		).toBe(A);
		// A: 2 of 2, B: 3 of 2; A is still preferred.
		expect(
			pickExecutableSignerSet(proposal([k2, k3, k4]), [
				B,
				A,
			]),
		).toBe(A);
		// B is the account.
		expect(
			pickExecutableSignerSet(
				proposal([k2, k3], B.address),
				[A, B],
			),
		).toBe(B);
	});

	test('otherwise the first executable set in input order', () => {
		const other = normalizeSuiAddress('0xacc');
		expect(
			pickExecutableSignerSet(proposal([k2, k3], other), [
				B,
				A,
			]),
		).toBe(B);
		expect(
			pickExecutableSignerSet(proposal([k2, k3], other), [
				A,
				B,
			]),
		).toBe(A);
		// The original has not reached threshold: the other set is picked.
		expect(
			pickExecutableSignerSet(proposal([k3, k4]), [A, B]),
		).toBe(B);
	});

	test('removed-member signatures do not make a set executable', () => {
		expect(
			pickExecutableSignerSet(proposal([k1, k2]), [B]),
		).toBeNull();
		expect(
			pickExecutableSignerSet(proposal([k1, k2, k4]), [B]),
		).toBe(B);
	});
});

describe('orderedSignaturesFor', () => {
	test('member order, only members, and the result combines into a valid signature', async () => {
		// Stored in reverse order, with signatures from a non-member (k1 for B)
		// and from a key in no set (k5).
		const p = proposal([k5, k4, k3, k2, k1]);

		const forB = orderedSignaturesFor(p, B);
		expect(forB).toEqual([
			signatures.get(k2)!,
			signatures.get(k3)!,
			signatures.get(k4)!,
		]);
		const combinedB =
			B.multisig.combinePartialSignatures(forB);
		expect(
			await B.multisig.verifyTransaction(BYTES, combinedB),
		).toBe(true);

		const forA = orderedSignaturesFor(p, A);
		expect(forA).toEqual([
			signatures.get(k1)!,
			signatures.get(k2)!,
			signatures.get(k3)!,
		]);
		expect(
			await A.multisig.verifyTransaction(
				BYTES,
				A.multisig.combinePartialSignatures(forA),
			),
		).toBe(true);
	});

	test('the same partial signatures combine for two sets', async () => {
		const p = proposal([k3, k2]);
		for (const set of [A, B]) {
			const ordered = orderedSignaturesFor(p, set);
			expect(ordered).toEqual([
				signatures.get(k2)!,
				signatures.get(k3)!,
			]);
			expect(
				await set.multisig.verifyTransaction(
					BYTES,
					set.multisig.combinePartialSignatures(ordered),
				),
			).toBe(true);
		}
	});

	test('uses the order field, not the array order', () => {
		const shuffled = {
			...B,
			members: [B.members[2], B.members[0], B.members[1]],
		};
		expect(
			orderedSignaturesFor(proposal([k4, k2]), shuffled),
		).toEqual([signatures.get(k2)!, signatures.get(k4)!]);
	});

	test('empty when no member signed', () => {
		expect(orderedSignaturesFor(proposal([k1]), B)).toEqual(
			[],
		);
	});
});

describe('recordEvent', () => {
	const count = async (
		counter:
			| typeof accountRotationEvents
			| typeof multisigProposalEvents,
		labels: Record<string, string>,
	) =>
		(await counter.get()).values.find((v) =>
			Object.entries(labels).every(
				([k, val]) =>
					(v.labels as Record<string, string>)[k] === val,
			),
		)?.value ?? 0;

	test('proposal events go to the existing counter', async () => {
		const labels = {
			network: 'devnet',
			event_type: 'signature_added',
		};
		const before = await count(
			multisigProposalEvents,
			labels,
		);
		recordEvent({
			type: 'signature_added',
			network: 'devnet',
		});
		expect(
			await count(multisigProposalEvents, labels),
		).toBe(before + 1);
		expect(await count(accountRotationEvents, labels)).toBe(
			0,
		);
	});

	test('rotation events go to account_rotation_events_total', async () => {
		const labels = {
			network: 'devnet',
			event_type: 'alias_added',
		};
		const before = await count(
			accountRotationEvents,
			labels,
		);
		recordEvent({
			type: 'alias_added',
			network: 'devnet',
			accountAddress: A.address,
			aliasAddress: B.address,
		});
		expect(await count(accountRotationEvents, labels)).toBe(
			before + 1,
		);

		recordEvent({
			type: 'signer_set_drafted',
			accountAddress: A.address,
			signerSetAddress: B.address,
		});
		expect(
			await count(accountRotationEvents, {
				network: ALL_NETWORKS,
				event_type: 'signer_set_drafted',
			}),
		).toBeGreaterThanOrEqual(1);
	});
});
