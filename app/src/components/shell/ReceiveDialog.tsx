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
import { content } from '@/content';
import { useCopyToClipboard } from '@/hooks/useCopyToClipboard';

const ACTIONS = content.common.actions;
const COPY = content.receive;

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
	const { copied, copy } = useCopyToClipboard(
		content.toasts.addressCopied,
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
							{COPY.title}
						</DialogTitle>
						<DialogDescription className="text-14 text-muted-foreground">
							{COPY.description(name)}
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
						<span className="sr-only">{ACTIONS.close}</span>
					</DialogClose>
				</div>

				<button
					type="button"
					onClick={() => copy(address)}
					aria-label={ACTIONS.copyAddress}
					className="cursor-pointer justify-self-center rounded-lg border bg-qr p-4 text-qr-foreground outline-none transition-colors hover:border-foreground/30 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
					data-testid="receive-qr"
				>
					<QRCodeSVG
						value={address}
						// 41 modules (33 plus a 4-module quiet zone on each
						// side) at 5px each keeps the tile about 240px.
						size={205}
						marginSize={4}
						bgColor="transparent"
						fgColor="currentColor"
						title={COPY.qrTitle(address)}
					/>
				</button>

				<div className="flex flex-col gap-1">
					<div className="text-12 text-muted-foreground">
						{content.common.fields.suiAddress}
					</div>
					<div
						className="font-mono text-14 break-all"
						data-testid="receive-address"
					>
						{address}
					</div>
				</div>

				<p className="text-12 text-muted-foreground">
					{COPY.note}
				</p>

				<Button
					className="w-full"
					onClick={() => copy(address)}
					data-testid="receive-copy"
				>
					{copied ? <Check /> : <Copy />}
					{ACTIONS.copyAddress}
				</Button>
			</DialogContent>
		</Dialog>
	);
}
