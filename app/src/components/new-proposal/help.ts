// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

/** The new-proposal wizard's Help card. Edit the answers here. */
export const HELP = [
	{
		id: 'what-happens',
		question: 'What happens when I propose?',
		answer:
			'You sign it as you propose. It appears in Proposals for the other signers, who sign until their weight reaches the threshold. Then anyone can execute it.',
	},
	{
		id: 'who-can-see',
		question: 'Who can see and sign it?',
		answer:
			'Every signer of the account, and anyone with the link, can see it. Only signers’ signatures count, each by its weight.',
	},
	{
		id: 'expiry',
		question: 'When does a proposal expire?',
		answer:
			'Only when the transaction sets an expiry. Sending SUI from an account that holds some of it as an address balance sets one of up to two epochs, about two days; most other transactions don’t expire. Until it’s executed, the signer who proposed it can cancel it.',
	},
	{
		id: 'change',
		question: 'Can I change it after proposing?',
		answer: 'No. Cancel it and propose a new one instead.',
	},
] as const;
