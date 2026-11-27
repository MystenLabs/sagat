// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { SagatClient, type Fetch } from '@mysten/sagat';
import { SagatV1Client } from '@mysten/sagat/v1';

import {
	actingOnly,
	type AppProposalList,
} from './proposal-integrity';

export const API_BASE_URL =
	import.meta.env.VITE_API_URL || 'http://localhost:3000';

const apiFetchFailures = new WeakSet<object>();

/** Whether the error is a request to the API that never got an answer. */
export function isApiFetchFailure(error: unknown): boolean {
	return (
		typeof error === 'object' &&
		error !== null &&
		apiFetchFailures.has(error)
	);
}

const apiFetch: Fetch = async (url, init) => {
	try {
		return await fetch(url, init);
	} catch (error) {
		if (typeof error === 'object' && error !== null)
			apiFetchFailures.add(error);
		throw error;
	}
};

export const apiClient = new SagatClient(
	API_BASE_URL,
	'cookie',
	apiFetch,
);

// Every proposal the app reads comes through here.
class AppV1Client extends SagatV1Client {
	override async createProposal(
		...args: Parameters<SagatV1Client['createProposal']>
	) {
		return actingOnly(await super.createProposal(...args));
	}

	override async getProposals(
		...args: Parameters<SagatV1Client['getProposals']>
	): Promise<AppProposalList> {
		const list = await super.getProposals(...args);
		return {
			...list,
			proposals: list.proposals.map(actingOnly),
		};
	}

	override async getProposalByDigest(digest: string) {
		return actingOnly(
			await super.getProposalByDigest(digest),
		);
	}

	override async voteForProposal(
		...args: Parameters<SagatV1Client['voteForProposal']>
	) {
		return actingOnly(await super.voteForProposal(...args));
	}

	override async cancelProposal(
		...args: Parameters<SagatV1Client['cancelProposal']>
	) {
		return actingOnly(await super.cancelProposal(...args));
	}

	override async verifyProposalByDigest(digest: string) {
		return actingOnly(
			await super.verifyProposalByDigest(digest),
		);
	}
}

export const apiV1Client = new AppV1Client(API_BASE_URL, {
	fetch: apiFetch,
});
