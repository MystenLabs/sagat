// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { formatAddress } from '@mysten/sui/utils';
import { describe, expect, test } from 'vitest';

import {
	addressInput,
	checkSigners,
	COPY,
	invitedName,
	nameError,
	signerName,
	thresholdBar,
	thresholdWarning,
	type SignerDraft,
} from '../src/lib/create-multisig';
import {
	computeMultisigAddress,
	validatePublicKey,
} from '../src/lib/sui-utils';

const key = () =>
	new Ed25519Keypair().getPublicKey().toSuiPublicKey();

const signer = (
	id: string,
	changes: Partial<SignerDraft> = {},
): SignerDraft => ({
	id,
	label: '',
	key: key(),
	weight: 1,
	...changes,
});

describe('threshold warnings', () => {
	test('one signer who can approve alone', () => {
		expect(
			thresholdWarning({
				signers: [
					{ name: 'Maya', weight: 255 },
					{ name: 'Alice', weight: 1 },
				],
				threshold: 4,
				totalWeight: 256,
			}),
		).toBe(
			'Maya can approve proposals alone. Maya’s weight (255) is at or above the threshold (4). Lower Maya’s weight below 4, or raise the threshold above 255.',
		);
	});

	test('several signers, named with "or"', () => {
		expect(
			thresholdWarning({
				signers: [
					{ name: 'Maya', weight: 2 },
					{ name: 'Daniel', weight: 2 },
					{ name: 'Alice', weight: 1 },
				],
				threshold: 2,
				totalWeight: 5,
			}),
		).toBe(
			'Maya or Daniel can approve proposals alone. Raise the threshold to 3 or more so every proposal needs at least two signers.',
		);
	});

	test('every signer must sign when leaving any one out falls short', () => {
		// 2 and 2 at a threshold of 3: neither can be spared.
		expect(
			thresholdWarning({
				signers: [
					{ name: 'Manos', weight: 2 },
					{ name: 'Marcus', weight: 2 },
				],
				threshold: 3,
				totalWeight: 4,
			}),
		).toMatch(/^Every signer must sign/);
		// 2, 2 and 1 at 3: the 1 can be spared, so no warning.
		expect(
			thresholdWarning({
				signers: [
					{ name: 'Manos', weight: 2 },
					{ name: 'Marcus', weight: 2 },
					{ name: 'Alice', weight: 1 },
				],
				threshold: 3,
				totalWeight: 5,
			}),
		).toBeNull();
	});

	test('the creator alone is addressed as "you", named or not', () => {
		expect(
			thresholdWarning({
				signers: [
					{ name: 'Maya', weight: 2, you: true },
					{ name: 'Daniel', weight: 1 },
				],
				threshold: 2,
				totalWeight: 3,
			}),
		).toBe(
			'You can approve proposals alone. Your weight (2) is at or above the threshold (2). Lower your weight below 2, or raise the threshold above 2.',
		);
	});

	test('"you" is lowercase after the first name in the list', () => {
		expect(
			thresholdWarning({
				signers: [
					{ name: 'Daniel', weight: 2 },
					{ name: 'Maya', weight: 2, you: true },
				],
				threshold: 2,
				totalWeight: 4,
			}),
		).toBe(
			'Daniel or you can approve proposals alone. Raise the threshold to 3 or more so every proposal needs at least two signers.',
		);
	});

	test('a named creator is "you" in the warning from checkSigners', () => {
		const check = checkSigners({
			signers: [
				signer('1', {
					isCreator: true,
					label: 'Maya',
					weight: 2,
				}),
				signer('2', { label: 'Daniel' }),
			],
			threshold: 2,
			lookups: {},
		});
		expect(check.warning).toMatch(
			/^You can approve proposals alone\. Your weight/,
		);
	});

	test('every signer must sign, and nothing below that', () => {
		const signers = [1, 1, 1].map((weight) => ({
			name: 'x',
			weight,
		}));
		expect(
			thresholdWarning({
				signers,
				threshold: 3,
				totalWeight: 3,
			}),
		).toMatch(/^Every signer must sign/);
		expect(
			thresholdWarning({
				signers,
				threshold: 2,
				totalWeight: 3,
			}),
		).toBeNull();
	});
});

describe('threshold bar', () => {
	test('a segment per weight up to 10', () => {
		expect(thresholdBar(4, 7)).toEqual({
			kind: 'segments',
			filled: [true, true, true, true, false, false, false],
		});
	});

	test('every segment fills at and above the total', () => {
		const full = {
			kind: 'segments',
			filled: [true, true, true],
		};
		expect(thresholdBar(3, 3)).toEqual(full);
		expect(thresholdBar(4, 3)).toEqual(full);
		expect(thresholdBar(20, 20)).toEqual({
			kind: 'continuous',
			percent: 100,
		});
		expect(thresholdBar(30, 20)).toEqual({
			kind: 'continuous',
			percent: 100,
		});
	});

	test('one segment while there is no weight yet', () => {
		expect(thresholdBar(1, 0)).toEqual({
			kind: 'segments',
			filled: [true],
		});
	});

	test('a continuous bar above 10 that stays visible', () => {
		expect(thresholdBar(4, 260)).toEqual({
			kind: 'continuous',
			percent: 4,
		});
		expect(thresholdBar(130, 260)).toEqual({
			kind: 'continuous',
			percent: 50,
		});
	});
});

describe('signer checks', () => {
	test('blank, invalid and duplicate rows hold Continue and drop out of the totals', () => {
		const daniel = signer('2', {
			label: 'Daniel',
			weight: 2,
		});
		const check = checkSigners({
			signers: [
				signer('1', { isCreator: true, label: 'Maya' }),
				daniel,
				signer('3', { key: '' }),
				signer('4', { key: 'AGx9Q2mT7vR4kLpZ' }),
				signer('5', { key: daniel.key }),
			],
			threshold: 1,
			lookups: {},
		});
		expect(check.completeCount).toBe(2);
		expect(check.incompleteCount).toBe(3);
		expect(check.totalWeight).toBe(3);
		expect(check.canContinue).toBe(false);
		expect(check.address).toBeNull();
		expect(check.blockedMessage).toBe(
			'Finish or remove signers 3, 4 and 5 to continue.',
		);
		expect(check.signers[4].status).toEqual({
			kind: 'error',
			message:
				'Daniel (signer 2) already uses this key. Each signer needs their own key.',
		});
	});

	test('an address with no key on record asks for one', () => {
		const address = `0x${'ab'.repeat(32)}`;
		const check = checkSigners({
			signers: [
				signer('1', { isCreator: true }),
				signer('2', { label: 'Leon', key: address }),
			],
			threshold: 1,
			lookups: { [address]: { kind: 'missing' } },
		});
		expect(check.signers[1].status).toEqual({
			kind: 'no-key',
			message:
				'No public key found for this address. It hasn’t signed a transaction yet. Ask Leon for their public key.',
		});
		expect(check.blockedMessage).toBe(
			'Add a public key for signer 2, or remove the row, to continue.',
		);
	});

	test('a complete setup continues, with the address the SDK derives', () => {
		const signers = [
			signer('1', { isCreator: true, weight: 2 }),
			signer('2', { label: 'Daniel' }),
			signer('3'),
		];
		const check = checkSigners({
			signers,
			threshold: 3,
			lookups: {},
		});
		expect(check.canContinue).toBe(true);
		expect(check.blockedMessage).toBeNull();
		expect(check.addressMessage).toBeNull();
		expect(check.totalWeight).toBe(4);
		expect(check.address).toBe(
			computeMultisigAddress(
				signers.map((s) => s.key),
				signers.map((s) => s.weight),
				3,
			).address,
		);
	});

	test('a name over the label limit leaves the row incomplete', () => {
		const check = checkSigners({
			signers: [
				signer('1', { isCreator: true }),
				signer('2', { label: 'x'.repeat(65) }),
			],
			threshold: 1,
			lookups: {},
		});
		expect(check.signers[1]).toMatchObject({
			labelLength: 65,
			labelTooLong: true,
			complete: false,
		});
		expect(check.signers[1].status.kind).toBe('valid');
		expect(check.canContinue).toBe(false);
	});

	test('an address shows as looking up until its lookup fails', () => {
		const address = `0x${'cd'.repeat(32)}`;
		const rows = [
			signer('1', { isCreator: true }),
			signer('2', { key: address }),
		];
		const statusWith = (
			lookups: Parameters<
				typeof checkSigners
			>[0]['lookups'],
		) =>
			checkSigners({ signers: rows, threshold: 1, lookups })
				.signers[1].status;

		expect(statusWith({})).toEqual({ kind: 'looking-up' });
		expect(
			statusWith({
				[address]: {
					kind: 'error',
					message: 'A multisig.',
				},
			}),
		).toEqual({ kind: 'error', message: 'A multisig.' });
		expect(
			statusWith({ [address]: { kind: 'unreachable' } }),
		).toEqual({
			kind: 'error',
			message: COPY.lookupFailed,
		});
	});

	test('a row dragged above the creator is the duplicate, not the creator', () => {
		const creator = signer('1', { isCreator: true });
		const check = checkSigners({
			signers: [signer('2', { key: creator.key }), creator],
			threshold: 1,
			lookups: {},
		});
		expect(check.signers[0].status).toEqual({
			kind: 'error',
			message:
				'You already use this key (signer 2). Each signer needs their own key.',
		});
		expect(check.signers[1].status.kind).toBe('valid');
	});

	test('an unnamed duplicate owner goes by its position', () => {
		const bob = signer('2');
		const check = checkSigners({
			signers: [
				signer('1', { isCreator: true }),
				bob,
				signer('3', { key: bob.key }),
			],
			threshold: 1,
			lookups: {},
		});
		expect(check.signers[2].status).toEqual({
			kind: 'error',
			message:
				'Signer 2 already uses this key. Each signer needs their own key.',
		});
	});

	test('signers go by their label, "You" or their position', () => {
		expect(
			signerName(signer('1', { label: ' Maya ' }), 0),
		).toBe('Maya');
		expect(
			signerName(signer('1', { isCreator: true }), 0),
		).toBe('You');
		expect(signerName(signer('3'), 2)).toBe('Signer 3');
	});

	test('the creator alone cannot continue, with no helper text', () => {
		const check = checkSigners({
			signers: [signer('1', { isCreator: true })],
			threshold: 1,
			lookups: {},
		});
		expect(check.tooFewSigners).toBe(true);
		expect(check.canContinue).toBe(false);
		expect(check.blockedMessage).toBeNull();
		expect(check.warning).toBeNull();
	});
});

describe('name', () => {
	test('is required, ignoring surrounding spaces', () => {
		expect(nameError('')).toBe('Give the multisig a name.');
		expect(nameError('   ')).toBe(
			'Give the multisig a name.',
		);
		expect(nameError('  Treasury  ')).toBeNull();
	});

	test('counts code points after NFC, up to 40', () => {
		expect(nameError('x'.repeat(40))).toBeNull();
		expect(nameError('x'.repeat(41))).toBe(
			'41 of 40 characters. Use 40 or fewer.',
		);
		// 40 emoji are 80 UTF-16 units but 40 characters.
		expect(nameError('😀'.repeat(40))).toBeNull();
		// "e" plus a combining accent composes into one character.
		expect(nameError('e\u0301'.repeat(40))).toBeNull();
	});
});

describe('address input', () => {
	const hex = 'ab'.repeat(32);

	test('normalizes a pasted address', () => {
		expect(addressInput(`  0x${hex}  `)).toBe(`0x${hex}`);
		expect(addressInput(`0x${hex.toUpperCase()}`)).toBe(
			`0x${hex}`,
		);
		expect(addressInput(hex)).toBe(`0x${hex}`);
	});

	test('is null for anything but a full address', () => {
		expect(addressInput('')).toBeNull();
		expect(addressInput('0x1234')).toBeNull();
		expect(addressInput(key())).toBeNull();
	});
});

describe('invited name', () => {
	test('a label, else the short address, else "a signer"', () => {
		const withKey = signer('2');
		const { address } = validatePublicKey(withKey.key);
		expect(
			invitedName(signer('2', { label: ' Daniel ' })),
		).toBe('Daniel');
		expect(invitedName(withKey)).toBe(
			formatAddress(address!),
		);
		expect(invitedName(signer('2', { key: '' }))).toBe(
			'a signer',
		);
	});
});

describe('hidden characters in names', () => {
	test('a zero-width joiner holds the row, as the API would refuse it', () => {
		const check = checkSigners({
			signers: [
				signer('1', { isCreator: true, label: 'Maya' }),
				signer('2', {
					label: 'Daniel \u{1F469}\u200D\u{1F4BB}',
				}),
			],
			threshold: 1,
			lookups: {},
		});
		expect(check.signers[1].labelInvalid).toBe(true);
		expect(check.signers[1].complete).toBe(false);
		expect(check.canContinue).toBe(false);
		expect(check.blockedMessage).toBe(
			'Finish or remove signer 2 to continue.',
		);
		// Emoji without a joiner are fine.
		expect(
			checkSigners({
				signers: [
					signer('1', { isCreator: true }),
					signer('2', { label: 'Daniel \u{1F4BB}' }),
				],
				threshold: 1,
				lookups: {},
			}).signers[1].labelInvalid,
		).toBe(false);
	});
});
