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
};

export const TOOLS: Tool[] = [
	{
		id: 'signature-analyzer',
		name: 'Signature Analyzer',
		description:
			'Decode a Sui signature. Works for multisig and single signatures.',
		icon: <FileText className="size-4" />,
		component: SignatureAnalyzer,
		path: '/tools/signature-analyzer',
	},
	{
		id: 'sign',
		name: 'Transaction Signer',
		description:
			'Preview a Sui transaction and sign it with your connected wallet.',
		icon: <PenLine className="size-4" />,
		component: SigningTool,
		path: '/tools/sign',
	},
	{
		id: 'broadcast',
		name: 'Broadcasts',
		description:
			'Send a signed transaction to the Sui network.',
		icon: <Radio className="size-4" />,
		component: BroadcastTool,
		path: '/tools/broadcast',
	},
];
