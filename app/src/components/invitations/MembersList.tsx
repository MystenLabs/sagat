// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import type { MultisigMember } from '@mysten/sagat';
import { formatAddress } from '@mysten/sui/utils';

import { Label } from '@/components/ui/label';

import { validatePublicKey } from '../../lib/sui-utils';
import { CopyButton } from '../ui/CopyButton';

interface MembersListProps {
	members: MultisigMember[];
}

export function MembersList({ members }: MembersListProps) {
	return (
		<>
			{members.map((member, index) => {
				const { address } = validatePublicKey(
					member.publicKey,
				);

				return (
					<div
						key={member.publicKey}
						className="flex items-center justify-between p-3 bg-card rounded border"
					>
						<div className="flex-1 min-w-0">
							<div className="flex items-center space-x-2">
								<Label variant="info" className="font-mono">
									#{index + 1}
								</Label>
								<div className="flex flex-col min-w-0">
									{address && (
										<div className="flex items-center gap-1">
											<span className="text-xs font-mono text-foreground">
												{formatAddress(address)}
											</span>
											<CopyButton
												value={address}
												size="xs"
											/>
										</div>
									)}
									<span className="text-xs font-mono text-muted-foreground break-all">
										{member.publicKey}
									</span>
								</div>
							</div>
							<div className="text-xs text-muted-foreground mt-1">
								Weight: {member.weight} •{' '}
								{member.isAccepted ? 'Accepted' : 'Pending'}
							</div>
						</div>
						<div className="flex items-center">
							{member.isAccepted ? (
								<div
									className="bg-success text-success-foreground p-1.5 rounded-full"
									title="Member has accepted"
								>
									<svg
										className="w-3 h-3"
										fill="none"
										stroke="currentColor"
										viewBox="0 0 24 24"
									>
										<path
											strokeLinecap="round"
											strokeLinejoin="round"
											strokeWidth={3}
											d="M5 13l4 4L19 7"
										/>
									</svg>
								</div>
							) : member.isRejected ? (
								<div
									className="bg-error text-error-foreground p-1.5 rounded-full"
									title="Member has rejected"
								>
									<svg
										className="w-3 h-3"
										fill="none"
										stroke="currentColor"
										viewBox="0 0 24 24"
									>
										<path
											strokeLinecap="round"
											strokeLinejoin="round"
											strokeWidth={3}
											d="M6 18L18 6M6 6l12 12"
										/>
									</svg>
								</div>
							) : (
								<div
									className="bg-warning text-warning-foreground p-1.5 rounded-full"
									title="Pending acceptance"
								>
									<svg
										className="w-3 h-3"
										fill="none"
										stroke="currentColor"
										viewBox="0 0 24 24"
									>
										<path
											strokeLinecap="round"
											strokeLinejoin="round"
											strokeWidth={2}
											d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
										/>
									</svg>
								</div>
							)}
						</div>
					</div>
				);
			})}
		</>
	);
}
