// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { readFile } from 'node:fs/promises';
import { MultiSigPublicKey } from '@mysten/sui/multisig';
import { MIST_PER_SUI } from '@mysten/sui/utils';
import { publicKeyFromSuiBytes } from '@mysten/sui/verify';
import { type Locator } from '@playwright/test';

import { randomAddress } from '../support/chain';
import { expect, test } from '../support/fixtures';
import {
	proposeTransfer,
	setupMultisig,
	signProposal,
} from '../support/scenarios';

// The parts of a proposal export (built in the app, see
// app/src/lib/exportUtils.ts) needed to execute it.
type ProposalExport = {
	type: string;
	proposal: {
		digest: string;
		transactionBytes: string;
		signatures: { signature: string }[];
	};
	multisig: {
		threshold: number;
		members: {
			publicKey: string;
			weight: number;
			order: number;
		}[];
	};
};

// Unit tests cover the export's fields; this checks the file actually works.
test('a proposal export is enough to execute it without the app', async ({
	createActor,
	createIdentity,
	chain,
}) => {
	const alice = await createActor('alice');
	const bob = createIdentity('bob');
	const multisig = await setupMultisig({
		creator: alice,
		members: [bob],
		threshold: 2,
	});
	await chain.fund(multisig.address);
	const recipient = randomAddress();
	const proposal = await proposeTransfer(chain, bob, {
		multisigAddress: multisig.address,
		recipient,
		amount: MIST_PER_SUI,
	});
	await signProposal(alice, proposal);

	await alice.signIn();
	const exported = await downloadJson<ProposalExport>(
		alice
			.proposalCard(proposal.digest)
			.getByTestId('export-proposal-button'),
	);
	expect(exported.type).toBe('sagat.proposal');
	expect(exported.proposal.digest).toBe(proposal.digest);

	// Everything below comes from the file alone.
	const multisigKey = MultiSigPublicKey.fromPublicKeys({
		threshold: exported.multisig.threshold,
		publicKeys: [...exported.multisig.members]
			.sort((a, b) => a.order - b.order)
			.map(({ publicKey, weight }) => ({
				publicKey: publicKeyFromSuiBytes(publicKey),
				weight,
			})),
	});
	expect(multisigKey.toSuiAddress()).toBe(multisig.address);
	await chain.execute(
		exported.proposal.transactionBytes,
		multisigKey.combinePartialSignatures(
			exported.proposal.signatures.map((s) => s.signature),
		),
	);
	expect(await chain.balance(recipient)).toBe(MIST_PER_SUI);
});

// Clicks `button` and parses the JSON file it downloads.
async function downloadJson<T>(button: Locator) {
	const [download] = await Promise.all([
		button.page().waitForEvent('download'),
		button.click(),
	]);
	return JSON.parse(
		await readFile(await download.path(), 'utf8'),
	) as T;
}
