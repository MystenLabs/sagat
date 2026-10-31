// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { normalizeSuiAddress } from '@mysten/sui/utils';
import { useState } from 'react';

import { AddressField } from '@/components/ui/address-field';
import { useTouched } from '@/components/wizard/use-touched';
import { content } from '@/content';
import { addressStatus } from '@/lib/address-field';

import { useAddProposer } from '../../hooks/useAddProposer';
import { Button, disabledButton } from '../ui/button';
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogTitle,
} from '../ui/dialog';
import { Label } from '../ui/label';

const COPY = content.proposers.addDialog;

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
					{COPY.title}
				</DialogTitle>
				<DialogDescription className="mt-2 text-14 text-muted-foreground">
					{COPY.description(accountName)}
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
	const status = addressStatus(value);
	const error = touched.address ? status.error : null;

	return (
		<form
			onSubmit={(e) => {
				e.preventDefault();
				if (status.valid && !pending)
					onSubmit(normalizeSuiAddress(value.trim()));
			}}
			// The disabled submit button blocks Enter from submitting, so
			// Enter on an invalid address shows why here instead.
			onKeyDown={(e) => {
				if (
					e.key === 'Enter' &&
					e.target instanceof HTMLInputElement &&
					!status.valid
				)
					touch('address');
			}}
			className="mt-5 flex flex-col"
		>
			<div className="flex flex-col gap-1.5">
				<Label htmlFor="add-proposer-address">
					{content.common.fields.address}
				</Label>
				<AddressField
					id="add-proposer-address"
					value={value}
					onChange={(next) => {
						change('address', value);
						setValue(next);
					}}
					onBlur={() => touch('address')}
					disabled={pending}
					placeholder={COPY.addressPlaceholder}
					valid={status.valid}
					error={error}
				/>
			</div>
			<div className="mt-5 grid grid-cols-2 gap-2">
				<Button
					type="button"
					variant="outline"
					onClick={onCancel}
					disabled={pending}
				>
					{content.common.actions.cancel}
				</Button>
				<Button
					type="submit"
					disabled={!status.valid || pending}
					className={disabledButton}
				>
					{pending
						? content.common.states.confirmInWallet
						: COPY.submit}
				</Button>
			</div>
		</form>
	);
}
