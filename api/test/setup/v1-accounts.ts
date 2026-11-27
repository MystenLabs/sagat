// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import {
	defaultExpiry,
	PersonalMessages,
} from '@mysten/sagat';

import {
	sign,
	type ApiTestFramework,
	type TestUser,
} from '../framework/api-test-framework';

// The user's answer to an invitation to the account on localnet, through `/v1`.
export const answer = async (
	framework: ApiTestFramework,
	user: TestUser,
	account: string,
	given: 'accept' | 'reject',
) => {
	const accept = given === 'accept';
	const expiry = defaultExpiry();
	const body = {
		network: 'localnet' as const,
		signature: await sign(
			user,
			(accept
				? PersonalMessages.acceptAccountInvitation
				: PersonalMessages.rejectAccountInvitation)(
				account,
				expiry,
			),
		),
		expiry,
	};
	const client = framework.createSession().v1;
	return accept
		? client.acceptAccountInvite(account, body)
		: client.rejectAccountInvite(account, body);
};

// Adds or removes a proposer of the account on localnet, signed by the user, through `/v1`.
export const changeProposer = async (
	framework: ApiTestFramework,
	change: 'add' | 'remove',
	user: TestUser,
	account: string,
	proposer: string,
) => {
	const add = change === 'add';
	const expiry = defaultExpiry();
	const body = {
		network: 'localnet' as const,
		proposer,
		signature: await sign(
			user,
			(add
				? PersonalMessages.addMultisigProposer
				: PersonalMessages.removeMultisigProposer)(
				proposer,
				account,
				expiry,
			),
		),
		expiry,
	};
	const client = framework.createSession().v1;
	return add
		? client.addAccountProposer(account, body)
		: client.removeAccountProposer(account, body);
};
