import { useCurrentAccount } from '@mysten/dapp-kit';
import { Mail, Menu, Plus } from 'lucide-react';
import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';

import { useApiAuth } from '../contexts/ApiAuthContext';
import { useInvitations } from '../hooks/useInvitations';
import { CustomWalletButton } from './CustomWalletButton';
import { Logo } from './Logo';
import { Button } from './ui/button';
import {
	Sheet,
	SheetContent,
	SheetHeader,
	SheetTitle,
	SheetTrigger,
} from './ui/sheet';

const NavigationLinks = ({
	mobile = false,
	onNavigate = () => {},
}: {
	mobile?: boolean;
	onNavigate?: () => void;
}) => {
	const currentAccount = useCurrentAccount();
	const { isCurrentAddressAuthenticated } = useApiAuth();
	const { data: invitations } = useInvitations();
	const pendingCount = invitations?.length ?? 0;
	const location = useLocation();

	return (
		<>
			{currentAccount && isCurrentAddressAuthenticated && (
				<>
					{/* Invitations button */}
					<Link to="/invitations" onClick={onNavigate}>
						<Button
							variant={
								location.pathname === '/invitations'
									? 'default'
									: 'outline'
							}
							size={mobile ? 'default' : 'sm'}
							className={`relative ${mobile ? 'w-full justify-start' : ''}`}
						>
							<Mail className="w-4 h-4 mr-2" />
							Invitations
							{pendingCount > 0 && (
								<span
									className={`absolute ${mobile ? 'top-2 right-2' : '-top-1 -right-1'} bg-orange-500 text-white text-xs rounded-full h-5 w-5 flex items-center justify-center`}
								>
									{pendingCount}
								</span>
							)}
						</Button>
					</Link>

					{/* Create multisig button */}
					<Link to="/create" onClick={onNavigate}>
						<Button
							variant={
								location.pathname === '/create'
									? 'default'
									: 'outline'
							}
							size={mobile ? 'default' : 'sm'}
							className={
								mobile ? 'w-full justify-start' : ''
							}
						>
							<Plus className="w-4 h-4 mr-2" />
							Create Multisig
						</Button>
					</Link>
				</>
			)}
		</>
	);
};

export function Header() {
	const currentAccount = useCurrentAccount();
	const { isCurrentAddressAuthenticated } = useApiAuth();
	const { data: invitations } = useInvitations();
	const [sheetOpen, setSheetOpen] = useState(false);

	// Count pending invitations
	const pendingCount = invitations?.length ?? 0;

	return (
		<div className="border-b">
			<div className="p-4 max-w-[1600px] mx-auto flex justify-between items-center">
				{/* Logo - hide subtitle on mobile */}
				<div className="block md:hidden">
					<Logo showSubtitle={false} size="sm" />
				</div>
				<div className="hidden md:block">
					<Logo />
				</div>

				{/* Desktop Navigation */}
				<div className="hidden md:flex items-center gap-4">
					<NavigationLinks />
					<CustomWalletButton />
				</div>

				{/* Mobile Navigation */}
				<div className="flex md:hidden items-center gap-2">
					<CustomWalletButton variant="header" />

					{currentAccount &&
						isCurrentAddressAuthenticated && (
							<Sheet
								open={sheetOpen}
								onOpenChange={setSheetOpen}
							>
								<SheetTrigger asChild>
									<Button
										variant="outline"
										size="sm"
										className="relative"
									>
										<Menu className="w-4 h-4" />
										{pendingCount > 0 && (
											<span className="absolute -top-1 -right-1 bg-orange-500 text-white text-xs rounded-full h-4 w-4 flex items-center justify-center">
												{pendingCount}
											</span>
										)}
									</Button>
								</SheetTrigger>
								<SheetContent
									side="right"
									className="w-[300px] sm:w-[350px]"
								>
									<SheetHeader>
										<SheetTitle>Navigation</SheetTitle>
									</SheetHeader>
									<div className="mt-8 flex flex-col gap-4 px-2">
										<NavigationLinks
											mobile
											onNavigate={() => setSheetOpen(false)}
										/>
									</div>
								</SheetContent>
							</Sheet>
						)}
				</div>
			</div>
		</div>
	);
}
