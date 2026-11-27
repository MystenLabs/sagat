// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import {
	defaultExpiry,
	PersonalMessages,
	SagatApiError,
} from '@mysten/sagat';
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
	SchemaAccountAliases,
	SchemaProposals,
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
	voteOnProposal,
} from '../src/services/proposals.service';
import {
	actingSetsOn,
	ORIGINAL_SET,
	type SignerScope,
} from '../src/services/signers.service';
import {
	ApiTestFramework,
	buildTransfer,
	newUser,
	refusal,
	sign,
	signedBy,
	type TestUser,
} from './framework/api-test-framework';
import {
	answerFor,
	register,
	setAliases,
} from './setup/acting-sets';
import {
	createTestApp,
	setupSharedTestEnvironment,
} from './setup/shared-test-setup';
import { gasCoins } from './setup/signer-changes';
import { insertNewSignerSet } from './setup/signer-sets';
import { queryCount } from './setup/test-db';
import { answer } from './setup/v1-accounts';
import {
	insertProposal,
	offlineTransfer,
} from './setup/v1-proposals';

setupSharedTestEnvironment();

const LOCALNET = actingSetsOn('localnet');
const TESTNET = actingSetsOn('testnet');

const ACCESS_DENIED = new ApiAuthError('AccessDenied');
const NOT_A_SIGNER = new ApiAuthError('NotAnAccountSigner');
const NOT_ACCEPTED = new ApiAuthError('AccountNotAccepted');

let framework: ApiTestFramework;

beforeEach(async () => {
	framework = new ApiTestFramework(await createTestApp());
});

// A route answers a service's refusal with its status and message.
const expectRefused = async (
	call: Promise<unknown>,
	error: Error,
) => {
	const thrown = await call.then(
		() => null,
		(e: unknown) => e,
	);
	if (thrown instanceof SagatApiError)
		expect(thrown.status).toBe(
			error instanceof ApiAuthError ? 403 : 400,
		);
	else expect(thrown).toBeInstanceOf(error.constructor);
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

// `A`: 2 of `k1`, `k2`, `k3`, all accepted. `R`: a composition of `r1`, `r2`.
const createCast = async () => {
	const [k1, k2, k3, r1, r2] = Array.from(
		{ length: 5 },
		newUser,
	);
	const account = await createAccount([k1, k2, k3]);
	const composition = await insertNewSignerSet({
		members: [r1, r2],
		threshold: 2,
	});
	return { account, k1, k2, k3, r1, r2, composition };
};

// Transfers from the account on localnet, each paying with its own coin.
const fundedTransfers = async (
	account: string,
	count: number,
) =>
	Promise.all(
		(await gasCoins(account, count)).map((gasCoin) =>
			buildTransfer(account, { gasCoin }),
		),
	);

const statusOf = async (proposal: { id: number }) => {
	const [{ status }] = await db
		.select({ status: SchemaProposals.status })
		.from(SchemaProposals)
		.where(eq(SchemaProposals.id, proposal.id));
	return status;
};

const keysOf = (user: TestUser) => [
	user.keypair.getPublicKey(),
];

const ROUTE_NOT_A_SIGNER = {
	status: 403,
	message: NOT_A_SIGNER.message,
};

const readRoute = async (user: TestUser, account: string) =>
	(await framework.connectedSession(user)).v1.getAccount(
		account,
		'localnet',
	);

const listedRoute = async (user: TestUser) =>
	(
		await (
			await framework.connectedSession(user)
		).v1.getAccounts('localnet')
	).accounts.map((account) => account.address);

const invitationsRoute = async (user: TestUser) =>
	(
		await (
			await framework.connectedSession(user)
		).v1.getInvitations('localnet')
	).invitations.map((account) => account.address);

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

// Anyone may call the proposal write routes; the signature decides.
const anyone = () => framework.createSession();

type ProposalRef = Pick<
	Proposal,
	'digest' | 'accountAddress' | 'transactionBytes'
> & { id: number; network: string };

const propose = async (
	user: TestUser,
	account: string,
	transactionBytes?: string,
) =>
	anyone().createProposal(
		user,
		account,
		'localnet',
		transactionBytes ?? (await offlineTransfer(account)),
	);

// The routes serve localnet only, so a proposal on another network is voted on at service level.
const vote = async (
	user: TestUser,
	proposal: ProposalRef,
) =>
	proposal.network === 'localnet'
		? anyone().voteOnProposal(
				user,
				proposal.digest,
				proposal.transactionBytes,
			)
		: voteOnProposal({
				proposalId: proposal.id,
				signature: await signedBy(
					user,
					proposal.transactionBytes,
				),
				scopeKind: 'acting',
			});

// As `vote`, a proposal on another network is cancelled at service level.
const cancel = async (
	user: TestUser,
	proposal: ProposalRef,
) =>
	proposal.network === 'localnet'
		? anyone().cancelProposal(user, proposal)
		: cancelProposal({
				proposalId: proposal.id,
				signature: await sign(
					user,
					PersonalMessages.cancelProposal(
						proposal.digest,
						proposal.accountAddress,
					),
				),
				scopeKind: 'acting',
			});

const proposalsOf = async (
	user: TestUser,
	account: string,
) =>
	(await framework.connectedSession(user)).v1.getProposals({
		accountAddress: account,
		network: 'localnet',
		perPage: 20,
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
			(await proposalsOf(k1, account)).proposals.map(
				(p) => p.digest,
			),
		).toEqual([own.digest]);
		expect(await statusOf(own)).toBe(
			ProposalStatus.PENDING,
		);

		const other = await propose(k2, account, second);
		expect(
			(
				await anyone().voteOnProposal(
					k1,
					other.digest,
					other.transactionBytes,
				)
			).ready,
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
			NOT_ACCEPTED,
		);
		await expectRefused(propose(r1, account), NOT_ACCEPTED);
		await expectRefused(cancel(r1, proposal), NOT_ACCEPTED);
		await expectRefused(
			changeProposer('add', r1, account, newUser().address),
			NOT_ACCEPTED,
		);
		await expectRefused(
			changeProposer(
				'remove',
				r1,
				account,
				newUser().address,
			),
			NOT_ACCEPTED,
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
		await expectRefused(propose(r1, account), NOT_ACCEPTED);
	});

	test('a key of a second acting set gets a member’s rights once it accepted, on that account only', async () => {
		const { account, r1, composition } = await createCast();
		await setAliases(account, 'localnet', [
			account,
			composition,
		]);
		await expectRefused(
			proposalsOf(r1, account),
			NOT_ACCEPTED,
		);

		await answerFor(account, r1, 'accepted');
		const [transfer] = await fundedTransfers(account, 1);

		expect(await listed(r1)).toEqual([account]);
		const proposal = await propose(r1, account, transfer);
		expect(
			(await proposalsOf(r1, account)).proposals.map(
				(p) => p.digest,
			),
		).toEqual([proposal.digest]);
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
		await expectRefused(propose(r1, other), NOT_ACCEPTED);
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
		await expectRefused(read(k3, account), NOT_A_SIGNER);
		await expectRefused(vote(k3, onLocalnet), NOT_A_SIGNER);
		await expectRefused(propose(k3, account), NOT_A_SIGNER);
		await expectRefused(
			cancel(k3, onLocalnet),
			NOT_A_SIGNER,
		);
		await expectRefused(
			changeProposer('add', k3, account, newUser().address),
			NOT_A_SIGNER,
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
		await cancel(k3, onTestnet);
		expect(await statusOf(onTestnet)).toBe(
			ProposalStatus.CANCELLED,
		);
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
		await expectRefused(vote(r1, proposal), NOT_A_SIGNER);

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
			NOT_A_SIGNER,
		);
		await expectRefused(
			vote(proposer, signed),
			NOT_A_SIGNER,
		);
		await expectRefused(
			proposalsOf(proposer, account),
			NOT_A_SIGNER,
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

		expect(
			await refusal(readRoute(outsider, account)),
		).toEqual(ROUTE_NOT_A_SIGNER);
		await expectRefused(
			vote(outsider, proposal),
			NOT_A_SIGNER,
		);
		await expectRefused(
			propose(outsider, account),
			NOT_A_SIGNER,
		);
		await expectRefused(
			propose(outsider, newUser().address),
			NOT_A_SIGNER,
		);
		await expectRefused(
			proposalsOf(outsider, account),
			NOT_A_SIGNER,
		);
		expect(
			await refusal(readRoute(k1, newUser().address)),
		).toEqual(ROUTE_NOT_A_SIGNER);
	});

	test('a stranger’s account that lists a known composition invites its keys but is not their account', async () => {
		const { account, k1 } = await createCast();
		const strangers = [newUser(), newUser()];
		const stranger = await createAccount(strangers);
		await setAliases(stranger, 'localnet', [
			stranger,
			account,
		]);

		expect(await listedRoute(k1)).toEqual([account]);
		expect(await invitationsRoute(k1)).toEqual([stranger]);

		const {
			address,
			signerSets: [original],
		} = await readRoute(k1, stranger);
		expect(address).toBe(stranger);
		expect(original).toMatchObject({
			address: stranger,
			members: strangers.map(({ publicKey }) => ({
				publicKey,
			})),
		});
		await expectRefused(
			propose(k1, stranger),
			NOT_ACCEPTED,
		);
	});

	test('a registered key’s own address is an unknown signer set, and gives nothing like an address nobody knows', async () => {
		const { account, k1 } = await createCast();
		const key = newUser();
		await register(key);
		const unknown = newUser().address;
		await setAliases(account, 'localnet', [
			account,
			key.address,
			unknown,
		]);

		const { signerSets } = await readRoute(k1, account);
		expect(
			signerSets.filter((s) =>
				[key.address, unknown].includes(s.address),
			),
		).toEqual(
			[key.address, unknown]
				.sort()
				.map((address) => ({ kind: 'unknown', address })),
		);

		expect(await refusal(readRoute(key, account))).toEqual(
			ROUTE_NOT_A_SIGNER,
		);
		await expectRefused(
			vote(
				key,
				await insertProposal(
					account,
					'localnet',
					k1.address,
				),
			),
			NOT_A_SIGNER,
		);
		await expectRefused(
			propose(key, account),
			NOT_A_SIGNER,
		);
		expect(await invitationsRoute(key)).toEqual([]);
		await expectRefused(
			answer(framework, key, account, 'accept'),
			NOT_A_SIGNER,
		);
	});

	test('an account with no acting set on a network refuses every key there', async () => {
		const { account, k1 } = await createCast();
		// Added by the legacy route, which refuses the account once it changed.
		const proposer = await addExternalProposer(k1, account);
		await setAliases(account, 'localnet', [
			newUser().address,
		]);
		const proposal = await insertProposal(
			account,
			'localnet',
			k1.address,
		);

		await expectRefused(read(k1, account), NOT_A_SIGNER);
		await expectRefused(vote(k1, proposal), NOT_A_SIGNER);
		await expectRefused(propose(k1, account), NOT_A_SIGNER);
		await expectRefused(
			propose(proposer, account),
			NOT_A_SIGNER,
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
		await expectRefused(read(k3, account), NOT_A_SIGNER);
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
		expect(
			await changeProposer(
				'remove',
				k1,
				account,
				first.address,
				LOCALNET,
			),
		).toEqual({
			removed: true,
			cancelledProposals: [firstOnLocalnet.digest],
		});
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
		const client = (await framework.connectedSession(key))
			.v1;
		const listedCount = async () =>
			(await client.getAccounts('localnet')).accounts
				.length;
		const statementsFor = async (count: number) => {
			// The first list refreshes the new accounts; the second finds them fresh.
			await listedCount();
			const before = queryCount();
			expect(await listedCount()).toBe(count);
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
