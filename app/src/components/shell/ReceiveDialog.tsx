// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { Check, Copy, XIcon } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';

import { Button } from '@/components/ui/button';
import {
	Dialog,
	DialogClose,
	DialogContent,
	DialogDescription,
	DialogTitle,
} from '@/components/ui/dialog';
import { useNetwork } from '@/contexts/NetworkContext';
import { useCopyToClipboard } from '@/hooks/useCopyToClipboard';

/** The account's address as a QR code and in full, to share for deposits. */
export function ReceiveDialog({
	open,
	onClose,
	address,
	name,
}: {
	open: boolean;
	onClose: () => void;
	address: string;
	name: string;
}) {
	const { network } = useNetwork();
	const { copied, copy } = useCopyToClipboard(
		'Address copied',
	);

	return (
		<Dialog
			open={open}
			onOpenChange={(next) => {
				if (!next) onClose();
			}}
		>
			<DialogContent
				showCloseButton={false}
				className="gap-6 rounded-2xl p-8 sm:max-w-[480px]"
				data-testid="receive-dialog"
			>
				<div className="flex items-start justify-between gap-4">
					<div className="flex flex-col gap-1">
						<DialogTitle className="text-24 font-bold">
							Receive
						</DialogTitle>
						<DialogDescription className="text-14 text-muted-foreground">
							Send SUI and tokens on{' '}
							<span className="capitalize">{network}</span>{' '}
							to {name}.
						</DialogDescription>
					</div>
					<DialogClose
						render={
							<Button
								variant="ghost"
								size="icon-sm"
								className="-mt-1.5 -mr-1.5"
							/>
						}
					>
						<XIcon className="size-4" />
						<span className="sr-only">Close</span>
					</DialogClose>
				</div>

				<div className="justify-self-center rounded-lg border bg-qr p-4.5 text-qr-foreground">
					<QRCodeSVG
						value={address}
						size={202}
						bgColor="transparent"
						fgColor="currentColor"
						title={`QR code for ${address}`}
					/>
				</div>

				<div className="flex flex-col gap-1">
					<div className="text-12 text-muted-foreground">
						Sui address
					</div>
					<div
						className="font-mono text-14 break-all"
						data-testid="receive-address"
					>
						{address}
					</div>
				</div>

				<p className="text-12 text-muted-foreground">
					Anyone can send to this address, no approval
					needed.
				</p>

				<Button
					className="w-full"
					onClick={() => copy(address)}
					data-testid="receive-copy"
				>
					{copied ? <Check /> : <Copy />}
					{copied ? 'Address copied' : 'Copy address'}
				</Button>
			</DialogContent>
		</Dialog>
	);
}
