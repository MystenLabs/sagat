// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { Transaction } from '@mysten/sui/transactions';
import {
	normalizeSuiAddress,
	SUI_TYPE_ARG,
	toBase58,
	toBase64,
	toHex,
} from '@mysten/sui/utils';
import { describe, expect, test } from 'vitest';

import { buildTransferTransaction } from '../src/components/assets/buildTransferTransaction';
import { normalizeCoinType } from '../src/lib/coin-type';
import { getMaxInputAmount } from '../src/lib/coins';
import {
	bytesStatusText,
	checkBytes,
	checkTransfer,
	COPY,
	lacksGas,
	newProposalPath,
	proposalTypeFromQuery,
	TITLE_MAX,
	titleError,
	transferTitle,
	type TransferDraft,
} from '../src/lib/new-proposal';

const ACCOUNT = normalizeSuiAddress(
	'0x5d2e00000000000000000000000000000000000000000000000000000000a1b7',
);
const OTHER = normalizeSuiAddress(
	'0x5d2e0000000000000000000000000000000000000000000000000000000041b7',
);
const RECIPIENT = normalizeSuiAddress(
	'0x8d4a000000000000000000000000000000000000000000000000000000003f10',
);
const USDC =
	'0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC';

// A SUI transfer from `sender` that builds offline: the gas coin, price
// and budget are pinned so no client is needed.
function transferTransaction(sender: string) {
	const tx = new Transaction();
	tx.setSender(sender);
	tx.setGasPayment([
		{
			objectId: normalizeSuiAddress('0x1234'),
			version: '1',
			digest: toBase58(new Uint8Array(32).fill(7)),
		},
	]);
	tx.setGasPrice(1000n);
	tx.setGasBudget(10_000_000n);
	const [coin] = tx.splitCoins(tx.gas, [1_000n]);
	tx.transferObjects([coin], RECIPIENT);
	return tx;
}

async function transferBytes(sender: string) {
	return toBase64(
		await transferTransaction(sender).build(),
	);
}

describe('transferTitle', () => {
	const complete = {
		rawAmount: 3_850_000_000_000n,
		decimals: 6,
		symbol: 'USDC',
		recipient: RECIPIENT,
	};

	test('groups the amount and shortens the recipient', () => {
		expect(transferTitle(complete)).toBe(
			'Send 3,850,000 USDC to 0x8d4a…3f10',
		);
	});

	test('keeps the fraction of the amount', () => {
		expect(
			transferTitle({
				...complete,
				rawAmount: 1_234_567_500_000n,
			}),
		).toBe('Send 1,234,567.5 USDC to 0x8d4a…3f10');
	});

	test('reads a recipient with spaces around it', () => {
		expect(
			transferTitle({
				...complete,
				recipient: `  ${RECIPIENT} `,
			}),
		).toBe('Send 3,850,000 USDC to 0x8d4a…3f10');
	});

	test('is null until the transfer is complete', () => {
		expect(
			transferTitle({ ...complete, rawAmount: null }),
		).toBeNull();
		expect(
			transferTitle({ ...complete, rawAmount: 0n }),
		).toBeNull();
		expect(
			transferTitle({ ...complete, decimals: null }),
		).toBeNull();
		expect(
			transferTitle({ ...complete, symbol: null }),
		).toBeNull();
		expect(
			transferTitle({ ...complete, recipient: '' }),
		).toBeNull();
		expect(
			transferTitle({ ...complete, recipient: '0x8d4a' }),
		).toBeNull();
	});
});

describe('checkTransfer', () => {
	const usdc = (
		draft: Partial<TransferDraft>,
		balance: string | null = '5000000000',
	) =>
		checkTransfer({
			draft: {
				coinType: USDC,
				amount: '',
				recipient: '',
				...draft,
			},
			balance,
			decimals: balance === null ? null : 6,
			symbol: 'USDC',
		});
	const sui = (amount: string, balance = '1000000000') =>
		checkTransfer({
			draft: {
				coinType: SUI_TYPE_ARG,
				amount,
				recipient: RECIPIENT,
			},
			balance,
			decimals: 9,
			symbol: 'SUI',
		});

	test('can review a complete transfer', () => {
		const check = usdc({
			amount: '1,250.5',
			recipient: RECIPIENT,
		});
		expect(check).toEqual({
			assetError: null,
			amountError: null,
			recipientError: null,
			recipientValid: true,
			rawAmount: 1_250_500_000n,
			transferAllSui: false,
			canReview: true,
		});
	});

	test('asks for an asset when none is chosen', () => {
		const check = checkTransfer({
			draft: {
				coinType: '',
				amount: '1',
				recipient: RECIPIENT,
			},
			balance: null,
			decimals: null,
			symbol: null,
		});
		expect(check.assetError).toBe(COPY.chooseAsset);
		expect(check.amountError).toBeNull();
		expect(check.canReview).toBe(false);
	});

	test('an empty amount blocks Review without an error', () => {
		const check = usdc({ recipient: RECIPIENT });
		expect(check.amountError).toBeNull();
		expect(check.rawAmount).toBeNull();
		expect(check.canReview).toBe(false);
	});

	test('refuses an amount that does not parse', () => {
		for (const amount of [
			'abc',
			'1.2.3',
			'1.1234567',
			'-1',
		])
			expect(
				usdc({ amount, recipient: RECIPIENT }).amountError,
			).toBe(COPY.invalidAmount(6));
	});

	test('refuses zero', () => {
		const check = usdc({
			amount: '0.000',
			recipient: RECIPIENT,
		});
		expect(check.amountError).toBe(COPY.zeroAmount);
		expect(check.canReview).toBe(false);
	});

	test('refuses more than the balance, with the balance grouped', () => {
		const check = usdc(
			{ amount: '5000.000001', recipient: RECIPIENT },
			'5000000000',
		);
		expect(check.amountError).toBe(
			COPY.overBalance('USDC', '5,000'),
		);
		expect(check.canReview).toBe(false);
	});

	test('takes the whole balance of a coin other than SUI', () => {
		const check = usdc({
			amount: '5000',
			recipient: RECIPIENT,
		});
		expect(check.canReview).toBe(true);
		expect(check.transferAllSui).toBe(false);
	});

	test('sends the gas coin only for the whole SUI balance', () => {
		expect(sui('0.95').canReview).toBe(true);
		expect(sui('0.95').transferAllSui).toBe(false);
		expect(sui('1').canReview).toBe(true);
		expect(sui('1').transferAllSui).toBe(true);
		expect(sui('1.000000001').amountError).toBe(
			COPY.overBalance('SUI', '1'),
		);
		expect(sui('1.000000001').transferAllSui).toBe(false);
		expect(sui('2').amountError).toBe(
			COPY.overBalance('SUI', '1'),
		);
	});

	test('Max sends the gas coin on the long form of the SUI type', () => {
		const max = getMaxInputAmount('2000000000', 9);
		const check = checkTransfer({
			draft: {
				coinType: `${normalizeSuiAddress('0x2')}::sui::SUI`,
				amount: max!,
				recipient: RECIPIENT,
			},
			balance: '2000000000',
			decimals: 9,
			symbol: 'SUI',
		});
		expect(check.transferAllSui).toBe(true);
		expect(check.canReview).toBe(true);
	});

	test('Max has no grouping, so the amount parser reads it back', () => {
		const max = getMaxInputAmount('1234567890000000', 6);
		expect(max).toBe('1234567890');
		const check = usdc(
			{ amount: max!, recipient: RECIPIENT },
			'1234567890000000',
		);
		expect(check.amountError).toBeNull();
		expect(check.rawAmount).toBe(1234567890000000n);
	});

	test('keeps nothing back on a small SUI balance', () => {
		expect(sui('0.01', '40000000').canReview).toBe(true);
		expect(sui('0.01', '40000000').transferAllSui).toBe(
			false,
		);
		expect(sui('0.04', '40000000').transferAllSui).toBe(
			true,
		);
	});

	test('an empty recipient blocks Review without an error', () => {
		const check = usdc({ amount: '1' });
		expect(check.recipientError).toBeNull();
		expect(check.recipientValid).toBe(false);
		expect(check.canReview).toBe(false);
	});

	test('refuses an address that is not a Sui address', () => {
		for (const recipient of [
			'0x8d4a',
			'hello',
			`${RECIPIENT}00`,
		]) {
			const check = usdc({ amount: '1', recipient });
			expect(check.recipientError).toBe(
				COPY.invalidAddress,
			);
			expect(check.recipientValid).toBe(false);
			expect(check.canReview).toBe(false);
		}
	});

	test('reads a recipient with spaces around it', () => {
		const check = usdc({
			amount: '1',
			recipient: ` ${RECIPIENT}\n`,
		});
		expect(check.recipientValid).toBe(true);
		expect(check.canReview).toBe(true);
	});

	test('waits for the asset’s decimals and balance', () => {
		const check = usdc(
			{ amount: '1', recipient: RECIPIENT },
			null,
		);
		expect(check.amountError).toBeNull();
		expect(check.rawAmount).toBeNull();
		expect(check.canReview).toBe(false);
	});
});

describe('titleError', () => {
	test('accepts no title', () => {
		expect(titleError('')).toBeNull();
		expect(titleError('   ')).toBeNull();
	});

	test('counts code points, not UTF-16 units', () => {
		// Each emoji is two UTF-16 units but one character.
		expect(titleError('🚀'.repeat(TITLE_MAX))).toBeNull();
		expect(titleError('🚀'.repeat(TITLE_MAX + 1))).toBe(
			COPY.titleTooLong(TITLE_MAX + 1),
		);
		expect(COPY.titleTooLong(501)).toBe(
			'501 of 500 characters. Use 500 or fewer.',
		);
	});

	test('accepts a title within the limit', () => {
		expect(titleError('Pay the auditors')).toBeNull();
		expect(titleError('a'.repeat(TITLE_MAX))).toBeNull();
	});

	test('counts code points after NFC', () => {
		// 각 typed as three conjoining jamo composes to one syllable.
		const jamo = '\u1100\u1161\u11a8';
		expect(titleError(jamo.repeat(TITLE_MAX))).toBeNull();
		expect(titleError(jamo.repeat(TITLE_MAX + 1))).toBe(
			COPY.titleTooLong(TITLE_MAX + 1),
		);
	});
});

describe('lacksGas', () => {
	const sui = (balance: string) => ({
		coinType: SUI_TYPE_ARG,
		balance,
	});
	const usdc = { coinType: USDC, balance: '5000000' };

	test('is true without SUI or with a SUI balance of 0', () => {
		expect(lacksGas([])).toBe(true);
		expect(lacksGas([usdc])).toBe(true);
		expect(lacksGas([usdc, sui('0')])).toBe(true);
	});

	test('is false with any SUI, in either form of its type', () => {
		expect(lacksGas([usdc, sui('1')])).toBe(false);
		expect(
			lacksGas([
				{
					coinType: normalizeCoinType(SUI_TYPE_ARG),
					balance: '1',
				},
			]),
		).toBe(false);
	});
});

describe('COPY', () => {
	test('a failed build gives the reason when there is one', () => {
		expect(
			COPY.buildFailed('No valid gas coins found'),
		).toContain('No valid gas coins found');
		expect(COPY.buildFailed('')).not.toContain(':');
	});
});

describe('normalizeCoinType', () => {
	test('reads the short and long forms as one type', () => {
		const long = normalizeCoinType(SUI_TYPE_ARG);
		expect(long).toBe(
			`${normalizeSuiAddress('0x2')}::sui::SUI`,
		);
		expect(normalizeCoinType(long)).toBe(long);
		expect(normalizeCoinType(' 0x2::sui::SUI ')).toBe(long);
	});

	test('is empty for anything that isn’t a type', () => {
		for (const value of ['', 'sui', '0x2::sui', 'SUI'])
			expect(normalizeCoinType(value)).toBe('');
	});
});

describe('checkBytes', () => {
	test('is empty for blank input', () => {
		expect(checkBytes('', ACCOUNT)).toEqual({
			kind: 'empty',
		});
		expect(checkBytes(' \n\t', ACCOUNT)).toEqual({
			kind: 'empty',
		});
	});

	test('cannot read garbage, hex or JSON', async () => {
		const bytes = await transferBytes(ACCOUNT);
		for (const input of [
			'hello world',
			'AAAA',
			'not base64 at all!!',
			toHex(new TextEncoder().encode('transaction')),
			JSON.stringify({ sender: ACCOUNT }),
			(await Transaction.from(bytes).toJSON()).slice(0, 40),
			bytes.slice(0, 40),
		])
			expect(checkBytes(input, ACCOUNT)).toEqual({
				kind: 'unreadable',
			});
	});

	test('reads bytes sent from the account', async () => {
		const bytes = await transferBytes(ACCOUNT);
		expect(checkBytes(`  ${bytes}\n`, ACCOUNT)).toEqual({
			kind: 'ok',
			bytes,
			commands: 2,
		});
	});

	test('reads bytes wrapped across lines as one, without the whitespace', async () => {
		const bytes = await transferBytes(ACCOUNT);
		const wrapped = bytes.match(/.{1,20}/g)!.join('\n  ');
		expect(checkBytes(` ${wrapped}\r\n`, ACCOUNT)).toEqual({
			kind: 'ok',
			bytes,
			commands: 2,
		});
	});

	test('compares the sender in its normalized form', async () => {
		const short = normalizeSuiAddress('0xa1b7');
		const bytes = await transferBytes(short);
		expect(checkBytes(bytes, '0xa1b7')).toMatchObject({
			kind: 'ok',
			bytes,
		});
	});

	test('reads fully built JSON from the account as the bytes it builds to', async () => {
		const json =
			await transferTransaction(ACCOUNT).toJSON();
		expect(checkBytes(json, ACCOUNT)).toEqual({
			kind: 'ok',
			bytes: await transferBytes(ACCOUNT),
			commands: 2,
		});
	});

	test('refuses JSON that still needs a client to build', async () => {
		const tx = transferTransaction(ACCOUNT);
		// An object without its version and digest.
		tx.transferObjects(
			[tx.object(normalizeSuiAddress('0x99'))],
			RECIPIENT,
		);
		expect(checkBytes(await tx.toJSON(), ACCOUNT)).toEqual({
			kind: 'unresolved',
		});
	});

	test('names the sender of another account’s JSON', async () => {
		const json = await transferTransaction(OTHER).toJSON();
		expect(checkBytes(json, ACCOUNT)).toEqual({
			kind: 'wrong-sender',
			sender: OTHER,
		});
	});

	test('names the sender of another account’s bytes', async () => {
		const bytes = await transferBytes(OTHER);
		expect(checkBytes(bytes, ACCOUNT)).toEqual({
			kind: 'wrong-sender',
			sender: OTHER,
		});
	});
});

describe('bytesStatusText', () => {
	test('says nothing while empty', () => {
		expect(
			bytesStatusText({ kind: 'empty' }, 'Treasury'),
		).toBeNull();
	});

	test('explains unreadable bytes', () => {
		expect(
			bytesStatusText({ kind: 'unreadable' }, 'Treasury'),
		).toBe(COPY.unreadableBytes);
	});

	test('explains JSON that isn’t fully built', () => {
		expect(
			bytesStatusText({ kind: 'unresolved' }, 'Treasury'),
		).toBe(COPY.bytesUnresolved);
	});

	test('names the other sender and the account', () => {
		expect(
			bytesStatusText(
				{ kind: 'wrong-sender', sender: OTHER },
				'Treasury',
			),
		).toBe(
			'These bytes are sent from 0x5d2e…41b7, not Treasury. Build the transaction with this account as the sender.',
		);
	});

	test('counts the commands', () => {
		const ok = {
			kind: 'ok' as const,
			bytes: 'AA==',
		};
		expect(
			bytesStatusText({ ...ok, commands: 3 }, 'Treasury'),
		).toBe(
			'Read as a transaction with 3 commands, sent from this account.',
		);
		expect(
			bytesStatusText({ ...ok, commands: 1 }, 'Treasury'),
		).toBe(
			'Read as a transaction with 1 command, sent from this account.',
		);
	});
});

describe('newProposalPath', () => {
	test('without a query', () => {
		expect(newProposalPath(ACCOUNT)).toBe(
			`/multisig/${ACCOUNT}/proposals/new`,
		);
		expect(newProposalPath(ACCOUNT, {})).toBe(
			`/multisig/${ACCOUNT}/proposals/new`,
		);
	});

	test('with the type', () => {
		expect(
			newProposalPath(ACCOUNT, { type: 'bytes' }),
		).toBe(`/multisig/${ACCOUNT}/proposals/new?type=bytes`);
	});

	test('with the type and an encoded coin type', () => {
		const path = newProposalPath(ACCOUNT, {
			type: 'transfer',
			coinType: USDC,
		});
		expect(path).toBe(
			`/multisig/${ACCOUNT}/proposals/new?type=transfer&asset=${encodeURIComponent(USDC)}`,
		);
		expect(
			new URLSearchParams(path.split('?')[1]).get('asset'),
		).toBe(USDC);
	});

	test('encodes a generic coin type', () => {
		const coinType = `0x2::coin::Coin<${USDC}>`;
		const path = newProposalPath(ACCOUNT, { coinType });
		expect(path.split('?')[1]).not.toMatch(/[<>]|::/);
		expect(
			new URLSearchParams(path.split('?')[1]).get('asset'),
		).toBe(coinType);
	});
});

describe('proposalTypeFromQuery', () => {
	test('reads the known types', () => {
		expect(proposalTypeFromQuery('transfer')).toBe(
			'transfer',
		);
		expect(proposalTypeFromQuery('bytes')).toBe('bytes');
	});

	test('is null for anything else', () => {
		expect(proposalTypeFromQuery(null)).toBeNull();
		expect(proposalTypeFromQuery('')).toBeNull();
		expect(proposalTypeFromQuery('Transfer')).toBeNull();
		expect(proposalTypeFromQuery('swap')).toBeNull();
	});
});

describe('buildTransferTransaction Max on SUI', () => {
	const SENDER = normalizeSuiAddress('0x5d2e');
	const coinId = (i: number) =>
		normalizeSuiAddress(`0xc0${i.toString(16)}`);

	// A client that holds `count` SUI coins of 0.5, listed 100 per page,
	// whose resolver pins the gas price and budget.
	function fakeClient(count: number) {
		const core = {
			listCoins: async ({
				cursor,
			}: {
				cursor?: string | null;
			}) => {
				const start = Number(cursor ?? 0);
				const end = Math.min(start + 100, count);
				return {
					objects: Array.from(
						{ length: end - start },
						(_, i) => ({
							objectId: coinId(start + i),
							version: '1',
							digest: toBase58(new Uint8Array(32).fill(1)),
							balance: '500000000',
							coinType: SUI_TYPE_ARG,
							owner: SENDER,
						}),
					),
					hasNextPage: end < count,
					cursor: end < count ? String(end) : null,
				};
			},
			resolveTransactionPlugin:
				() =>
				async (
					data: ReturnType<Transaction['getData']>,
					_options: unknown,
					next: () => Promise<void>,
				) => {
					data.gasData.price ??= '1000';
					data.gasData.budget ??= '10000000';
					await next();
				},
		};
		return { core } as unknown as Parameters<
			typeof buildTransferTransaction
		>[0]['client'];
	}

	// Builds Max for `count` coins and returns the coins it spends: the
	// gas payment and the coins merged into the gas coin, which is sent.
	async function buildMax(count: number) {
		const bytes = await buildTransferTransaction({
			sender: SENDER,
			recipient: RECIPIENT,
			coinType: SUI_TYPE_ARG,
			amount: BigInt(count) * 500_000_000n,
			transferAllSui: true,
			client: fakeClient(count),
		});
		const data = Transaction.from(bytes).getData();
		expect(
			data.commands.at(-1)?.TransferObjects?.objects,
		).toEqual([{ $kind: 'GasCoin', GasCoin: true }]);
		const merged = data.commands.flatMap((c) =>
			c.MergeCoins?.destination.$kind === 'GasCoin'
				? c.MergeCoins.sources.map((arg) =>
						arg.$kind === 'Input'
							? data.inputs[arg.Input].Object
									?.ImmOrOwnedObject?.objectId
							: undefined,
					)
				: [],
		);
		const paid = (data.gasData.payment ?? []).map(
			(c) => c.objectId,
		);
		return { bytes, spent: [...paid, ...merged] };
	}

	test('sends all 300 coins, past the 256 a gas payment takes', async () => {
		const { spent } = await buildMax(300);
		expect(spent.sort()).toEqual(
			Array.from({ length: 300 }, (_, i) =>
				coinId(i),
			).sort(),
		);
	});

	test('spends at most 1456 coins, within the transaction size limit', async () => {
		const { bytes, spent } = await buildMax(3000);
		expect(new Set(spent).size).toBe(256 + 1200);
		expect(
			Buffer.from(bytes, 'base64').length,
		).toBeLessThan(128 * 1024 - 16 * 1024);
	});
});
