import { ChevronDown } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import { Button } from '@/components/ui/button';

export type LocalNetwork = 'mainnet' | 'testnet' | 'devnet';

interface LocalNetworkSelectorProps {
	network: LocalNetwork;
	onNetworkChange: (network: LocalNetwork) => void;
}

export function LocalNetworkSelector({
	network,
	onNetworkChange,
}: LocalNetworkSelectorProps) {
	const [isOpen, setIsOpen] = useState(false);
	const dropdownRef = useRef<HTMLDivElement>(null);

	const networks: { value: LocalNetwork; label: string }[] =
		[
			{ value: 'mainnet', label: 'Mainnet' },
			{ value: 'testnet', label: 'Testnet' },
			{ value: 'devnet', label: 'Devnet' },
		];

	useEffect(() => {
		const handleClickOutside = (event: MouseEvent) => {
			if (
				dropdownRef.current &&
				!dropdownRef.current.contains(event.target as Node)
			) {
				setIsOpen(false);
			}
		};

		if (isOpen) {
			document.addEventListener(
				'mousedown',
				handleClickOutside,
			);
		}

		return () => {
			document.removeEventListener(
				'mousedown',
				handleClickOutside,
			);
		};
	}, [isOpen]);

	const handleNetworkChange = (
		newNetwork: LocalNetwork,
	) => {
		onNetworkChange(newNetwork);
		setIsOpen(false);
	};

	return (
		<div className="relative" ref={dropdownRef}>
			<Button
				variant="outline"
				size="sm"
				onClick={() => setIsOpen(!isOpen)}
				className="flex items-center gap-2"
			>
				<span className="capitalize">{network}</span>
				<ChevronDown className="w-4 h-4" />
			</Button>

			{isOpen && (
				<div className="absolute right-0 mt-2 w-40 bg-white border border-gray-200 rounded-lg shadow-lg z-50">
					{networks.map((net) => (
						<button
							key={net.value}
							onClick={() => handleNetworkChange(net.value)}
							className={`w-full text-left px-4 py-2 text-sm hover:bg-gray-50 first:rounded-t-lg last:rounded-b-lg ${
								network === net.value
									? 'bg-blue-50 text-blue-600 font-medium'
									: 'text-gray-700'
							}`}
						>
							{net.label}
						</button>
					))}
				</div>
			)}
		</div>
	);
}
