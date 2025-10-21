import { FileText, PenLine } from 'lucide-react';

import SignatureAnalyzer from '@/components/tools/SignatureAnalyzer';
import SigningTool from '@/components/tools/SigningTool';

export type Tool = {
	id: string;
	name: string;
	description: string;
	headerDescription: string;
	icon: React.ReactNode;
	component: React.ComponentType;
	path: string;
};

export const TOOLS: Tool[] = [
	{
		id: 'signature-analyzer',
		name: 'Signature Analyzer',
		description:
			'Analyze and decode Sui signatures, both for multisig and single signature schemes.',
		headerDescription: 'Analyze and decode Sui signatures',
		icon: <FileText className="w-3.5 h-3.5" />,
		component: SignatureAnalyzer,
		path: '/tools/signature-analyzer',
	},
	{
		id: 'sign',
		name: 'Transaction Signer',
		description:
			'Preview and sign Sui transactions with your connected wallet.',
		headerDescription: 'Preview and sign',
		icon: <PenLine className="w-3.5 h-3.5" />,
		component: SigningTool,
		path: '/tools/sign',
	},
];
