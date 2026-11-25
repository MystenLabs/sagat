// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { formatAddress } from '@mysten/sui/utils';
import { describe, expect, it } from 'vitest';

import { content } from '../src/content';
import {
	activityRows,
	approvalRows,
	approvalsNote,
	approvalsSignerSets,
	cancelVariant,
	foldedSignerSetsLine,
	wouldReachThreshold,
	type ApprovalsNoteInput,
	type Labels,
} from '../src/lib/proposal-page';
import {
	countSignerSets,
	type CountedProposal,
} from '../src/lib/proposalUtils';

function signer(label: string, weight: number) {
	const keypair = new Ed25519Keypair();
	return {
		label,
		weight,
		publicKey: keypair.getPublicKey().toSuiPublicKey(),
		address: keypair.getPublicKey().toSuiAddress(),
	};
}

const maya = signer('Maya', 1);
const daniel = signer('Daniel', 1);
const alice = signer('Alice', 2);
const SIGNERS = [maya, daniel, alice];
const labels: Labels = new Map(
	SIGNERS.map((s) => [s.address, s.label]),
);
const CREATED_AT = '2026-10-13T08:55:00.000Z';
const STATUS = content.proposal.approvals.status;
const NOTES = content.proposal.approvals.notes;

// The signers as a set's members, at their weights, in this order.
const members = (signers: (typeof maya)[]) =>
	signers.map((s, order) => ({
		publicKey: s.publicKey,
		weight: s.weight,
		order,
	}));

// A pending proposal for a 2-of-4 account that Daniel proposed and
// signed, counted against its one signer set; `signedBy` replaces its
// signatures.
function proposal({
	threshold = 2,
	signedBy = [daniel],
	proposer = daniel.address,
}: {
	threshold?: number;
	signedBy?: (typeof maya)[];
	proposer?: string;
} = {}): CountedProposal {
	const signatures = signedBy.map((s) => ({
		publicKey: s.publicKey,
		signature: 'sig',
	}));
	const set = { threshold, members: members(SIGNERS) };
	return {
		accountAddress: '0x1',
		accountName: 'Treasury',
		digest: 'digest',
		kind: 'transaction',
		status: 'PENDING',
		ready: false,
		transactionBytes: '',
		proposerAddress: proposer,
		description: 'Fund payroll',
		network: 'localnet',
		createdAt: CREATED_AT,
		signatures,
		signerSets: [],
		events: { created: null, proposer: null },
		executedVia: null,
		signerSetsStale: false,
		checkedSignerSets: countSignerSets(
			{ signatures, accountAddress: '0x1' },
			[{ set, address: '0x1' }],
			null,
		),
	};
}

describe('wouldReachThreshold', () => {
	it('is true only when the viewer’s weight covers what is missing', () => {
		expect(
			wouldReachThreshold(proposal(), maya.publicKey),
		).toBe(true);
		expect(
			wouldReachThreshold(
				proposal({ threshold: 3 }),
				maya.publicKey,
			),
		).toBe(false);
	});
});

describe('approvalRows', () => {
	it('marks the members who did not sign as not needed once the threshold is reached', () => {
		const rows = approvalRows(
			proposal({ signedBy: [daniel, maya] }),
			'ready',
			labels,
			maya.publicKey,
		);
		expect(
			rows.map((row) => [row.label, row.state, row.isYou]),
		).toEqual([
			['Maya', 'signed', true],
			['Daniel', 'signed', false],
			['Alice', 'not-needed', false],
		]);
	});
});

// The proposal counted against each [address, threshold, signers] set, for `viewer` when given.
function counted(
	signedBy: (typeof maya)[],
	sets: [string, number, (typeof maya)[]][],
	viewer: string | null = null,
): CountedProposal {
	const counting = proposal({ signedBy });
	counting.checkedSignerSets = countSignerSets(
		counting,
		sets.map(([address, threshold, signers]) => ({
			address,
			set: { threshold, members: members(signers) },
		})),
		viewer,
	);
	return counting;
}

describe('approvalsSignerSets', () => {
	it('counts each set on its own and shows a shared key’s signature in both', () => {
		const sets = approvalsSignerSets(
			counted(
				[maya],
				[
					['0x1', 3, SIGNERS],
					['0x2', 2, [maya, daniel]],
				],
			),
			'pending',
			labels,
			maya.publicKey,
			[],
		);
		expect(
			sets.map((set) => [
				set.address,
				set.currentWeight,
				set.threshold,
				set.line,
				set.rows.map((row) => row.signed),
			]),
		).toEqual([
			[
				'0x1',
				1,
				3,
				'Needs 2 more weight.',
				[true, false, false],
			],
			['0x2', 1, 2, 'Needs 1 more weight.', [true, false]],
		]);
	});
});

describe('foldedSignerSetsLine', () => {
	it('says a folded set reached its threshold, or while pending what the closest folded set needs when it is closer than the main set', () => {
		const erin = signer('Erin', 1);
		// Maya's pod's own set, signed by Daniel, keeps the card open; Daniel and Erin's 2-of-2 is folded.
		const line = (
			signedBy: (typeof maya)[],
			status: 'pending' | 'ready',
			ownThreshold = 3,
		) =>
			foldedSignerSetsLine(
				approvalsSignerSets(
					counted(signedBy, [
						['0x1', ownThreshold, SIGNERS],
						['0x2', 2, [daniel, erin]],
					]),
					status,
					labels,
					maya.publicKey,
					[],
				),
				status,
			);

		expect(line([daniel, erin], 'ready')).toBe(
			STATUS.reached,
		);
		expect(line([daniel], 'pending')).toBe(STATUS.needs(1));
		expect(line([daniel], 'pending', 2)).toBeNull();
	});
});

describe('cancelVariant', () => {
	it('is alone when nobody but the viewer signed', () => {
		expect(
			cancelVariant(
				proposal({ signedBy: [maya] }),
				maya.publicKey,
			),
		).toBe('alone');
		expect(cancelVariant(proposal(), maya.publicKey)).toBe(
			'others',
		);
	});
});

describe('activityRows', () => {
	it('says the proposer signed, unless they are an outside proposer', () => {
		const signing = activityRows({
			proposal: proposal({ signedBy: [daniel, maya] }),
			status: 'ready',
			labels,
			currentAddress: maya.address,
		});
		expect(
			signing.map((row) => [row.text, row.tone]),
		).toEqual([
			['Proposed and signed by Daniel', 'past'],
			['Signed by Maya (you)', 'past'],
			['Threshold reached', 'latest'],
		]);
		expect(signing[0].at).toBe(CREATED_AT);

		const outsider = new Ed25519Keypair()
			.getPublicKey()
			.toSuiAddress();
		const external = activityRows({
			proposal: proposal({ proposer: outsider }),
			status: 'pending',
			labels,
			currentAddress: maya.address,
		});
		expect(external.map((row) => row.text)).toEqual([
			`Proposed by ${formatAddress(outsider)} (external)`,
			'Signed by Daniel',
		]);
	});
});

describe('approvalsNote', () => {
	const base: Omit<ApprovalsNoteInput, 'proposal'> = {
		status: 'pending',
		labels,
		publicKey: maya.publicKey,
		viewer: 'member',
		simulation: 'passed',
		executeAfterSigning: true,
		executing: false,
		gas: null,
	};

	it('once the viewer signed, names who can still approve it alone, else the weight missing', () => {
		expect(
			approvalsNote({
				...base,
				proposal: proposal({
					threshold: 3,
					signedBy: [maya, daniel],
				}),
			}),
		).toBe('You signed. Alice can approve it.');
		expect(
			approvalsNote({
				...base,
				proposal: proposal({
					threshold: 2,
					signedBy: [maya],
				}),
			}),
		).toBe(
			'You signed. Any one of Daniel or Alice can approve it.',
		);
		expect(
			approvalsNote({
				...base,
				proposal: proposal({
					threshold: 4,
					signedBy: [maya],
				}),
			}),
		).toBe(
			'You signed. Needs 3 more weight from the other signers.',
		);
	});

	it('names the one signer left in each signer set who is enough alone', () => {
		const bob = signer('Bob', 1);
		const pending = counted(
			[maya, daniel],
			[
				['0x1', 3, SIGNERS],
				['0x2', 2, [maya, bob]],
			],
		);
		expect(
			approvalsNote({
				...base,
				labels: new Map([
					...labels,
					[bob.address, bob.label],
				]),
				proposal: pending,
			}),
		).toBe(
			'You signed. Any one of Alice or Bob can approve it.',
		);
	});

	it('stops naming who can approve it past three signers', () => {
		const pending = proposal({
			threshold: 2,
			signedBy: [maya],
		});
		const extra = [1, 2].map((i) =>
			signer(`Extra ${i}`, 1),
		);
		pending.checkedSignerSets[0].members.push(
			...extra.map((s, i) => ({
				publicKey: s.publicKey,
				weight: s.weight,
				order: SIGNERS.length + i,
			})),
		);
		expect(
			approvalsNote({ ...base, proposal: pending }),
		).toBe('You signed. Any other signer can approve it.');
	});

	it('counts the set the status line counts: the pod’s own holding the viewer, though another holding them sorts first', () => {
		const pending = counted(
			[],
			[
				['0x0', 3, SIGNERS],
				['0x1', 2, SIGNERS],
			],
			maya.address,
		);
		const [main] = approvalsSignerSets(
			pending,
			'pending',
			labels,
			maya.publicKey,
			[],
		);
		expect(main.line).toBe(STATUS.needs(2));
		expect(
			approvalsNote({ ...base, proposal: pending }),
		).toBe(NOTES.needsAfterYours(1));
	});

	it('asks an unsigned member to check the wallet when the dry run couldn’t run', () => {
		expect(
			approvalsNote({
				...base,
				proposal: proposal(),
				simulation: 'unknown',
			}),
		).toBe(
			'The transaction couldn’t be simulated. Check it in your wallet before you sign.',
		);
	});
});
