import { Copy, Search, X } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

import { apiClient } from '../../lib/api';
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
	const [isLoading, setIsLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);

	if (!isOpen) return null;

	const lookupPublicKey = async () => {
		if (!address) return;

		// Basic address validation
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

		try {
			const result =
				await apiClient.getAddressInfo(address);
			setPublicKey(result.publicKey);
		} catch (err) {
			setError(
				err instanceof Error
					? err.message
					: 'Address not found in our system',
			);
		} finally {
			setIsLoading(false);
		}
	};

	const handleSelectKey = (key: string) => {
		onSelectPublicKey(key);
		handleClose();
	};

	const handleClose = () => {
		onClose();
		setAddress('');
		setPublicKey(null);
		setError(null);
	};

	const copyToClipboard = (text: string) => {
		navigator.clipboard.writeText(text);
		toast.success('Copied to clipboard');
	};

	return (
		<div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
			<div className="bg-white rounded-lg p-6 w-full max-w-md mx-4">
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
						<div className="p-3 bg-red-50 border border-red-200 rounded-lg">
							<p className="text-sm text-red-700">
								{error}
							</p>
						</div>
					)}

					{publicKey && (
						<div className="space-y-2">
							<label className="block text-sm font-medium">
								Found Public Key:
							</label>
							<div className="flex items-center gap-2 p-3 border rounded-lg bg-green-50">
								<span className="text-xs font-mono flex-1 break-all">
									{publicKey}
								</span>
								<Button
									size="icon"
									variant="ghost"
									onClick={() => copyToClipboard(publicKey)}
								>
									<Copy className="w-3 h-3" />
								</Button>
								<Button
									size="sm"
									onClick={() => handleSelectKey(publicKey)}
								>
									Select
								</Button>
							</div>
						</div>
					)}

					<div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
						<p className="text-sm text-blue-700">
							<strong>Tip:</strong> This will only find
							addresses that have been previously registered
							in our system. If the address is not found,
							ask the member to provide their public key
							directly.
						</p>
					</div>
				</div>
			</div>
		</div>
	);
}
