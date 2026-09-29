// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { test as base } from '@playwright/test';

import { Actor } from './actor';
import { Chain } from './chain';
import { Identity } from './identity';

type Fixtures = {
	chain: Chain;
	// A user with a browser, wallet and page, for people driving the UI.
	createActor: (name: string) => Promise<Actor>;
	// A user without a browser, for people who only act through the API.
	createIdentity: (name: string) => Identity;
};

export const test = base.extend<Fixtures>({
	chain: async ({}, use) => {
		await use(new Chain());
	},
	createActor: async ({ browser }, use) => {
		const actors: Actor[] = [];
		await use(async (name) => {
			const actor = await Actor.create(
				browser,
				name,
				new Ed25519Keypair(),
			);
			actors.push(actor);
			return actor;
		});
		await Promise.all(actors.map((a) => a.context.close()));
	},
	createIdentity: async ({}, use) => {
		await use(
			(name) => new Identity(name, new Ed25519Keypair()),
		);
	},
});

export { expect } from '@playwright/test';
