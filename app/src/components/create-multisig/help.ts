// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

/** The create wizard's Help card. Edit the answers here. */
export const HELP = [
	{
		id: 'what-is-a-multisig',
		question: 'What is a multisig?',
		answer:
			'A shared Sui account that moves funds only when enough of its signers approve. No single key controls it unless you give that key enough weight.',
	},
	{
		id: 'weights-and-threshold',
		question: 'How do weights and the threshold work?',
		answer:
			'Each signer’s approval counts for their weight. A proposal can be executed once the approvals add up to the threshold.',
	},
	{
		id: 'public-key',
		question: 'What is a public key?',
		answer:
			'The shareable half of a signer’s wallet key, which Sui uses to check their signatures. Sharing it is safe, and an address that has signed a transaction before is enough to find it.',
	},
	{
		id: 'after-create',
		question: 'What happens after I create it?',
		answer:
			'Every other signer gets an invitation to accept. The Sui address can receive funds right away, but wait until everyone has accepted before you move real funds.',
	},
] as const;
