// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { FileText, PenLine, Radio } from 'lucide-react';

import BroadcastTool from '@/components/tools/BroadcastTool';
import SignatureAnalyzer from '@/components/tools/SignatureAnalyzer';
import SigningTool from '@/components/tools/SigningTool';
import { content } from '@/content';

const COPY = content.tools.pages;

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
		name: COPY.signatureAnalyzer.name,
		description: COPY.signatureAnalyzer.description,
		icon: <FileText className="size-4" />,
		component: SignatureAnalyzer,
		path: '/tools/signature-analyzer',
	},
	{
		id: 'sign',
		name: COPY.sign.name,
		description: COPY.sign.description,
		icon: <PenLine className="size-4" />,
		component: SigningTool,
		path: '/tools/sign',
	},
	{
		id: 'broadcast',
		name: COPY.broadcast.name,
		description: COPY.broadcast.description,
		icon: <Radio className="size-4" />,
		component: BroadcastTool,
		path: '/tools/broadcast',
	},
];
