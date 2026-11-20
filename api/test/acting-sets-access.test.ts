// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import {
	defaultExpiry,
	PersonalMessages,
} from '@mysten/sagat';
import { MultiSigPublicKey } from '@mysten/sui/multisig';
import { Transaction } from '@mysten/sui/transactions';
import {
	fromBase64,
	normalizeSuiAddress,
	toBase58,
	toHex,
} from '@mysten/sui/utils';
import {
	beforeEach,
	describe,
	expect,
	test,
} from 'bun:test';
import { and, eq } from 'drizzle-orm';

import { db } from '../src/db';
import {
	ProposalStatus,
	SchemaAccountAcceptances,
	SchemaAccountAliases,
	SchemaAccountAliasState,
	SchemaAddresses,
	SchemaProposals,
	SchemaSignerSetMembers,
	SchemaSignerSets,
	type Proposal,
} from '../src/db/schema';
import {
	ApiAuthError,
	ValidationError,
} from '../src/errors';
import { listAccountEvents } from '../src/services/account-events.service';
import {
	addProposer,
	getMultisigAccount,
	listConnections,
	listInvitations,
	removeProposer,
} from '../src/services/multisig.service';
import {
	cancelProposal,
	createProposal,
	listProposals,
	verifyProposal,
	voteOnProposal,
} from '../src/services/proposals.service';
import {
	actingSetsOn,
	ORIGINAL_SET,
	type SignerScope,
} from '../src/services/signers.service';
import { type SuiNetwork } from '../src/utils/client';
import {
	ApiTestFramework,
	buildTransfer,
	newUser,
	sendCoins,
	sign,
	type TestUser,
} from './framework/api-test-framework';
import {
	createTestApp,
	setupSharedTestEnvironment,
} from './setup/shared-test-setup';
import { getLocalClient } from './setup/sui-network';
import { queryCount } from './setup/test-db';

setupSharedTestEnvironment();

const LOCALNET = actingSetsOn('localnet');
const TESTNET = actingSetsOn('testnet');

const ACCESS_DENIED = new ApiAuthError('AccessDenied');
const NOT_A_MEMBER = new ApiAuthError('NotAMultisigMember');
const CANNOT_CANCEL = new ValidationError(
	'Not a member of the multisig',
);
const NOT_READY = new ValidationError(
	'Proposal is not ready to execute',
);

let framework: ApiTestFramework;

beforeEach(async () => {
	framework = new ApiTestFramework(await createTestApp());
});

const expectRefused = async (
	call: Promise<unknown>,
	error: Error,
) => {
	const thrown = await call.then(
		() => null,
		(e: unknown) => e,
	);
	expect(thrown).toBeInstanceOf(error.constructor);
	expect((thrown as Error).message).toBe(error.message);
};

// `accepted` are connected when the account is created; `invited` are not.
const createAccount = async (
	accepted: TestUser[],
	invited: TestUser[] = [],
	{
		threshold = 2,
		labels,
	}: { threshold?: number; labels?: string[] } = {},
) => {
	const session = framework.createSession();
	for (const user of accepted)
		await session.connectUser(user);
	const multisig = await session.createMultisig(
		[...accepted, ...invited],
		threshold,
		{ labels },
	);
	return multisig.address;
};

const register = (user: TestUser) =>
	db
		.insert(SchemaAddresses)
		.values({
			publicKey: user.publicKey,
			address: user.address,
		})
		.onConflictDoNothing();

// A composition the API knows that is no account.
const insertComposition = async (
	members: TestUser[],
	threshold: number,
) => {
	const address = MultiSigPublicKey.fromPublicKeys({
		threshold,
		publicKeys: members.map((m) => ({
			publicKey: m.keypair.getPublicKey(),
			weight: 1,
		})),
	}).toSuiAddress();
	for (const member of members) await register(member);
	await db
		.insert(SchemaSignerSets)
		.values({ address, threshold, isVerified: true });
	await db.insert(SchemaSignerSetMembers).values(
		members.map((member, order) => ({
			signerSetAddress: address,
			publicKey: member.publicKey,
			order,
		})),
	);
	return address;
};

const setAliases = async (
	account: string,
	network: SuiNetwork,
	aliases: string[],
) => {
	await db
		.insert(SchemaAccountAliasState)
		.values({
			accountAddress: account,
			network,
			exists: true,
			observedVersion: 1,
			observedAt: new Date(),
		})
		.onConflictDoNothing();
	await db.insert(SchemaAccountAliases).values(
		aliases.map((aliasAddress) => ({
			accountAddress: account,
			network,
			aliasAddress,
		})),
	);
};

const answerFor = (
	account: string,
	user: TestUser,
	answer: 'accepted' | 'rejected',
) =>
	db.insert(SchemaAccountAcceptances).values({
		accountAddress: account,
		publicKey: user.publicKey,
		isAccepted: answer === 'accepted',
		isRejected: answer === 'rejected',
	});

// `A`: 2 of `k1`, `k2`, `k3`, all accepted. `R`: a composition of `r1`, `r2`.
const createCast = async () => {
	const [k1, k2, k3, r1, r2] = Array.from(
		{ length: 5 },
		newUser,
	);
	const account = await createAccount([k1, k2, k3]);
	const composition = await insertComposition([r1, r2], 2);
	return { account, k1, k2, k3, r1, r2, composition };
};

const random = (length: number) =>
	crypto.getRandomValues(new Uint8Array(length));

// Transfer bytes from the account, built without the chain, on a made-up gas coin.
const offlineTransfer = async (sender: string) => {
	const tx = new Transaction();
	tx.setSender(sender);
	tx.setGasPrice(1000);
	tx.setGasBudget(10_000_000);
	tx.setGasPayment([
		{
			objectId: normalizeSuiAddress(toHex(random(32))),
			version: '1',
			digest: toBase58(random(32)),
		},
	]);
	const [coin] = tx.splitCoins(tx.gas, [tx.pure.u64(1)]);
	tx.transferObjects([coin], tx.pure.address(sender));
	return (await tx.build()).toBase64();
};

// A pending proposal row, as a create on that network would leave it.
const insertProposal = async (
	account: string,
	network: SuiNetwork,
	proposerAddress: string,
) => {
	const transactionBytes = await offlineTransfer(account);
	const [proposal] = await db
		.insert(SchemaProposals)
		.values({
			accountAddress: account,
			digest: await Transaction.from(
				transactionBytes,
			).getDigest(),
			transactionBytes,
			proposerAddress,
			network,
		})
		.returning();
	return proposal;
};

// Transfers from the account on localnet, each paying with its own coin.
const fundedTransfers = async (
	account: string,
	count: number,
) => {
	await sendCoins(account, count);
	const { objects: coins } =
		await getLocalClient().listCoins({ owner: account });
	return Promise.all(
		coins
			.slice(0, count)
			.map((gasCoin) =>
				buildTransfer(account, { gasCoin }),
			),
	);
};

const statusOf = async (proposal: Proposal) => {
	const [{ status }] = await db
		.select({ status: SchemaProposals.status })
		.from(SchemaProposals)
		.where(eq(SchemaProposals.id, proposal.id));
	return status;
};

const keysOf = (user: TestUser) => [
	user.keypair.getPublicKey(),
];

const read = (
	user: TestUser,
	account: string,
	scope: SignerScope = LOCALNET,
) =>
	getMultisigAccount({
		address: account,
		callerKeys: keysOf(user),
		scope,
	});

const listed = async (
	user: TestUser,
	scope: SignerScope = LOCALNET,
) =>
	(
		await listConnections({
			callerKeys: keysOf(user),
			scope,
		})
	)
		.get(user.publicKey)!
		.map((account) => account.signerSet.address);

const invitations = async (
	user: TestUser,
	showRejected = false,
) =>
	(
		await listInvitations({
			publicKey: user.publicKey,
			showRejected,
			callerKeys: keysOf(user),
			scope: LOCALNET,
		})
	).map((account) => account.signerSet.address);

const propose = async (
	user: TestUser,
	account: string,
	transactionBytes?: string,
) => {
	const bytes =
		transactionBytes ?? (await offlineTransfer(account));
	return createProposal({
		multisigAddress: account,
		transactionBytes: bytes,
		signature: (
			await user.keypair.signTransaction(fromBase64(bytes))
		).signature,
		network: 'localnet',
		signers: 'acting',
	});
};

const vote = async (user: TestUser, proposal: Proposal) =>
	voteOnProposal({
		proposalId: proposal.id,
		signature: (
			await user.keypair.signTransaction(
				fromBase64(proposal.transactionBytes),
			)
		).signature,
		signers: 'acting',
	});

const cancel = async (user: TestUser, proposal: Proposal) =>
	cancelProposal({
		proposalId: proposal.id,
		signature: await sign(
			user,
			PersonalMessages.cancelProposal(
				proposal.digest,
				proposal.accountAddress,
			),
		),
		signers: 'acting',
	});

const verify = (user: TestUser, proposal: Proposal) =>
	verifyProposal({
		proposalId: proposal.id,
		callerKeys: keysOf(user),
		signers: 'acting',
	});

const proposalsOf = (user: TestUser, account: string) =>
	listProposals({
		multisigAddress: account,
		network: 'localnet',
		cursor: { perPage: 20 },
		callerKeys: keysOf(user),
		signers: 'acting',
	});

const changeProposer = async (
	change: 'add' | 'remove',
	user: TestUser,
	account: string,
	proposer: string,
	scope: SignerScope = LOCALNET,
) => {
	const expiry = defaultExpiry();
	const message =
		change === 'add'
			? PersonalMessages.addMultisigProposer(
					proposer,
					account,
					expiry,
				)
			: PersonalMessages.removeMultisigProposer(
					proposer,
					account,
					expiry,
				);
	return (change === 'add' ? addProposer : removeProposer)({
		address: account,
		proposer,
		signature: await sign(user, message),
		expiry,
		scope,
	});
};

const eventsOf = (
	user: TestUser,
	account: string,
	scope: SignerScope = LOCALNET,
) =>
	listAccountEvents({
		accountAddress: account,
		callerKeys: keysOf(user),
		scope,
	});

const addExternalProposer = async (
	member: TestUser,
	account: string,
) => {
	const proposer = newUser();
	await framework
		.createSession()
		.addProposer(member, proposer.address, account);
	return proposer;
};

describe('access under the acting scope', () => {
	test('an accepted key of an acting set may do everything', async () => {
		const { account, k1, k2 } = await createCast();
		const [first, second] = await fundedTransfers(
			account,
			2,
		);

		expect(await listed(k1)).toEqual([account]);
		expect(
			(await read(k1, account)).signerSet.address,
		).toBe(account);

		const own = await propose(k1, account, first);
		expect(
			(await proposalsOf(k1, account)).data.map(
				(p) => p.id,
			),
		).toEqual([own.id]);
		await expectRefused(verify(k1, own), NOT_READY);

		const other = await propose(k2, account, second);
		expect(
			(await vote(k1, other)).hasReachedThreshold,
		).toBe(true);
		await cancel(k1, own);
		expect(await statusOf(own)).toBe(
			ProposalStatus.CANCELLED,
		);

		const proposer = newUser().address;
		await changeProposer('add', k1, account, proposer);
		await changeProposer('remove', k1, account, proposer);
		expect(
			(await eventsOf(k1, account)).map((e) => e.action),
		).toEqual([
			'proposer.removed',
			'proposer.added',
			'proposal.cancelled',
			'proposal.created',
			'proposal.created',
		]);
	});

	test('an invited key of an acting set reads and votes, and gets nothing that needs acceptance', async () => {
		const { account, k1, r1, composition } =
			await createCast();
		await setAliases(account, 'localnet', [
			account,
			composition,
		]);
		const proposal = await insertProposal(
			account,
			'localnet',
			k1.address,
		);

		expect(
			(await read(r1, account)).signers.actingSets.map(
				(s) => s.address,
			),
		).toContain(composition);
		await vote(r1, proposal);
		expect(await listed(r1)).toEqual([]);
		expect(await invitations(r1)).toEqual([account]);

		await expectRefused(
			proposalsOf(r1, account),
			NOT_A_MEMBER,
		);
		await expectRefused(propose(r1, account), NOT_A_MEMBER);
		await expectRefused(
			cancel(r1, proposal),
			CANNOT_CANCEL,
		);
		await expectRefused(verify(r1, proposal), NOT_A_MEMBER);
		await expectRefused(
			changeProposer('add', r1, account, newUser().address),
			NOT_A_MEMBER,
		);
		await expectRefused(
			changeProposer(
				'remove',
				r1,
				account,
				newUser().address,
			),
			NOT_A_MEMBER,
		);
		await expectRefused(
			eventsOf(r1, account),
			ACCESS_DENIED,
		);
	});

	test('a key that rejected still reads and votes, and is listed only among rejected invitations', async () => {
		const { account, k1, r1, composition } =
			await createCast();
		await setAliases(account, 'localnet', [
			account,
			composition,
		]);
		await answerFor(account, r1, 'rejected');
		const proposal = await insertProposal(
			account,
			'localnet',
			k1.address,
		);

		await read(r1, account);
		await vote(r1, proposal);
		expect(await listed(r1)).toEqual([]);
		expect(await invitations(r1)).toEqual([]);
		expect(await invitations(r1, true)).toEqual([account]);
		await expectRefused(propose(r1, account), NOT_A_MEMBER);
	});

	test('a key of a second acting set gets a member’s rights once it accepted, on that account only', async () => {
		const { account, r1, composition } = await createCast();
		await setAliases(account, 'localnet', [
			account,
			composition,
		]);
		await expectRefused(
			proposalsOf(r1, account),
			NOT_A_MEMBER,
		);

		await answerFor(account, r1, 'accepted');
		const [transfer] = await fundedTransfers(account, 1);

		expect(await listed(r1)).toEqual([account]);
		const proposal = await propose(r1, account, transfer);
		expect(
			(await proposalsOf(r1, account)).data.map(
				(p) => p.id,
			),
		).toEqual([proposal.id]);
		await cancel(r1, proposal);
		expect(await statusOf(proposal)).toBe(
			ProposalStatus.CANCELLED,
		);
		const proposer = newUser().address;
		await changeProposer('add', r1, account, proposer);
		await changeProposer('remove', r1, account, proposer);
		expect(
			(await eventsOf(r1, account)).map((e) => e.action),
		).toContain('proposer.removed');

		const other = await createAccount([
			newUser(),
			newUser(),
		]);
		await setAliases(other, 'localnet', [
			other,
			composition,
		]);
		await expectRefused(propose(r1, other), NOT_A_MEMBER);
		expect(await listed(r1)).toEqual([account]);
	});

	test('a key of a removed set gets nothing on that network, and keeps its rights on another', async () => {
		const { account, k1, k3, composition } =
			await createCast();
		await setAliases(account, 'localnet', [composition]);
		const onLocalnet = await insertProposal(
			account,
			'localnet',
			k1.address,
		);

		expect(await listed(k3)).toEqual([]);
		await expectRefused(read(k3, account), ACCESS_DENIED);
		await expectRefused(vote(k3, onLocalnet), NOT_A_MEMBER);
		await expectRefused(propose(k3, account), NOT_A_MEMBER);
		await expectRefused(
			cancel(k3, onLocalnet),
			CANNOT_CANCEL,
		);
		await expectRefused(
			changeProposer('add', k3, account, newUser().address),
			NOT_A_MEMBER,
		);
		await expectRefused(
			eventsOf(k3, account),
			ACCESS_DENIED,
		);

		const onTestnet = await insertProposal(
			account,
			'testnet',
			k1.address,
		);
		expect(await listed(k3, TESTNET)).toEqual([account]);
		await read(k3, account, TESTNET);
		await eventsOf(k3, account, TESTNET);
		await vote(k3, onTestnet);
	});

	test('a set removed and added back keeps the answer its keys gave', async () => {
		const { account, k1, r1, composition } =
			await createCast();
		await setAliases(account, 'localnet', [
			account,
			composition,
		]);
		await answerFor(account, r1, 'accepted');
		const proposal = await insertProposal(
			account,
			'localnet',
			k1.address,
		);

		await db
			.delete(SchemaAccountAliases)
			.where(
				and(
					eq(SchemaAccountAliases.accountAddress, account),
					eq(
						SchemaAccountAliases.aliasAddress,
						composition,
					),
				),
			);
		expect(await listed(r1)).toEqual([]);
		await expectRefused(vote(r1, proposal), NOT_A_MEMBER);

		await setAliases(account, 'localnet', [composition]);
		const [transfer] = await fundedTransfers(account, 1);
		expect(await listed(r1)).toEqual([account]);
		await propose(r1, account, transfer);
	});

	test('an external proposer creates, and cancels its own proposal only while nobody has signed', async () => {
		const { account, k1, composition } = await createCast();
		const proposer = await addExternalProposer(k1, account);
		const [first, second, third] = await fundedTransfers(
			account,
			3,
		);

		const unsigned = await propose(
			proposer,
			account,
			first,
		);
		await cancel(proposer, unsigned);
		expect(await statusOf(unsigned)).toBe(
			ProposalStatus.CANCELLED,
		);

		const signed = await propose(proposer, account, second);
		await vote(k1, signed);
		await expectRefused(
			cancel(proposer, signed),
			new ValidationError(
				'A signer has already signed this proposal',
			),
		);

		await expectRefused(
			read(proposer, account),
			ACCESS_DENIED,
		);
		await expectRefused(
			vote(proposer, signed),
			NOT_A_MEMBER,
		);
		await expectRefused(
			proposalsOf(proposer, account),
			NOT_A_MEMBER,
		);

		await setAliases(account, 'localnet', [composition]);
		await propose(proposer, account, third);
	});

	test('an outsider cannot read, vote, propose or list proposals, and an address that is no account looks the same', async () => {
		const { account, k1 } = await createCast();
		const outsider = newUser();
		const proposal = await insertProposal(
			account,
			'localnet',
			k1.address,
		);

		await expectRefused(
			read(outsider, account),
			ACCESS_DENIED,
		);
		await expectRefused(
			vote(outsider, proposal),
			NOT_A_MEMBER,
		);
		await expectRefused(
			propose(outsider, account),
			NOT_A_MEMBER,
		);
		await expectRefused(
			proposalsOf(outsider, account),
			NOT_A_MEMBER,
		);
		await expectRefused(
			read(k1, newUser().address),
			ACCESS_DENIED,
		);
	});

	test('a stranger’s account that lists a known composition invites its keys but is not their account', async () => {
		const { account, k1 } = await createCast();
		const strangers = [newUser(), newUser()];
		const stranger = await createAccount(strangers);
		await setAliases(stranger, 'localnet', [
			stranger,
			account,
		]);

		expect(await listed(k1)).toEqual([account]);
		expect(await invitations(k1)).toEqual([stranger]);

		const { signerSet, signers } = await read(k1, stranger);
		expect(signerSet.address).toBe(stranger);
		expect(
			signerSet.members.map((m) => m.publicKey),
		).toEqual(strangers.map((s) => s.publicKey));
		expect(signers.originalSet!.address).toBe(stranger);
		await expectRefused(
			propose(k1, stranger),
			NOT_A_MEMBER,
		);
	});

	test('a registered key acts as a set of one, and an address nobody knows gives nothing', async () => {
		const { account, k1 } = await createCast();
		const key = newUser();
		await register(key);
		const unknown = newUser().address;
		await setAliases(account, 'localnet', [
			account,
			key.address,
			unknown,
		]);

		const { signers } = await read(key, account);
		expect(
			signers.actingSets.find(
				(s) => s.address === key.address,
			),
		).toEqual({
			kind: 'key',
			address: key.address,
			threshold: 1,
			members: [
				{
					publicKey: key.publicKey,
					weight: 1,
					order: 0,
					answer: 'invited',
				},
			],
		});
		expect(signers.otherSignerSets).toEqual([unknown]);
		expect(
			signers.actingSets.map((s) => s.address),
		).not.toContain(unknown);

		await vote(
			key,
			await insertProposal(account, 'localnet', k1.address),
		);
		expect(await listed(key)).toEqual([]);
		await answerFor(account, key, 'accepted');
		expect(await listed(key)).toEqual([account]);
	});

	test('an account with no acting set on a network refuses every key there', async () => {
		const { account, k1 } = await createCast();
		await setAliases(account, 'localnet', [
			newUser().address,
		]);
		const proposal = await insertProposal(
			account,
			'localnet',
			k1.address,
		);

		await expectRefused(read(k1, account), ACCESS_DENIED);
		await expectRefused(vote(k1, proposal), NOT_A_MEMBER);
		await expectRefused(propose(k1, account), NOT_A_MEMBER);
		await expectRefused(
			propose(
				await addExternalProposer(k1, account),
				account,
			),
			NOT_A_MEMBER,
		);
		expect(await listed(k1)).toEqual([]);

		await read(k1, account, TESTNET);
		expect(await listed(k1, TESTNET)).toEqual([account]);
	});

	test('the original set is returned after it was removed, and gives nothing', async () => {
		const { account, k1, k2, k3, r1, composition } =
			await createCast();
		await setAliases(account, 'localnet', [composition]);

		const { signerSet, signers } = await read(r1, account);
		expect(signerSet.address).toBe(account);
		expect(
			signerSet.members.map((m) => m.publicKey),
		).toEqual([k1, k2, k3].map((k) => k.publicKey));
		expect(
			signers.actingSets.map((s) => s.address),
		).toEqual([composition]);
		await expectRefused(read(k3, account), ACCESS_DENIED);
	});

	test('key labels never cross accounts', async () => {
		const owners = [newUser(), newUser()];
		const account = await createAccount(owners, [], {
			labels: ['Owner one', 'Owner two'],
		});
		const strangers = [newUser(), newUser()];
		const stranger = await createAccount(strangers, [], {
			labels: ['Stranger one', 'Stranger two'],
		});
		await setAliases(stranger, 'localnet', [
			stranger,
			account,
		]);

		expect(
			(await read(owners[0], stranger)).labels,
		).toEqual(
			new Map([
				[strangers[0].publicKey, 'Stranger one'],
				[strangers[1].publicKey, 'Stranger two'],
			]),
		);
		expect((await read(owners[0], account)).labels).toEqual(
			new Map([
				[owners[0].publicKey, 'Owner one'],
				[owners[1].publicKey, 'Owner two'],
			]),
		);
	});

	test('removing a proposer with a network cancels its proposals on that network only', async () => {
		const { account, k1 } = await createCast();
		const [first, second] = [
			await addExternalProposer(k1, account),
			await addExternalProposer(k1, account),
		];
		const [firstTransfer, secondTransfer] =
			await fundedTransfers(account, 2);

		const firstOnLocalnet = await propose(
			first,
			account,
			firstTransfer,
		);
		const firstOnTestnet = await insertProposal(
			account,
			'testnet',
			first.address,
		);
		await changeProposer(
			'remove',
			k1,
			account,
			first.address,
			LOCALNET,
		);
		expect(await statusOf(firstOnLocalnet)).toBe(
			ProposalStatus.CANCELLED,
		);
		expect(await statusOf(firstOnTestnet)).toBe(
			ProposalStatus.PENDING,
		);

		const secondOnLocalnet = await propose(
			second,
			account,
			secondTransfer,
		);
		const secondOnTestnet = await insertProposal(
			account,
			'testnet',
			second.address,
		);
		await changeProposer(
			'remove',
			k1,
			account,
			second.address,
			ORIGINAL_SET,
		);
		expect(await statusOf(secondOnLocalnet)).toBe(
			ProposalStatus.CANCELLED,
		);
		expect(await statusOf(secondOnTestnet)).toBe(
			ProposalStatus.CANCELLED,
		);
	});

	test('the account list does not cost more statements with more accounts', async () => {
		const key = newUser();
		const statementsFor = async (count: number) => {
			const before = queryCount();
			expect(await listed(key)).toHaveLength(count);
			return queryCount() - before;
		};

		for (let i = 0; i < 2; i++)
			await createAccount([key], [newUser()], {
				threshold: 1,
			});
		const two = await statementsFor(2);
		expect(two).toBeGreaterThan(0);
		for (let i = 0; i < 6; i++)
			await createAccount([key], [newUser()], {
				threshold: 1,
			});
		expect(await statementsFor(8)).toBe(two);
	});
});
