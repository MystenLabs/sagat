// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import {
	CheckCircle,
	Lock,
	Plus,
	Users,
} from 'lucide-react';
import { useState } from 'react';

import { Button } from './ui/button';

export function OnboardingView() {
	const [showCreateForm, setShowCreateForm] =
		useState(false);

	if (showCreateForm) {
		// TODO: Replace with actual CreateMultisigForm component
		return (
			<div className="max-w-2xl mx-auto mt-10 p-8">
				<h2 className="text-2xl font-bold mb-4">
					Create Multisig
				</h2>
				<p className="text-gray-600">Form coming soon...</p>
				<Button
					onClick={() => setShowCreateForm(false)}
					variant="outline"
					className="mt-4"
				>
					Back
				</Button>
			</div>
		);
	}

	return (
		<div className="max-w-4xl mx-auto mt-10 px-4">
			{/* Hero Section */}
			<div className="text-center mb-12">
				<h1 className="text-4xl font-bold mb-4">
					Create Your First Multisig
				</h1>
				<p className="text-xl text-gray-600 mb-8">
					Secure your assets with multi-signature protection
					on Sui
				</p>
				<Button
					size="lg"
					onClick={() => setShowCreateForm(true)}
					className="px-8"
				>
					<Plus className="mr-2 h-5 w-5" />
					Create Multisig Wallet
				</Button>
			</div>

			{/* Features */}
			<div className="grid md:grid-cols-3 gap-6 mt-16">
				<div className="text-center p-6">
					<div className="inline-flex items-center justify-center w-16 h-16 bg-blue-100 rounded-full mb-4">
						<Users className="w-8 h-8 text-blue-600" />
					</div>
					<h3 className="font-semibold text-lg mb-2">
						Shared Control
					</h3>
					<p className="text-gray-600 text-sm">
						Require multiple approvals for transactions,
						perfect for teams and DAOs
					</p>
				</div>

				<div className="text-center p-6">
					<div className="inline-flex items-center justify-center w-16 h-16 bg-green-100 rounded-full mb-4">
						<Lock className="w-8 h-8 text-green-600" />
					</div>
					<h3 className="font-semibold text-lg mb-2">
						Enhanced Security
					</h3>
					<p className="text-gray-600 text-sm">
						Protect against single points of failure and
						unauthorized access
					</p>
				</div>

				<div className="text-center p-6">
					<div className="inline-flex items-center justify-center w-16 h-16 bg-purple-100 rounded-full mb-4">
						<CheckCircle className="w-8 h-8 text-purple-600" />
					</div>
					<h3 className="font-semibold text-lg mb-2">
						Transparent Governance
					</h3>
					<p className="text-gray-600 text-sm">
						All members can view and approve transactions
						before execution
					</p>
				</div>
			</div>

			{/* How it works */}
			<div className="mt-16 bg-gray-50 rounded-lg p-8">
				<h2 className="text-2xl font-semibold mb-6">
					How It Works
				</h2>
				<div className="space-y-4">
					<div className="flex items-start">
						<div className="shrink-0 w-8 h-8 bg-blue-600 text-white rounded-full flex items-center justify-center font-semibold">
							1
						</div>
						<div className="ml-4">
							<h4 className="font-medium mb-1">
								Set up your multisig
							</h4>
							<p className="text-gray-600 text-sm">
								Choose members and set the approval
								threshold
							</p>
						</div>
					</div>

					<div className="flex items-start">
						<div className="shrink-0 w-8 h-8 bg-blue-600 text-white rounded-full flex items-center justify-center font-semibold">
							2
						</div>
						<div className="ml-4">
							<h4 className="font-medium mb-1">
								Propose transactions
							</h4>
							<p className="text-gray-600 text-sm">
								Any member can propose a transaction for
								approval
							</p>
						</div>
					</div>

					<div className="flex items-start">
						<div className="shrink-0 w-8 h-8 bg-blue-600 text-white rounded-full flex items-center justify-center font-semibold">
							3
						</div>
						<div className="ml-4">
							<h4 className="font-medium mb-1">
								Collect approvals
							</h4>
							<p className="text-gray-600 text-sm">
								Members review and sign the transaction
							</p>
						</div>
					</div>

					<div className="flex items-start">
						<div className="shrink-0 w-8 h-8 bg-blue-600 text-white rounded-full flex items-center justify-center font-semibold">
							4
						</div>
						<div className="ml-4">
							<h4 className="font-medium mb-1">Execute</h4>
							<p className="text-gray-600 text-sm">
								Once threshold is met, execute the
								transaction on-chain
							</p>
						</div>
					</div>
				</div>
			</div>
		</div>
	);
}
