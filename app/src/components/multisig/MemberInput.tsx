import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
	GripVertical,
	Key,
	Search,
	Trash2,
} from 'lucide-react';
import { useState } from 'react';

import { formatAddress } from '../../lib/formatters';
import { validatePublicKey } from '../../lib/sui-utils';
import type { Member } from '../../lib/validations/multisig';
import { AddressLookupModal } from '../modals/AddressLookupModal';
import { Button } from '../ui/button';
import { Input } from '../ui/input';

interface MemberInputProps {
	member: Member;
	index: number;
	canRemove: boolean;
	onChange: (id: string, updates: Partial<Member>) => void;
	onRemove: (id: string) => void;
}

export function MemberInput({
	member,
	index,
	canRemove,
	onChange,
	onRemove,
}: MemberInputProps) {
	const [showLookup, setShowLookup] = useState(false);

	const {
		attributes,
		listeners,
		setNodeRef,
		transform,
		transition,
		isDragging,
	} = useSortable({
		id: member.id,
	});

	const style = {
		transform: CSS.Transform.toString(transform),
		transition,
		opacity: isDragging ? 0.5 : 1,
	};

	const handlePublicKeyChange = (value: string) => {
		const validation = validatePublicKey(value);

		onChange(member.id, {
			publicKey: value,
			error: validation.isValid
				? undefined
				: validation.error,
		});
	};

	// Get the address for display if public key is valid
	const validation = validatePublicKey(
		member.publicKey || '',
	);
	const correspondingAddress = validation.isValid
		? validation.address
		: null;

	const handlePublicKeySelect = (publicKey: string) => {
		onChange(member.id, { publicKey });
		setShowLookup(false);
	};

	return (
		<div
			ref={setNodeRef}
			style={style}
			className="flex gap-3 items-start p-3 border rounded-lg"
		>
			{/* Drag handle */}
			<div
				{...attributes}
				{...listeners}
				className="flex items-center justify-center w-6 h-6 cursor-grab active:cursor-grabbing shrink-0 mt-1 hover:bg-gray-100 rounded"
			>
				<GripVertical className="w-4 h-4 text-gray-400" />
			</div>

			{/* Member indicator */}
			<div className="flex items-center justify-center w-8 h-8 rounded-full shrink-0 mt-1 bg-blue-100">
				<Key className="w-4 h-4 text-blue-600" />
			</div>

			<div className="flex-1 space-y-2">
				{/* Public Key Input */}
				<div>
					<label className="text-sm text-gray-600">
						Member {index + 1} {member.isCreator && '(You)'}
					</label>
					<div className="flex gap-2">
						<Input
							value={member.publicKey}
							onChange={(e) =>
								handlePublicKeyChange(e.target.value)
							}
							placeholder="Enter base64 public key"
							disabled={member.isCreator}
							className="flex-1"
						/>
						{!member.isCreator && (
							<Button
								type="button"
								variant="outline"
								size="icon"
								onClick={() => setShowLookup(true)}
								title="Look up public key from address"
							>
								<Search className="w-4 h-4" />
							</Button>
						)}
					</div>
					{member.error && (
						<p className="text-sm text-red-500 mt-1">
							{member.error}
						</p>
					)}
					{!member.error &&
						member.publicKey &&
						correspondingAddress && (
							<div className="text-xs text-gray-500 mt-1">
								<p>✓ Valid public key</p>
								<p className="text-gray-400 font-mono">
									Address:{' '}
									{formatAddress(correspondingAddress)}
								</p>
							</div>
						)}
				</div>

				{/* Weight Input */}
				<div className="flex gap-2 items-center">
					<label className="text-sm text-gray-600">
						Weight:
					</label>
					<Input
						type="number"
						value={member.weight}
						onChange={(e) =>
							onChange(member.id, {
								weight: parseInt(e.target.value) || 1,
							})
						}
						className="w-20"
						min={1}
						max={255}
					/>
				</div>
			</div>

			{/* Remove button */}
			{canRemove && !member.isCreator && (
				<Button
					variant="ghost"
					size="icon"
					onClick={() => onRemove(member.id)}
					className="shrink-0 mt-1"
				>
					<Trash2 className="w-4 h-4" />
				</Button>
			)}

			<AddressLookupModal
				isOpen={showLookup}
				onClose={() => setShowLookup(false)}
				onSelectPublicKey={handlePublicKeySelect}
			/>
		</div>
	);
}
