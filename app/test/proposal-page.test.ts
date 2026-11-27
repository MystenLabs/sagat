// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { type Composition } from '@mysten/sagat';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { MultiSigPublicKey } from '@mysten/sui/multisig';
import { formatAddress } from '@mysten/sui/utils';
import { publicKeyFromSuiBytes } from '@mysten/sui/verify';
import { describe, expect, it } from 'vitest';

import { content } from '../src/content';
import { signerChangeIn } from '../src/lib/change-signers';
import {
	activityRows,
	approvalRows,
	approvalsNote,
	approvalsSignerSets,
	approvalsStatus,
	cancelVariant,
	foldedSignerSetsLine,
	heldLine,
	holdingChange,
	listedStatus,
	newSignerKey,
	newSignerSets,
	shownStatus,
	signerChangeWarning,
	wouldReachThreshold,
	type ApprovalsNoteInput,
	type Labels,
} from '../src/lib/proposal-page';
import {
	countSignerSets,
	type CountedProposal,
} from '../src/lib/proposalUtils';
import { v1Proposal } from './proposal';
import { listedSet } from './signer-set';
import { digestOf, signerChange } from './transactions';

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
		...v1Proposal({
			accountName: 'Treasury',
			proposerAddress: proposer,
			description: 'Fund payroll',
			createdAt: CREATED_AT,
			signatures,
			signerSets: [listedSet({ ...set, address: '0x1' })],
		}),
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
		const signed = proposal({ signedBy: [daniel, maya] });
		const rows = approvalRows(
			signed.checkedSignerSets[0],
			signed,
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
		// A member the signer change warning names stays not signed.
		const byAlice = proposal({ signedBy: [alice] });
		expect(
			approvalRows(
				byAlice.checkedSignerSets[0],
				byAlice,
				'ready',
				labels,
				maya.publicKey,
				[maya.publicKey],
			).map((row) => row.state),
		).toEqual(['not-signed', 'not-needed', 'signed']);
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
			['0x1', 1, 3, STATUS.needs(2), [true, false, false]],
			['0x2', 1, 2, STATUS.needs(1), [true, false]],
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

const setOf = (
	threshold: number,
	signers = SIGNERS,
): Composition => ({
	threshold,
	members: signers.map((s) => ({
		publicKey: s.publicKey,
		weight: s.weight,
	})),
});
// The pod's set, weighing 4, at threshold 2.
const oldSet = setOf(2);
const pod = MultiSigPublicKey.fromPublicKeys({
	threshold: oldSet.threshold,
	publicKeys: oldSet.members.map((m) => ({
		publicKey: publicKeyFromSuiBytes(m.publicKey),
		weight: m.weight,
	})),
}).toSuiAddress();
// The bytes of a change from the pod's set to `newSet`.
const changeTo = async (newSet: Composition) =>
	(await signerChange(oldSet, newSet)).bytes;

describe('newSignerKey', () => {
	it('is the key a checked change adds, and none for a signer who stays or a stranger', async () => {
		const newKey = signer('New', 2);
		const change = signerChangeIn(
			await changeTo(setOf(3, [maya, daniel, newKey])),
			[pod],
		);

		expect(newSignerKey(change, newKey.address)).toBe(
			newKey.publicKey,
		);
		expect(newSignerKey(change, maya.address)).toBeNull();
		expect(
			newSignerKey(change, signer('Other', 1).address),
		).toBeNull();
	});
});

describe('newSignerSets', () => {
	it('counts the new set’s members who signed by the new weights against the new threshold', async () => {
		// Alice leaves for a new key of weight 2, at 3 of 4.
		const newKey = signer('New', 2);
		const change = signerChangeIn(
			await changeTo(setOf(3, [maya, daniel, newKey])),
			[pod],
		)!;
		// Alice signed too, but the new set doesn't hold her.
		const [set] = newSignerSets(
			change,
			proposal({ signedBy: [alice, maya, newKey] }),
			'ready',
			labels,
			null,
		);

		expect(set).toMatchObject({
			currentWeight: 3,
			threshold: 3,
			line: STATUS.reached,
		});
		expect(
			set.rows.map((row) => [row.publicKey, row.signed]),
		).toEqual([
			[maya.publicKey, true],
			[daniel.publicKey, false],
			[newKey.publicKey, true],
		]);
		expect(
			newSignerSets(
				change,
				proposal({ signedBy: [alice, maya] }),
				'ready',
				labels,
				null,
			)[0].line,
		).toBe(STATUS.needs(2));
	});
});

describe('signerChangeWarning', () => {
	const COPY = content.proposal.approvals.signerChange;
	const warning = (
		transactionBytes: string,
		signedBy: (typeof maya)[],
	) =>
		signerChangeWarning(
			proposal({ signedBy }),
			'ready',
			signerChangeIn(transactionBytes, [pod]),
			labels,
		);

	it('names the signers who stay and haven’t signed until they cover the new threshold, and is null for a proposal that is no signer change', async () => {
		// The threshold rises from 2 to 4.
		const transactionBytes = await changeTo(setOf(4));

		expect(warning(transactionBytes, [alice])).toEqual({
			body: COPY.body('Maya and Daniel', 2),
			notSigned: [maya.publicKey, daniel.publicKey],
		});
		expect(
			warning(transactionBytes, [alice, maya, daniel]),
		).toBeNull();
		expect(
			signerChangeWarning(
				proposal({ signedBy: [alice] }),
				'ready',
				signerChangeIn(
					proposal({ signedBy: [alice] }).transactionBytes,
					[pod],
				),
				labels,
			),
		).toBeNull();
	});

	it('names a new signer who hasn’t signed while the signers who stay miss the new threshold without them', async () => {
		// Alice leaves for a new key of weight 2: Maya and Daniel weigh 2 of the new 3 of 4.
		const newKey = signer('New', 2);
		const transactionBytes = await changeTo(
			setOf(3, [maya, daniel, newKey]),
		);

		expect(
			warning(transactionBytes, [maya, daniel]),
		).toEqual({
			body: COPY.body(formatAddress(newKey.address), 1),
			notSigned: [newKey.publicKey],
		});
		expect(
			warning(transactionBytes, [maya, newKey]),
		).toBeNull();
	});
});

describe('a held signer change', () => {
	it('holds a signer change, with no status line or note, until the new set signs for its threshold, and holds nothing for alias calls that don’t check', async () => {
		// Alice leaves for a new key of weight 2, at 3 of 4.
		const newKey = signer('New', 2);
		const transactionBytes = await changeTo(
			setOf(3, [maya, daniel, newKey]),
		);
		const held = (
			signedBy: (typeof maya)[],
			aliases = [pod],
		) =>
			signerChangeWarning(
				proposal({ signedBy }),
				'ready',
				signerChangeIn(transactionBytes, aliases),
				labels,
			) !== null;
		const ready = (isHeld: boolean) => ({
			status: approvalsStatus(
				'ready',
				false,
				'passed',
				isHeld,
			),
			note: approvalsNote({
				proposal: proposal({ signedBy: [maya, daniel] }),
				status: 'ready',
				labels,
				publicKey: maya.publicKey,
				viewer: 'member',
				simulation: 'passed',
				executeAfterSigning: false,
				executing: false,
				gas: null,
				held: isHeld,
			}),
		});

		expect(held([maya, daniel])).toBe(true);
		expect(ready(true)).toEqual({
			status: null,
			note: null,
		});
		expect(held([maya, newKey])).toBe(false);
		expect(ready(false)).toEqual({
			status: STATUS.ready,
			note: NOTES.gasPaid,
		});
		// Read against another alias set, the calls are no checked change.
		expect(held([maya, daniel], [maya.address])).toBe(
			false,
		);
	});
});

describe('heldLine', () => {
	it('holds a change that checks against the alias set read now while its new signer hasn’t signed, though the cached read held nothing, and not once they sign', async () => {
		const newKey = signer('New', 2);
		const transactionBytes = await changeTo(
			setOf(3, [maya, daniel, newKey]),
		);
		const held = (
			signedBy: (typeof maya)[],
			aliases: string[],
		) =>
			heldLine(
				{
					...proposal({ signedBy }),
					transactionBytes,
					accountAddress: pod,
					digest: digestOf(transactionBytes),
				},
				{ kind: 'read', aliases },
			);

		// The cached read of another set checks no change.
		expect(held([maya, daniel], [maya.address])).toBeNull();
		expect(held([maya, daniel], [pod])).toBe(
			content.proposal.approvals.signerChange.body(
				formatAddress(newKey.address),
				1,
			),
		);
		expect(held([maya, newKey], [pod])).toBeNull();
	});
});

describe('shownStatus', () => {
	it('says waiting for a ready signer change until its new set signs for its threshold, then ready', async () => {
		// Alice leaves for a new key of weight 2, at 3 of 4.
		const newKey = signer('New', 2);
		const change = signerChangeIn(
			await changeTo(setOf(3, [maya, daniel, newKey])),
			[pod],
		);
		const shown = (signedBy: (typeof maya)[]) =>
			shownStatus(proposal({ signedBy }), 'ready', change);

		expect(shown([maya, daniel])).toBe('waiting');
		expect(shown([maya, newKey])).toBe('ready');
	});

	it('says waiting from the bytes’ own note while the alias read failed, until the new set signs, and never for a proposal that is no signer change', async () => {
		const newKey = signer('New', 2);
		const transactionBytes = await changeTo(
			setOf(3, [maya, daniel, newKey]),
		);
		const failed = { kind: 'failed' } as const;
		const listed = (signedBy: (typeof maya)[]) =>
			listedStatus(
				{ ...proposal({ signedBy }), transactionBytes },
				'ready',
				failed,
			);
		const onPage = (signedBy: (typeof maya)[]) =>
			shownStatus(
				proposal({ signedBy }),
				'ready',
				holdingChange(transactionBytes, null, failed),
			);

		expect(listed([maya, daniel])).toBe('waiting');
		expect(onPage([maya, daniel])).toBe('waiting');
		expect(listed([maya, newKey])).toBe('ready');
		expect(onPage([maya, newKey])).toBe('ready');
		expect(
			listedStatus(
				proposal({ signedBy: [maya, daniel] }),
				'ready',
				failed,
			),
		).toBe('ready');
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
