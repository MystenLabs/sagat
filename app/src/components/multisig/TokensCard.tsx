// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { ChevronRight } from 'lucide-react';
import { Link } from 'react-router-dom';

import { content } from '@/content';
import { type useAccountAssets } from '@/hooks/useAccountAssets';
import { cn } from '@/lib/utils';

import {
	PricesUpdated,
	TokensTable,
} from '../assets/TokensTable';
import { buttonVariants } from '../ui/button';
import { CardHeading } from '../ui/card';

/**
 * The account's largest holdings on the overview: the tokens table's top
 * rows (SUI first whatever its value, as on the assets page), when prices
 * were fetched, with a refresh, and a link to the assets page.
 */
export function TokensCard({
	address,
	assets,
	onSend,
}: {
	address: string;
	assets: ReturnType<typeof useAccountAssets>;
	onSend: (coinType: string) => void;
}) {
	return (
		<section
			className="flex min-w-0 flex-col gap-3"
			aria-labelledby="tokens-title"
			data-testid="tokens"
		>
			<CardHeading
				id="tokens-title"
				title={content.assets.tokens.title}
			>
				<div className="ml-auto flex items-center gap-4">
					<PricesUpdated assets={assets} />
					<Link
						to={`/multisig/${address}/assets`}
						className={cn(
							buttonVariants({
								variant: 'ghost',
								size: 'sm',
							}),
							'-mr-2.5 gap-1 text-foreground-secondary',
						)}
						data-testid="view-all-assets"
					>
						{content.overview.tokens.viewAll}
						<ChevronRight className="size-3" />
					</Link>
				</div>
			</CardHeading>
			<TokensTable
				assets={assets}
				variant="overview"
				onSend={onSend}
				testId="tokens"
			/>
		</section>
	);
}
