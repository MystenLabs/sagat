// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { normalizeSuiAddress } from '@mysten/sui/utils';
import { X } from 'lucide-react';
import { useRef, useState } from 'react';

import { FieldStatus } from '@/components/wizard/parts';
import { useTouched } from '@/components/wizard/use-touched';
import {
	ADDRESS_COPY,
	addressStatus,
} from '@/lib/address-field';

import { useAddProposer } from '../../hooks/useAddProposer';
import { Button, disabledButton } from '../ui/button';
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogTitle,
} from '../ui/dialog';
import {
	InputGroup,
	InputGroupAddon,
	InputGroupButton,
	InputGroupInput,
} from '../ui/input-group';
import { Label } from '../ui/label';
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from '../ui/tooltip';

const STATUS_ID = 'add-proposer-address-status';

/**
 * Asks for the address to add, checks it as it's typed, then signs the
 * addition with the wallet. The field clears whenever the dialog closes;
 * it can't close while the wallet is asked.
 */
export function AddProposerDialog({
	open,
	onOpenChange,
	multisigAddress,
	accountName,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	multisigAddress: string;
	/** What to call the account in the description. */
	accountName: string;
}) {
	// The form is keyed by each opening, so once the dialog has closed
	// (after it animates out) it forgets the field and whether it was used.
	const [opening, setOpening] = useState(0);
	const addProposer = useAddProposer(multisigAddress, {
		onSuccess: () => onOpenChange(false),
	});
	const pending = addProposer.isPending;

	return (
		<Dialog
			open={open}
			onOpenChange={(next) => {
				// Closing mid-sign would reset the request and allow a second one.
				if (!next && !pending) onOpenChange(false);
			}}
			onOpenChangeComplete={(isOpen) => {
				if (!isOpen) setOpening((n) => n + 1);
			}}
		>
			<DialogContent
				showCloseButton={false}
				className="gap-0 p-7 sm:max-w-[460px]"
				data-testid="add-proposer-dialog"
			>
				<DialogTitle className="text-24 font-bold">
					Add external proposer
				</DialogTitle>
				<DialogDescription className="mt-2 text-14 text-muted-foreground">
					This address can create proposals for{' '}
					{accountName}. It can’t sign or execute them.
				</DialogDescription>
				<AddressForm
					key={opening}
					pending={pending}
					onCancel={() => onOpenChange(false)}
					onSubmit={(address) =>
						addProposer.mutate(address)
					}
				/>
			</DialogContent>
		</Dialog>
	);
}

function AddressForm({
	pending,
	onCancel,
	onSubmit,
}: {
	pending: boolean;
	onCancel: () => void;
	onSubmit: (address: string) => void;
}) {
	const [value, setValue] = useState('');
	const { touched, touch, change } = useTouched({
		address: false,
	});
	const inputRef = useRef<HTMLInputElement>(null);
	const status = addressStatus(value);
	const error = touched.address ? status.error : null;

	return (
		<form
			onSubmit={(e) => {
				e.preventDefault();
				if (status.valid && !pending)
					onSubmit(normalizeSuiAddress(value.trim()));
			}}
			className="mt-5 flex flex-col"
		>
			<div className="flex flex-col gap-1.5">
				<Label htmlFor="add-proposer-address">
					Address
				</Label>
				<InputGroup>
					<InputGroupInput
						ref={inputRef}
						id="add-proposer-address"
						value={value}
						onChange={(e) => {
							change('address', value);
							setValue(e.target.value);
						}}
						onBlur={() => touch('address')}
						disabled={pending}
						placeholder="0x…"
						autoComplete="off"
						spellCheck={false}
						aria-invalid={!!error}
						aria-describedby={STATUS_ID}
						className="font-mono md:text-12"
						data-testid="add-proposer-address-input"
					/>
					{value !== '' && (
						<InputGroupAddon align="inline-end">
							<Tooltip>
								<TooltipTrigger
									disabled={pending}
									render={
										<InputGroupButton
											size="icon-xs"
											aria-label="Clear address"
											onClick={() => {
												setValue('');
												inputRef.current?.focus();
											}}
											className="cursor-pointer text-muted-foreground hover:text-foreground"
											data-testid="add-proposer-address-clear"
										/>
									}
								>
									<X className="size-3.5" />
								</TooltipTrigger>
								<TooltipContent>
									Clear address
								</TooltipContent>
							</Tooltip>
						</InputGroupAddon>
					)}
				</InputGroup>
				{status.valid || error ? (
					<FieldStatus
						id={STATUS_ID}
						valid={status.valid}
						state={status.valid ? 'valid' : 'invalid'}
						testId={STATUS_ID}
					>
						{status.valid ? ADDRESS_COPY.valid : error}
					</FieldStatus>
				) : (
					<span id={STATUS_ID} hidden />
				)}
			</div>
			<div className="mt-5 grid grid-cols-2 gap-2">
				<Button
					type="button"
					variant="outline"
					onClick={onCancel}
					disabled={pending}
				>
					Cancel
				</Button>
				<Button
					type="submit"
					disabled={!status.valid || pending}
					className={disabledButton}
				>
					{pending
						? 'Confirm in your wallet…'
						: 'Add proposer'}
				</Button>
			</div>
		</form>
	);
}
