import type { MultisigMember } from '@mysten/sagat';
import { formatAddress } from '@mysten/sui/utils';

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
						className="flex items-center justify-between p-3 bg-white rounded border"
					>
						<div className="flex-1 min-w-0">
							<div className="flex items-center space-x-2">
								<span className="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded font-mono">
									#{index + 1}
								</span>
								<div className="flex flex-col min-w-0">
									{address && (
										<div className="flex items-center gap-1">
											<span className="text-xs font-mono text-gray-900">
												{formatAddress(address)}
											</span>
											<CopyButton
												value={address}
												size="xs"
											/>
										</div>
									)}
									<span className="text-xs font-mono text-gray-500 break-all">
										{member.publicKey}
									</span>
								</div>
							</div>
							<div className="text-xs text-gray-500 mt-1">
								Weight: {member.weight} •{' '}
								{member.isAccepted ? 'Accepted' : 'Pending'}
							</div>
						</div>
						<div className="flex items-center">
							{member.isAccepted ? (
								<div
									className="bg-green-100 text-green-700 p-1.5 rounded-full"
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
									className="bg-red-100 text-red-700 p-1.5 rounded-full"
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
									className="bg-orange-100 text-orange-600 p-1.5 rounded-full"
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
