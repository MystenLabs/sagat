// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { X } from 'lucide-react';
import { useRef } from 'react';

import {
	InputGroup,
	InputGroupAddon,
	InputGroupButton,
	InputGroupInput,
} from '@/components/ui/input-group';
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from '@/components/ui/tooltip';
import { FieldStatus } from '@/components/wizard/parts';
import { ADDRESS_COPY } from '@/lib/address-field';

/**
 * A Sui address input with a clear button, and under it "Valid Sui
 * address" in green or the caller's error. The caller decides when the
 * error shows; the label stays with the caller too.
 */
export function AddressField({
	id,
	value,
	onChange,
	onBlur,
	disabled,
	placeholder,
	valid,
	error,
}: {
	/** The input's id; the clear button, input and status line derive theirs. */
	id: string;
	value: string;
	onChange: (next: string) => void;
	onBlur: () => void;
	disabled: boolean;
	placeholder: string;
	valid: boolean;
	error: string | null;
}) {
	const inputRef = useRef<HTMLInputElement>(null);
	const statusId = `${id}-status`;

	return (
		<>
			<InputGroup>
				<InputGroupInput
					ref={inputRef}
					id={id}
					value={value}
					onChange={(e) => onChange(e.target.value)}
					onBlur={onBlur}
					disabled={disabled}
					placeholder={placeholder}
					autoComplete="off"
					spellCheck={false}
					aria-invalid={!!error}
					aria-describedby={statusId}
					className="font-mono md:text-12"
					data-testid={`${id}-input`}
				/>
				{value !== '' && (
					<InputGroupAddon align="inline-end">
						<Tooltip>
							<TooltipTrigger
								disabled={disabled}
								render={
									<InputGroupButton
										size="icon-xs"
										aria-label="Clear address"
										onClick={() => {
											onChange('');
											inputRef.current?.focus();
										}}
										className="cursor-pointer text-muted-foreground hover:text-foreground"
										data-testid={`${id}-clear`}
									/>
								}
							>
								<X className="size-3.5" />
							</TooltipTrigger>
							<TooltipContent>Clear address</TooltipContent>
						</Tooltip>
					</InputGroupAddon>
				)}
			</InputGroup>
			{valid || error ? (
				<FieldStatus
					id={statusId}
					valid={valid}
					state={valid ? 'valid' : 'invalid'}
					testId={statusId}
				>
					{valid ? ADDRESS_COPY.valid : error}
				</FieldStatus>
			) : (
				<span id={statusId} hidden />
			)}
		</>
	);
}
