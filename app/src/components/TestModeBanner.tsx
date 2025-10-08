import { AlertTriangle, X } from 'lucide-react';
import { useState } from 'react';

import { useNetwork } from '../contexts/NetworkContext';

export function TestModeBanner() {
	const { isTestMode, network, setNetwork } = useNetwork();
	const [isDismissed, setIsDismissed] = useState(false);

	if (!isTestMode || isDismissed) {
		return null;
	}

	const handleDismiss = () => {
		setIsDismissed(true);
	};

	return (
		<div className="fixed bottom-0 left-0 right-0 bg-yellow-100 border-t-2 border-yellow-300 px-4 py-3 shadow-lg z-50">
			<div className="flex items-center justify-between max-w-7xl mx-auto">
				<div className="flex items-center gap-3">
					<AlertTriangle className="w-5 h-5 text-yellow-700" />
					<div>
						<p className="text-sm font-medium text-yellow-800">
							Test Mode Active
						</p>
						<p className="text-xs text-yellow-700">
							You're connected to {network}. No real funds
							will be used.
						</p>
					</div>
				</div>
				<div className="flex items-center gap-2">
					<button
						onClick={() => setNetwork('mainnet')}
						className="text-xs bg-black hover:bg-gray-800 text-white px-3 py-1.5 rounded transition-colors"
					>
						Switch to Mainnet
					</button>
					<button
						onClick={handleDismiss}
						className="p-1 hover:bg-yellow-200 rounded transition-colors"
						title="Dismiss"
					>
						<X className="w-4 h-4 text-yellow-700" />
					</button>
				</div>
			</div>
		</div>
	);
}
