// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

// The legacy routes describe one composition with no network, so they refuse an account whose signers changed on any network.

import { SUPPORTED_NETWORKS } from '../db/env';
import { ServedByV1OnlyError } from '../errors';
import {
	aliasSetLoaders,
	type AliasSetLoaders,
} from '../loaders/alias-set.loader';
import { type SuiNetwork } from '../utils/client';
import { isAccount } from './accounts.service';
import {
	refreshStaleAliases,
	requireFreshAliases,
} from './aliases.service';
import { changedAccounts } from './signers.service';

type ChangedAccountOptions = {
	networks?: SuiNetwork[];
	loaders?: AliasSetLoaders;
};

// A failed read keeps the mirror as it is.
export const listChangedAccounts = async (
	accountAddresses: string[],
	{
		networks = SUPPORTED_NETWORKS,
		loaders = aliasSetLoaders,
	}: ChangedAccountOptions = {},
): Promise<Set<string>> => {
	const accounts = [...new Set(accountAddresses)];
	if (accounts.length === 0) return new Set();
	await Promise.all(
		networks.map((network) =>
			refreshStaleAliases(accounts, network, loaders),
		),
	);
	return changedAccounts(accounts, networks);
};

// A write needs a fresh alias state on every network, or fails with a 503.
export const refuseChangedAccount = async (
	accountAddress: string,
	use: 'read' | 'write',
	{
		networks = SUPPORTED_NETWORKS,
		loaders = aliasSetLoaders,
	}: ChangedAccountOptions = {},
) => {
	if (use === 'write')
		await Promise.all(
			networks.map((network) =>
				requireFreshAliases(
					accountAddress,
					network,
					loaders,
				),
			),
		);
	const changed =
		use === 'write'
			? await changedAccounts([accountAddress], networks)
			: await listChangedAccounts([accountAddress], {
					networks,
					loaders,
				});
	if (changed.size > 0)
		throw new ServedByV1OnlyError(
			'An account whose signers changed',
		);
};

// For an address from the request: one that is no account is left to the route.
export const refuseIfChangedAccount = async (
	address: string,
	use: 'read' | 'write',
	options?: ChangedAccountOptions,
) => {
	if (await isAccount(address))
		await refuseChangedAccount(address, use, options);
};
