// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

// Address alias behaviour for multisig accounts on a local network.
// Regression suite for the protocol rules that account rotation relies on
// (docs/account-rotation.md). The steps share state and run in order.

import {
	SimulationError,
	type SuiClientTypes,
} from '@mysten/sui/client';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { MultiSigPublicKey } from '@mysten/sui/multisig';
import { Transaction } from '@mysten/sui/transactions';
import { normalizeSuiAddress } from '@mysten/sui/utils';
import {
	afterAll,
	beforeAll,
	describe,
	expect,
	setDefaultTimeout,
	test,
} from 'bun:test';

import {
	buildAdd,
	buildEnable,
	buildRemove,
	deriveAliasesObjectId,
	fetchAliasSet,
	MAX_ALIASES,
} from '../src/utils/aliases';
import {
	fundAddress,
	getLocalClient,
	isNetworkRunning,
} from './setup/sui-network';

setDefaultTimeout(60_000);

const client = getLocalClient();

const RECIPIENT = normalizeSuiAddress('0xa11ce');

interface Signer {
	label: string;
	address: string;
	sign(bytes: Uint8Array): Promise<string>;
}

function multisigSigner(
	label: string,
	keys: Ed25519Keypair[],
	threshold: number,
	signingKeys: Ed25519Keypair[] = keys.slice(0, threshold),
): Signer & { publicKey: MultiSigPublicKey } {
	const publicKey = MultiSigPublicKey.fromPublicKeys({
		threshold,
		publicKeys: keys.map((k) => ({
			publicKey: k.getPublicKey(),
			weight: 1,
		})),
	});
	return {
		label,
		publicKey,
		address: publicKey.toSuiAddress(),
		async sign(bytes) {
			const partials = await Promise.all(
				signingKeys.map(
					async (k) =>
						(await k.signTransaction(bytes)).signature,
				),
			);
			return publicKey.combinePartialSignatures(partials);
		},
	};
}

function keySigner(
	label: string,
	key: Ed25519Keypair,
): Signer {
	return {
		label,
		address: key.toSuiAddress(),
		async sign(bytes) {
			return (await key.signTransaction(bytes)).signature;
		},
	};
}

async function build(
	sender: string,
	fill: (tx: Transaction) => void,
) {
	const tx = new Transaction();
	tx.setSender(sender);
	fill(tx);
	return tx.build({ client });
}

const include = {
	effects: true,
	transaction: true,
	objectTypes: true,
} as const;

type Executed = SuiClientTypes.TransactionResult<
	typeof include
>;

async function execute(
	bytes: Uint8Array,
	signature: string,
): Promise<Executed> {
	const result = await client.executeTransaction({
		transaction: bytes,
		signatures: [signature],
		include,
	});
	// Poll often: the localnet fullnode keeps only a few seconds of
	// checkpoints for gRPC reads, and the default schedule can miss them.
	await client.waitForTransaction({
		result,
		pollSchedule: [0, 100],
		timeout: 30_000,
	});
	return result;
}

async function run(
	sender: string,
	signer: Signer,
	fill: (tx: Transaction) => void,
) {
	const bytes = await build(sender, fill);
	return execute(bytes, await signer.sign(bytes));
}

function expectSuccess(result: Executed) {
	if (result.$kind !== 'Transaction') {
		throw new Error(
			`Expected success, got: ${JSON.stringify(result.FailedTransaction.status)}`,
		);
	}
	return result.Transaction;
}

// The builder dry-runs every transaction with unresolved inputs, even with
// an explicit gas budget, so an aborting call fails at build time with the
// Move abort attached.
async function expectAbort(
	sender: string,
	fill: (tx: Transaction) => void,
	constantName: string,
) {
	let error: unknown;
	try {
		await build(sender, fill);
	} catch (e) {
		error = e;
	}
	expect(error).toBeInstanceOf(SimulationError);
	const executionError = (error as SimulationError)
		.executionError;
	expect(executionError?.$kind).toBe('MoveAbort');
	const abort = executionError!.MoveAbort!;
	expect(abort.location?.module).toBe('address_alias');
	expect(abort.cleverError?.constantName).toBe(
		constantName,
	);
	return {
		message: executionError!.message,
		abortCode: abort.abortCode,
		errorCode: abort.cleverError?.errorCode,
	};
}

async function expectRejected(promise: Promise<unknown>) {
	try {
		await promise;
	} catch (e) {
		return decodeURIComponent(
			e instanceof Error ? e.message : String(e),
		);
	}
	throw new Error(
		'Expected the transaction to be rejected',
	);
}

function netGas(
	tx: SuiClientTypes.Transaction<typeof include>,
) {
	const g = tx.effects.gasUsed;
	return {
		computation: Number(g.computationCost),
		storage: Number(g.storageCost),
		rebate: Number(g.storageRebate),
		net:
			Number(g.computationCost) +
			Number(g.storageCost) -
			Number(g.storageRebate),
	};
}

const transferOneMist = (tx: Transaction) => {
	const [coin] = tx.splitCoins(tx.gas, [1]);
	tx.transferObjects([coin], RECIPIENT);
};

const record: Record<string, unknown> = {};

describe('Address aliases on multisig accounts', () => {
	const keys = Array.from(
		{ length: 7 },
		() => new Ed25519Keypair(),
	);
	const [k1, k2, k3, k4, k5, k6, k7] = keys;

	// M: the account. 2-of-3.
	const M = multisigSigner('M', [k1, k2, k3], 2);
	// M': new composition, carries over k2 and k3, adds k4. 2-of-3.
	const M2 = multisigSigner("M'", [k2, k3, k4], 2);
	// M'': alias of M', never an alias of M. 1-of-2.
	const M3 = multisigSigner("M''", [k5, k6], 1);
	// K: a single key.
	const K = keySigner('K', k7);

	beforeAll(async () => {
		if (!(await isNetworkRunning())) {
			throw new Error(
				'Local Sui network not running. Start with: sui start --force-regenesis --with-faucet',
			);
		}
		const config = await client.core.getProtocolConfig();
		record.protocolVersion =
			config.protocolConfig.protocolVersion;
		record.addressAliasesFlag =
			config.protocolConfig.featureFlags.address_aliases;
		expect(
			config.protocolConfig.featureFlags.address_aliases,
		).toBe(true);

		for (const address of [
			M.address,
			M2.address,
			M3.address,
		]) {
			await fundAddress(address);
		}
	});

	// Set SPIKE_OUTPUT=1 to print what the steps recorded.
	afterAll(() => {
		if (process.env.SPIKE_OUTPUT !== '1') return;
		console.log(
			'[address-aliases] recorded:',
			JSON.stringify(record, null, 2),
		);
	});

	test('1. M enables aliases and adds M′; object id derivation and BCS decode', async () => {
		const before = await fetchAliasSet(client, M.address);
		expect(before).toEqual({
			exists: false,
			objectId: deriveAliasesObjectId(M.address),
			version: null,
			aliases: [M.address],
		});

		// enable and add cannot share a PTB: enable does not return the object
		// and the object does not exist when the PTB is built.
		record.enableAndAddInOnePtb = await expectRejected(
			build(M.address, (tx) => {
				buildEnable(tx);
				buildAdd(tx, {
					account: M.address,
					alias: M2.address,
				});
			}),
		);
		expect(record.enableAndAddInOnePtb).toMatch(
			/Object 0x[0-9a-f]+ not found/,
		);

		const enabled = expectSuccess(
			await run(M.address, M, buildEnable),
		);
		record.enableGas = netGas(enabled);

		const created = enabled.effects.changedObjects.filter(
			(o) => o.idOperation === 'Created',
		);
		record.enableCreated = created.map((o) => ({
			objectId: o.objectId,
			type: enabled.objectTypes[o.objectId],
			owner: o.outputOwner,
		}));
		const aliasesObject = created.find(
			(o) =>
				o.objectId === deriveAliasesObjectId(M.address),
		);
		expect(aliasesObject).toBeDefined();
		expect(
			enabled.objectTypes[aliasesObject!.objectId],
		).toBe(
			'0x0000000000000000000000000000000000000000000000000000000000000002::address_alias::AddressAliases',
		);
		expect(aliasesObject!.outputOwner).toEqual({
			$kind: 'ConsensusAddressOwner',
			ConsensusAddressOwner: {
				owner: M.address,
				startVersion: aliasesObject!.outputVersion!,
			},
		});

		const afterEnable = await fetchAliasSet(
			client,
			M.address,
		);
		expect(afterEnable.exists).toBe(true);
		expect(afterEnable.aliases).toEqual([M.address]);

		const added = expectSuccess(
			await run(M.address, M, (tx) =>
				buildAdd(tx, {
					account: M.address,
					alias: M2.address,
				}),
			),
		);
		record.addGas = netGas(added);

		const afterAdd = await fetchAliasSet(client, M.address);
		expect(afterAdd.aliases).toEqual([
			M.address,
			M2.address,
		]);
		expect(BigInt(afterAdd.version!)).toBeGreaterThan(
			BigInt(afterEnable.version!),
		);
	});

	test('2. M′ signs for sender M; both compositions valid at once', async () => {
		const viaM2 = expectSuccess(
			await run(M.address, M2, transferOneMist),
		);
		expect(viaM2.transaction.sender).toBe(M.address);
		expect(viaM2.transaction.gasData.owner).toBe(M.address);
		expect(viaM2.effects.gasObject?.outputOwner).toEqual({
			$kind: 'AddressOwner',
			AddressOwner: M.address,
		});
		record.aliasSignedTransferGas = netGas(viaM2);

		// Same bytes, one signature per key: k2 and k3 sign once and the
		// partials combine into a valid signature for either composition.
		const bytes = await build(M.address, transferOneMist);
		const partials = await Promise.all(
			[k2, k3].map(
				async (k) =>
					(await k.signTransaction(bytes)).signature,
			),
		);
		const sigM =
			M.publicKey.combinePartialSignatures(partials);
		const sigM2 =
			M2.publicKey.combinePartialSignatures(partials);
		expect(
			await M.publicKey.verifyTransaction(bytes, sigM),
		).toBe(true);
		expect(
			await M2.publicKey.verifyTransaction(bytes, sigM2),
		).toBe(true);

		// The original composition still signs for M.
		const viaM = expectSuccess(await execute(bytes, sigM));
		expect(viaM.transaction.sender).toBe(M.address);

		// And M′ right after it, at the same alias set version.
		expectSuccess(
			await run(M.address, M2, transferOneMist),
		);
	});

	test('3. one hop: an alias of M′ cannot sign for M', async () => {
		expectSuccess(await run(M2.address, M2, buildEnable));
		expectSuccess(
			await run(M2.address, M2, (tx) =>
				buildAdd(tx, {
					account: M2.address,
					alias: M3.address,
				}),
			),
		);
		expect(
			(await fetchAliasSet(client, M2.address)).aliases,
		).toEqual([M2.address, M3.address]);

		// Control: M′′ is a working alias of M′.
		const control = expectSuccess(
			await run(M2.address, M3, transferOneMist),
		);
		expect(control.transaction.sender).toBe(M2.address);

		// M′′ is not in aliases(M): rejected before execution.
		record.oneHopRejection = await expectRejected(
			run(M.address, M3, transferOneMist),
		);
		expect(record.oneHopRejection).toMatch(
			/Invalid user signature: Required Signature from .* is absent/,
		);
	});

	test('4. M′ removes M; M can no longer sign for itself', async () => {
		const removed = expectSuccess(
			await run(M.address, M2, (tx) =>
				buildRemove(tx, {
					account: M.address,
					alias: M.address,
				}),
			),
		);
		record.removeGas = netGas(removed);

		expect(
			(await fetchAliasSet(client, M.address)).aliases,
		).toEqual([M2.address]);

		record.removedSignerRejection = await expectRejected(
			run(M.address, M, transferOneMist),
		);
		expect(record.removedSignerRejection).toMatch(
			/Invalid user signature: Required Signature from .* is absent/,
		);

		const stillWorks = expectSuccess(
			await run(M.address, M2, transferOneMist),
		);
		expect(stillWorks.transaction.sender).toBe(M.address);
	});

	test('5. limits and invalid changes abort', async () => {
		const aborts: Record<string, unknown> = {};

		aborts.removeLast = await expectAbort(
			M.address,
			(tx) =>
				buildRemove(tx, {
					account: M.address,
					alias: M2.address,
				}),
			'ECannotRemoveLastAlias',
		);
		aborts.addDuplicate = await expectAbort(
			M.address,
			(tx) =>
				buildAdd(tx, {
					account: M.address,
					alias: M2.address,
				}),
			'EAliasAlreadyExists',
		);
		aborts.removeMissing = await expectAbort(
			M.address,
			(tx) =>
				buildRemove(tx, {
					account: M.address,
					alias: RECIPIENT,
				}),
			'ENoSuchAlias',
		);
		aborts.enableTwice = await expectAbort(
			M.address,
			buildEnable,
			'EAliasAlreadyExists',
		);

		// Another address cannot touch M's alias object: it is owned by M.
		aborts.foreignSender = await expectRejected(
			build(M2.address, (tx) =>
				buildAdd(tx, {
					account: M.address,
					alias: RECIPIENT,
				}),
			),
		);
		expect(aborts.foreignSender).toMatch(
			/not signed by the correct sender/,
		);

		record.aborts = aborts;
		expect(
			(await fetchAliasSet(client, M.address)).aliases,
		).toEqual([M2.address]);
	});

	test('6. a single key alias signs alone for M; alias set caps at 8', async () => {
		expectSuccess(
			await run(M.address, M2, (tx) =>
				buildAdd(tx, {
					account: M.address,
					alias: K.address,
				}),
			),
		);
		expect(
			(await fetchAliasSet(client, M.address)).aliases,
		).toEqual([M2.address, K.address]);

		// K is unfunded and signs alone; gas is paid by M.
		const viaK = expectSuccess(
			await run(M.address, K, transferOneMist),
		);
		expect(viaK.transaction.sender).toBe(M.address);
		expect(viaK.transaction.gasData.owner).toBe(M.address);

		// Several top-level add commands in one PTB, filling the set to 8.
		const fillers = Array.from(
			{ length: MAX_ALIASES - 2 },
			() => new Ed25519Keypair().toSuiAddress(),
		);
		const filled = expectSuccess(
			await run(M.address, K, (tx) => {
				for (const alias of fillers)
					buildAdd(tx, { account: M.address, alias });
			}),
		);
		record.addSixInOnePtbGas = netGas(filled);
		expect(
			(await fetchAliasSet(client, M.address)).aliases,
		).toHaveLength(MAX_ALIASES);

		record.ninthAlias = await expectAbort(
			M.address,
			(tx) =>
				buildAdd(tx, {
					account: M.address,
					alias: new Ed25519Keypair().toSuiAddress(),
				}),
			'ETooManyAliases',
		);
	});
});
