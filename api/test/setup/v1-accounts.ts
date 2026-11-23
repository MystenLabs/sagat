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
	const expiry = defaultExpiry();
	const signature = await sign(
		user,
		given === 'accept'
			? PersonalMessages.acceptAccountInvitation(
					account,
					expiry,
				)
			: PersonalMessages.rejectAccountInvitation(
					account,
					expiry,
				),
	);
	const client = framework.createSession().v1;
	return given === 'accept'
		? client.acceptAccountInvite(account, {
				network: 'localnet',
				signature,
				expiry,
			})
		: client.rejectAccountInvite(account, {
				network: 'localnet',
				signature,
				expiry,
			});
};

// Adds or removes a proposer of the account on localnet, signed by the user, through `/v1`.
export const changeProposer = async (
	framework: ApiTestFramework,
	change: 'add' | 'remove',
	user: TestUser,
	account: string,
	proposer: string,
) => {
	const expiry = defaultExpiry();
	const signature = await sign(
		user,
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
				),
	);
	const client = framework.createSession().v1;
	const body = {
		network: 'localnet' as const,
		proposer,
		signature,
		expiry,
	};
	return change === 'add'
		? client.addAccountProposer(account, body)
		: client.removeAccountProposer(account, body);
};
