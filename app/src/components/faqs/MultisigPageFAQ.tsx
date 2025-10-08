import { Key, Shield, Users } from 'lucide-react';

import {
	Accordion,
	AccordionContent,
	AccordionItem,
	AccordionTrigger,
} from '../ui/accordion';

interface FAQItem {
	id: string;
	icon: React.ComponentType<{ className?: string }>;
	question: string;
	answer: React.ReactNode;
}

const faqData: FAQItem[] = [
	{
		id: 'what-is-multisig',
		icon: Users,
		question: 'What is a multisig wallet?',
		answer:
			'Sui has native multisig support, and Sagat enables you to create multisigs, create/aggregate signatures for proposals and be part of multiple schemes.',
	},
	{
		id: 'how-threshold-works',
		icon: Shield,
		question: 'How does the threshold work?',
		answer:
			'The threshold determines how many signatures are needed to execute a transaction. For example, in a 2-of-3 multisig, any 2 out of the 3 members can authorize transactions. Higher thresholds provide more security but require more coordination.',
	},
	{
		id: 'public-keys',
		icon: Key,
		question: 'What are public keys?',
		answer:
			"Public keys are cryptographic identifiers that correspond to wallet addresses. You can find your public key in your wallet settings. We'll automatically register any new public keys when creating the multisig.",
	},
	{
		id: 'setup-process',
		icon: Users,
		question: 'What happens after creation?',
		answer: (
			<div className="space-y-2">
				<p>After creating your multisig:</p>
				<ol className="list-decimal list-inside space-y-1 text-sm">
					<li>
						All member public keys are registered in our
						system
					</li>
					<li>
						The multisig is created on the Sui blockchain
					</li>
					<li>Members receive invitations to join</li>
					<li>Each member must accept their invitation</li>
					<li>
						Once all members accept, the multisig becomes
						active
					</li>
				</ol>
			</div>
		),
	},
	{
		id: 'security-tips',
		icon: Shield,
		question: 'Security best practices',
		answer: (
			<div className="space-y-2">
				<ul className="list-disc list-inside space-y-1 text-sm">
					<li>
						Choose trusted co-signers who understand their
						responsibilities
					</li>
					<li>
						Use a reasonable threshold (not too low or too
						high)
					</li>
					<li>
						Keep your private keys secure and backed up
					</li>
					<li>
						Test with small amounts before moving large
						funds
					</li>
					<li>
						Have a recovery plan if members become
						unavailable
					</li>
				</ul>
			</div>
		),
	},
];

export function MultisigPageFAQ() {
	return (
		<Accordion
			type="single"
			collapsible
			className="space-y-2"
		>
			{faqData.map((faq) => {
				const IconComponent = faq.icon;
				return (
					<AccordionItem
						key={faq.id}
						value={faq.id}
						className="bg-white rounded-lg border px-4"
					>
						<AccordionTrigger className="text-left">
							<div className="flex items-center gap-2">
								<IconComponent className="w-4 h-4 text-slate-600" />
								{faq.question}
							</div>
						</AccordionTrigger>
						<AccordionContent className="text-slate-600">
							{faq.answer}
						</AccordionContent>
					</AccordionItem>
				);
			})}
		</Accordion>
	);
}
