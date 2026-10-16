// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { FileText, PenLine, Radio } from 'lucide-react';

import BroadcastTool from '@/components/tools/BroadcastTool';
import SignatureAnalyzer from '@/components/tools/SignatureAnalyzer';
import SigningTool from '@/components/tools/SigningTool';

export type Tool = {
	id: string;
	name: string;
	description: string;
	icon: React.ReactNode;
	component: React.ComponentType;
	path: string;
	/** Talks to the chain, so the page shows the network picker. */
	needsNetwork?: boolean;
};

export const TOOLS: Tool[] = [
	{
		id: 'signature-analyzer',
		name: 'Signature Analyzer',
		description:
			'Decode a Sui signature, single or multisig, into its keys, addresses and weights.',
		icon: <FileText className="size-4" />,
		component: SignatureAnalyzer,
		path: '/tools/signature-analyzer',
	},
	{
		id: 'sign',
		name: 'Transaction Signer',
		description:
			'Preview a transaction, then sign or execute it with your connected wallet.',
		icon: <PenLine className="size-4" />,
		component: SigningTool,
		path: '/tools/sign',
		needsNetwork: true,
	},
	{
		id: 'broadcast',
		name: 'Broadcast Transaction',
		description:
			'Execute an already signed transaction on the Sui network.',
		icon: <Radio className="size-4" />,
		component: BroadcastTool,
		path: '/tools/broadcast',
		needsNetwork: true,
	},
];
