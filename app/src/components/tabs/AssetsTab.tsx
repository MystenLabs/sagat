// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { ArrowDownToLine, Coins } from 'lucide-react';
import { useState } from 'react';
import {
	useNavigate,
	useOutletContext,
	useSearchParams,
} from 'react-router-dom';

import { content } from '@/content';
import { useNetwork } from '@/contexts/NetworkContext';
import { useAccountAssets } from '@/hooks/useAccountAssets';
import { useOwnedObjects } from '@/hooks/useOwnedObjects';
import { accountName } from '@/lib/account-name';
import { newProposalPath } from '@/lib/new-proposal';
import { FIRST_PAGE } from '@/lib/owned-objects';
import { type MultisigWithMembersForPublicKey } from '@/lib/types';
import { getExplorerUrl } from '@/lib/utils';

import { ObjectsCard } from '../assets/ObjectsCard';
import {
	PricesUpdated,
	TokensTable,
} from '../assets/TokensTable';
import { AccountValue } from '../multisig/AccountValue';
import { ReceiveDialog } from '../shell/ReceiveDialog';
import { Button } from '../ui/button';
import { cardClass, CardHeading } from '../ui/card';
import { EmptyState } from '../ui/empty-state';
import { Tabs } from '../ui/tabs';

const COPY = content.assets;

interface AssetsTabContext {
	multisig: MultisigWithMembersForPublicKey;
}

type AssetsView = 'tokens' | 'objects';

/** The search param that opens the objects, `?view=objects`. */
const VIEW_PARAM = 'view';

/**
 * What the account holds: its value with Explorer, Receive and Send, then
 * its tokens or its other objects. An account with neither shows one
 * empty card that offers Receive.
 */
export function AssetsTab() {
	const { multisig } = useOutletContext<AssetsTabContext>();
	const { address } = multisig;
	const navigate = useNavigate();
	const { network } = useNetwork();
	const [searchParams, setSearchParams] = useSearchParams();
	const view: AssetsView =
		searchParams.get(VIEW_PARAM) === 'objects'
			? 'objects'
			: 'tokens';
	const [receiveOpen, setReceiveOpen] = useState(false);

	// Every page and every row's display data, so the total and the split
	// into verified and unverified tokens are complete.
	const assets = useAccountAssets(address, {
		allPages: true,
		displayCount: Infinity,
	});
	// The objects' first page, shared with the objects tab, says whether
	// the account holds anything at all. A first page without rows can
	// still have more after it, so only one with nothing left counts.
	const firstObjects = useOwnedObjects(
		address,
		{ kind: 'all' },
		FIRST_PAGE,
	);
	const empty =
		!assets.isLoading &&
		!assets.isError &&
		assets.balances.length === 0 &&
		firstObjects.data?.rows.length === 0 &&
		firstObjects.data.next === null;

	// The heading counts verified tokens once the split is final.
	const verifiedCount =
		assets.isLoading ||
		assets.isError ||
		!assets.verifiedKnown
			? undefined
			: assets.balances.filter((b) =>
					assets.isVerified(b.coinType),
				).length;

	const name = accountName(multisig);
	const send = (coinType?: string) =>
		navigate(
			newProposalPath(address, {
				type: 'transfer',
				coinType,
			}),
		);

	return (
		<div className="@container flex flex-col gap-6">
			<AccountValue
				address={address}
				name={name}
				value={assets.value}
				pricesAvailable={assets.pricesAvailable}
				pricesError={assets.pricesError}
				isLoading={assets.isLoading}
				isError={assets.isError}
				onSend={() => send()}
				explorerUrl={getExplorerUrl(
					address,
					network,
					'account',
				)}
				showActions={!empty}
				testIdPrefix="assets"
			/>

			{empty ? (
				<EmptyState
					icon={Coins}
					title={COPY.empty.title}
					description={COPY.empty.description}
					action={
						<Button
							onClick={() => setReceiveOpen(true)}
							data-testid="assets-empty-receive-button"
						>
							<ArrowDownToLine />
							{content.common.actions.receive}
						</Button>
					}
					className="min-h-120 justify-center"
					testId="assets-empty"
				/>
			) : (
				<>
					<Tabs
						tabs={[
							{ id: 'tokens', label: COPY.tabs.tokens },
							{ id: 'objects', label: COPY.tabs.objects },
						]}
						activeTab={view}
						onTabChange={(id) =>
							setSearchParams(
								id === 'objects'
									? { [VIEW_PARAM]: 'objects' }
									: {},
								{ replace: true },
							)
						}
						variant="pills"
						testId="assets-tab"
					/>
					{view === 'tokens' ? (
						<section
							className={cardClass}
							aria-labelledby="assets-tokens-title"
							data-testid="assets-tokens"
						>
							<CardHeading
								id="assets-tokens-title"
								title={COPY.tokens.title}
								count={verifiedCount}
							>
								<div className="ml-auto">
									<PricesUpdated assets={assets} />
								</div>
							</CardHeading>
							<TokensTable
								assets={assets}
								variant="assets"
								onSend={send}
								testId="assets-tokens"
							/>
						</section>
					) : (
						<ObjectsCard address={address} />
					)}
				</>
			)}

			<ReceiveDialog
				open={receiveOpen}
				onClose={() => setReceiveOpen(false)}
				address={address}
				name={name}
			/>
		</div>
	);
}
