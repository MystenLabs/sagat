// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { Pen, RefreshCw, Trash2 } from 'lucide-react';
import { type ReactElement } from 'react';

import { content } from '@/content';

import { MoreActionsTrigger } from '../proposals/ProposalRow';
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuGroup,
	DropdownMenuItem,
	DropdownMenuSeparator,
} from '../ui/dropdown-menu';
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from '../ui/tooltip';

const COPY = content.signers;

/** A signer row's ⋯ menu on Members: Replace, Change weight, Remove. */
export function SignerRowMenu({
	disabled,
	removeBlocked,
	isYou,
	onReplace,
	onChangeWeight,
	onRemove,
}: {
	disabled: boolean;
	/** Why Remove is disabled; shown beside it. */
	removeBlocked: string | null;
	/** The viewer stays, so their own key can't be replaced either. */
	isYou: boolean;
	onReplace: () => void;
	onChangeWeight: () => void;
	onRemove: () => void;
}) {
	return (
		<DropdownMenu>
			<MoreActionsTrigger
				testId="signer-menu"
				disabled={disabled}
			/>
			<DropdownMenuContent align="end" className="w-50">
				<DropdownMenuGroup>
					{blocked(
						isYou ? COPY.cantRemoveYourself : null,
						<DropdownMenuItem
							disabled={isYou}
							onClick={onReplace}
							data-testid="signer-menu-replace"
						>
							<RefreshCw />
							{COPY.replace}
						</DropdownMenuItem>,
					)}
					<DropdownMenuItem
						onClick={onChangeWeight}
						data-testid="signer-menu-weight"
					>
						<Pen />
						{COPY.changeWeight}
					</DropdownMenuItem>
				</DropdownMenuGroup>
				<DropdownMenuSeparator />
				<DropdownMenuGroup>
					{blocked(
						removeBlocked,
						<DropdownMenuItem
							variant="destructive"
							disabled={!!removeBlocked}
							onClick={onRemove}
							data-testid="signer-menu-remove"
						>
							<Trash2 />
							{content.common.actions.remove}
						</DropdownMenuItem>,
					)}
				</DropdownMenuGroup>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}

// A disabled item takes no pointer, so a wrapper holds its reason.
function blocked(
	reason: string | null,
	item: ReactElement,
) {
	return reason ? (
		<Tooltip>
			<TooltipTrigger render={<div />}>
				{item}
			</TooltipTrigger>
			<TooltipContent side="left" className="max-w-55">
				{reason}
			</TooltipContent>
		</Tooltip>
	) : (
		item
	);
}
