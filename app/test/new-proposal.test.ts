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
import { formatInputAmount } from '../src/lib/coins';
import {
	bytesStatusText,
	checkBytes,
	checkTransfer,
	COPY,
	lacksGas,
	maxAmount,
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

// A SUI transfer from `sender`, built offline: the gas coin, price and
// budget are pinned so no client is needed.
async function transferBytes(sender: string) {
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
	return toBase64(await tx.build());
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

describe('maxAmount', () => {
	test('is the full balance for a coin other than SUI', () => {
		expect(
			maxAmount({
				balance: '1234567890000',
				decimals: 6,
			}),
		).toBe('1234567.89');
	});

	test('is the full balance on SUI too', () => {
		expect(
			maxAmount({
				balance: '2000000000',
				decimals: 9,
			}),
		).toBe('2');
	});

	test('sends the gas coin on the long form of the SUI type', () => {
		const max = maxAmount({
			balance: '2000000000',
			decimals: 9,
		});
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

	test('keeps nothing back on SUI, down to one MIST', () => {
		expect(
			maxAmount({
				balance: '1',
				decimals: 9,
			}),
		).toBe('0.000000001');
		expect(
			maxAmount({
				balance: '0',
				decimals: 9,
			}),
		).toBeNull();
	});

	test('is null for an empty balance', () => {
		expect(
			maxAmount({
				balance: '0',
				decimals: 6,
			}),
		).toBeNull();
	});

	test('has no grouping, so the amount parser reads it back', () => {
		const max = maxAmount({
			balance: '1234567890000000',
			decimals: 6,
		});
		expect(max).toBe('1234567890');
		const check = checkTransfer({
			draft: {
				coinType: USDC,
				amount: max!,
				recipient: RECIPIENT,
			},
			balance: '1234567890000000',
			decimals: 6,
			symbol: 'USDC',
		});
		expect(check.amountError).toBeNull();
		expect(check.rawAmount).toBe(1234567890000000n);
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
	test('a 0-decimal coin asks for a whole number', () => {
		expect(COPY.invalidAmount(0)).toBe(
			'Enter a whole number.',
		);
		expect(COPY.invalidAmount(6)).toBe(
			'Enter a valid amount (up to 6 decimals).',
		);
	});

	test('a failed build gives the reason when there is one', () => {
		expect(
			COPY.buildFailed('No valid gas coins found'),
		).toBe(
			'Couldn’t build the transfer: No valid gas coins found',
		);
		expect(COPY.buildFailed('')).toBe(
			'Couldn’t build the transfer. Check your connection and try again.',
		);
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
			Transaction.from(bytes).serialize(),
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

	test('compares the sender in its normalized form', async () => {
		const short = normalizeSuiAddress('0xa1b7');
		const bytes = await transferBytes(short);
		expect(checkBytes(bytes, '0xa1b7')).toMatchObject({
			kind: 'ok',
			bytes,
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

// Coins seen on Sui: 0, 6 (USDC), 8 (wrapped BTC), 9 (SUI), 18, and a
// couple in between.
const COIN_DECIMALS = [0, 1, 2, 6, 8, 9, 18] as const;
/** The largest balance a coin can hold on chain. */
const U64_MAX = 2n ** 64n - 1n;
/** u64 max in whole units, grouped, for each decimals value. */
const U64_MAX_SHOWN: Record<
	(typeof COIN_DECIMALS)[number],
	string
> = {
	0: '18,446,744,073,709,551,615',
	1: '1,844,674,407,370,955,161.5',
	2: '184,467,440,737,095,516.15',
	6: '18,446,744,073,709.551615',
	8: '184,467,440,737.09551615',
	9: '18,446,744,073.709551615',
	18: '18.446744073709551615',
};
const TOKEN = `${normalizeSuiAddress('0xabc')}::token::TOKEN`;

function tokenTransfer(
	amount: string,
	balance: bigint,
	decimals: number,
) {
	return checkTransfer({
		draft: {
			coinType: TOKEN,
			amount,
			recipient: RECIPIENT,
		},
		balance: balance.toString(),
		decimals,
		symbol: 'TOKEN',
	});
}

describe('maxAmount across coin decimals', () => {
	describe.each(COIN_DECIMALS)(
		'%i decimals',
		(decimals) => {
			const unit = 10n ** BigInt(decimals);

			test('parses back to exactly the raw balance and passes the checks', () => {
				for (const balance of [
					1n,
					unit,
					unit - 1n,
					U64_MAX,
				].filter((b) => b > 0n)) {
					const max = maxAmount({
						balance: balance.toString(),
						decimals,
					});
					expect(max).not.toBeNull();
					expect(max).not.toContain(',');
					const check = tokenTransfer(
						max!,
						balance,
						decimals,
					);
					expect(check.rawAmount).toBe(balance);
					expect(check.amountError).toBeNull();
					expect(check.canReview).toBe(true);
				}
			});

			test('is null for a balance of 0', () => {
				expect(
					maxAmount({ balance: '0', decimals }),
				).toBeNull();
			});
		},
	);
});

describe('checkTransfer across coin decimals', () => {
	describe.each(COIN_DECIMALS)(
		'%i decimals',
		(decimals) => {
			const unit = 10n ** BigInt(decimals);

			test('allows exactly the balance, without the SUI gas-coin path', () => {
				for (const balance of [unit, U64_MAX]) {
					const check = tokenTransfer(
						formatInputAmount(balance.toString(), decimals),
						balance,
						decimals,
					);
					expect(check.amountError).toBeNull();
					expect(check.canReview).toBe(true);
					expect(check.transferAllSui).toBe(false);
				}
			});

			test('refuses one raw unit over the balance, showing the balance', () => {
				const check = tokenTransfer(
					formatInputAmount(
						(unit + 1n).toString(),
						decimals,
					),
					unit,
					decimals,
				);
				expect(check.amountError).toBe(
					COPY.overBalance('TOKEN', '1'),
				);
				expect(check.canReview).toBe(false);
			});

			test('shows a u64 max balance in full when the amount is over it', () => {
				const check = tokenTransfer(
					formatInputAmount(
						(U64_MAX + 1n).toString(),
						decimals,
					),
					U64_MAX,
					decimals,
				);
				expect(check.amountError).toBe(
					COPY.overBalance(
						'TOKEN',
						U64_MAX_SHOWN[decimals],
					),
				);
			});

			test('refuses an amount past u64 max through the balance check', () => {
				const check = tokenTransfer(
					'1234567890123456789012345',
					U64_MAX,
					decimals,
				);
				expect(check.amountError).toBe(
					COPY.overBalance(
						'TOKEN',
						U64_MAX_SHOWN[decimals],
					),
				);
				expect(check.canReview).toBe(false);
			});
		},
	);

	test('a 0-decimal coin refuses "1.5" with the invalid-amount copy', () => {
		const check = tokenTransfer('1.5', 10n, 0);
		expect(check.amountError).toBe(COPY.invalidAmount(0));
		expect(check.rawAmount).toBeNull();
		expect(check.canReview).toBe(false);
	});

	test('an 18-decimal coin takes one raw unit, and refuses a 19th digit', () => {
		const tiny = tokenTransfer(
			'0.000000000000000001',
			10n,
			18,
		);
		expect(tiny.rawAmount).toBe(1n);
		expect(tiny.canReview).toBe(true);
		expect(
			tokenTransfer('0.0000000000000000001', 10n, 18)
				.amountError,
		).toBe(COPY.invalidAmount(18));
	});

	test('the gas-coin path is for SUI only, whatever the decimals', () => {
		const sui = checkTransfer({
			draft: {
				coinType: SUI_TYPE_ARG,
				amount: '18446744073.709551615',
				recipient: RECIPIENT,
			},
			balance: U64_MAX.toString(),
			decimals: 9,
			symbol: 'SUI',
		});
		expect(sui.transferAllSui).toBe(true);
		expect(sui.canReview).toBe(true);
		expect(
			tokenTransfer('18446744073.709551615', U64_MAX, 9)
				.transferAllSui,
		).toBe(false);
	});

	test('a zero SUI balance cannot be reviewed even with 0 typed', () => {
		const check = checkTransfer({
			draft: {
				coinType: SUI_TYPE_ARG,
				amount: '0',
				recipient: RECIPIENT,
			},
			balance: '0',
			decimals: 9,
			symbol: 'SUI',
		});
		expect(check.amountError).toBe(COPY.zeroAmount);
		expect(check.canReview).toBe(false);
	});
});

describe('transferTitle across coin decimals', () => {
	const title = (rawAmount: bigint, decimals: number) =>
		transferTitle({
			rawAmount,
			decimals,
			symbol: 'TOKEN',
			recipient: RECIPIENT,
		});

	test.each(COIN_DECIMALS)(
		'groups u64 max to the last raw unit at %i decimals',
		(decimals) => {
			expect(title(U64_MAX, decimals)).toBe(
				`Send ${U64_MAX_SHOWN[decimals]} TOKEN to 0x8d4a…3f10`,
			);
		},
	);

	test.each(COIN_DECIMALS)(
		'shows one whole token as 1 at %i decimals',
		(decimals) => {
			expect(title(10n ** BigInt(decimals), decimals)).toBe(
				'Send 1 TOKEN to 0x8d4a…3f10',
			);
		},
	);

	test('drops trailing zeros and keeps leading ones in the fraction', () => {
		expect(title(1_500_000n, 6)).toBe(
			'Send 1.5 TOKEN to 0x8d4a…3f10',
		);
		expect(title(999_999n, 6)).toBe(
			'Send 0.999999 TOKEN to 0x8d4a…3f10',
		);
		expect(title(1n, 18)).toBe(
			'Send 0.000000000000000001 TOKEN to 0x8d4a…3f10',
		);
	});

	test('groups a 0-decimal amount with no fraction', () => {
		expect(title(1_234_567n, 0)).toBe(
			'Send 1,234,567 TOKEN to 0x8d4a…3f10',
		);
	});
});

describe('buildTransferTransaction amounts', () => {
	const SENDER = normalizeSuiAddress('0x5d2e');
	const COIN_ID = normalizeSuiAddress('0xc0');

	// A client that holds `held` of TOKEN in one coin and stops at gas
	// resolution, which runs after the coin is split.
	function fakeClient(held: bigint) {
		const core = {
			getBalance: async () => ({
				balance: {
					coinType: TOKEN,
					balance: held.toString(),
					coinBalance: held.toString(),
					addressBalance: '0',
				},
			}),
			listCoins: async () => ({
				objects: [
					{
						objectId: COIN_ID,
						version: '1',
						digest: toBase58(new Uint8Array(32).fill(1)),
						balance: held.toString(),
						coinType: TOKEN,
						owner: SENDER,
					},
				],
				hasNextPage: false,
				cursor: null,
			}),
			resolveTransactionPlugin: () => async () => {
				throw new Error('reached gas resolution');
			},
		};
		return { core } as unknown as Parameters<
			typeof buildTransferTransaction
		>[0]['client'];
	}
	const build = (amount: bigint, held: bigint) =>
		buildTransferTransaction({
			sender: SENDER,
			recipient: RECIPIENT,
			coinType: TOKEN,
			amount,
			client: fakeClient(held),
		});

	test('splits u64 max', async () => {
		await expect(build(U64_MAX, U64_MAX)).rejects.toThrow(
			'reached gas resolution',
		);
	});

	test('cannot split one raw unit past u64 max', async () => {
		await expect(
			build(U64_MAX + 1n, U64_MAX + 1n),
		).rejects.toThrow(
			/Invalid u64 value: 18446744073709551616/,
		);
	});

	test('keeps every digit of the amount when checking the balance', async () => {
		await expect(
			build(U64_MAX, U64_MAX - 1n),
		).rejects.toThrow(
			'Required: 18446744073709551615, Available: 18446744073709551614',
		);
	});

	test('refuses zero before touching the client', async () => {
		await expect(build(0n, 10n)).rejects.toThrow(
			'Amount must be greater than zero.',
		);
	});
});
