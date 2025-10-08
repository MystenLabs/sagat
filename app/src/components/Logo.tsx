import { LucideLock } from 'lucide-react';
import { Link } from 'react-router-dom';

interface LogoProps {
	showSubtitle?: boolean;
	size?: 'sm' | 'md' | 'lg';
	asLink?: boolean;
}

export function Logo({
	showSubtitle = true,
	size = 'md',
	asLink = true,
}: LogoProps) {
	const sizeClasses = {
		sm: {
			icon: 'w-4 h-4',
			iconPadding: 'p-1.5',
			text: 'text-lg',
			subtitle: 'text-xs',
		},
		md: {
			icon: 'w-5 h-5',
			iconPadding: 'p-2',
			text: 'text-xl',
			subtitle: 'text-xs',
		},
		lg: {
			icon: 'w-6 h-6',
			iconPadding: 'p-2.5',
			text: 'text-2xl',
			subtitle: 'text-sm',
		},
	};

	const classes = sizeClasses[size];

	const logoContent = (
		<div className="flex items-center gap-2">
			<div className="relative">
				<div className="absolute inset-0 bg-gradient-to-br from-blue-600 to-purple-600 rounded-lg opacity-90 group-hover:opacity-100 transition-opacity"></div>
				<div
					className={`relative bg-gradient-to-br from-blue-500 to-purple-500 ${classes.iconPadding} rounded-lg shadow-sm`}
				>
					<LucideLock
						className={`${classes.icon} text-white`}
					/>
				</div>
			</div>
			<div className="flex flex-col">
				<span
					className={`${classes.text} font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent`}
				>
					SAGAT
				</span>
				{showSubtitle && (
					<span
						className={`${classes.subtitle} text-gray-400 -mt-0.5`}
					>
						Sui Multisig Manager
					</span>
				)}
			</div>
		</div>
	);

	if (asLink) {
		return (
			<Link to="/" className="group">
				{logoContent}
			</Link>
		);
	}

	return <div className="group">{logoContent}</div>;
}
