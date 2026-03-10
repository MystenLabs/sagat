// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { Copy, Globe, Search, X } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

import { apiClient } from '../../lib/api';
import {
	findPublicKeyOnChain,
	MultisigAddressError,
	type OnChainPublicKeyResult,
} from '../../lib/onChainLookup';
import { Button } from '../ui/button';
import { Input } from '../ui/input';

interface AddressLookupModalProps {
	isOpen: boolean;
	onClose: () => void;
	onSelectPublicKey: (publicKey: string) => void;
}

export function AddressLookupModal({
	isOpen,
	onClose,
	onSelectPublicKey,
}: AddressLookupModalProps) {
	const [address, setAddress] = useState('');
	const [publicKey, setPublicKey] = useState<string | null>(
		null,
	);
	const [onChainResult, setOnChainResult] =
		useState<OnChainPublicKeyResult | null>(null);
	const [isLoading, setIsLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);

	if (!isOpen) return null;

	const lookupPublicKey = async () => {
		if (!address) return;

		if (
			!address.startsWith('0x') ||
			address.length !== 66
		) {
			setError(
				'Please enter a valid Sui address (should start with 0x and be 66 characters long)',
			);
			return;
		}

		setIsLoading(true);
		setError(null);
		setPublicKey(null);
		setOnChainResult(null);

		const [systemResult, chainResult] =
			await Promise.allSettled([
				apiClient.getAddressInfo(address),
				findPublicKeyOnChain(address),
			]);

		if (
			chainResult.status === 'rejected' &&
			chainResult.reason instanceof MultisigAddressError
		) {
			setError(chainResult.reason.message);
		} else if (
			systemResult.status === 'fulfilled' &&
			systemResult.value?.publicKey
		) {
			setPublicKey(systemResult.value.publicKey);
		} else if (
			chainResult.status === 'fulfilled' &&
			chainResult.value
		) {
			setOnChainResult(chainResult.value);
		} else {
			setError(
				'Public key not found. The address has no transactions on any network and is not registered in our system.',
			);
		}

		setIsLoading(false);
	};

	const handleSelectKey = (key: string) => {
		onSelectPublicKey(key);
		handleClose();
	};

	const handleClose = () => {
		onClose();
		setAddress('');
		setPublicKey(null);
		setOnChainResult(null);
		setError(null);
	};

	const copyToClipboard = (text: string) => {
		navigator.clipboard.writeText(text);
		toast.success('Copied to clipboard');
	};

	const foundKey = publicKey ?? onChainResult?.publicKey;

	return (
		<div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
			<div className="bg-background rounded-lg p-6 w-full max-w-md mx-4">
				<div className="flex items-center justify-between mb-4">
					<h2 className="text-lg font-semibold">
						Look up Public Key
					</h2>
					<Button
						variant="ghost"
						size="icon"
						onClick={handleClose}
					>
						<X className="w-4 h-4" />
					</Button>
				</div>

				<div className="space-y-4">
					<div>
						<label className="block text-sm font-medium mb-2">
							Sui Address
						</label>
						<div className="flex gap-2">
							<Input
								value={address}
								onChange={(e) => setAddress(e.target.value)}
								placeholder="0x..."
								className="flex-1"
								onKeyDown={(e) => {
									if (
										e.key === 'Enter' &&
										!isLoading &&
										address
									) {
										lookupPublicKey();
									}
								}}
							/>
							<Button
								onClick={lookupPublicKey}
								disabled={isLoading || !address}
							>
								<Search className="w-4 h-4 mr-2" />
								{isLoading ? 'Looking up...' : 'Lookup'}
							</Button>
						</div>
					</div>

					{error && (
						<div className="p-3 bg-error border border-error-border rounded-lg">
							<p className="text-sm text-error-foreground">
								{error}
							</p>
						</div>
					)}

					{foundKey && (
						<div className="space-y-2">
							<label className="block text-sm font-medium">
								Found Public Key:
							</label>
							<div className="flex items-center gap-2 p-3 border rounded-lg bg-success">
								<span className="text-xs font-mono flex-1 break-all">
									{foundKey}
								</span>
								<Button
									size="icon"
									variant="ghost"
									onClick={() => copyToClipboard(foundKey)}
								>
									<Copy className="w-3 h-3" />
								</Button>
								<Button
									size="sm"
									onClick={() => handleSelectKey(foundKey)}
								>
									Select
								</Button>
							</div>
							{onChainResult && (
								<p className="text-xs text-success-foreground flex items-center gap-1">
									<Globe className="w-3 h-3" />
									Recovered from on-chain transaction on{' '}
									<strong>{onChainResult.network}</strong>
								</p>
							)}
						</div>
					)}

					<div className="p-3 bg-info border border-info-border rounded-lg">
						<p className="text-sm text-info-foreground">
							<strong>Tip:</strong> An address is found in
							our system if it has previously signed in. We
							also check on-chain transactions across
							mainnet, testnet, and devnet — if the address
							has sent a transaction still within the
							RPC&apos;s retention window, we can recover
							the public key from its signature.
						</p>
					</div>
				</div>
			</div>
		</div>
	);
}
