// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

'use client';

import { RootProvider } from 'fumadocs-ui/provider/next';
import type { ReactNode } from 'react';

import SearchDialog from '@/components/search';

export function Provider({
	children,
}: {
	children: ReactNode;
}) {
	return (
		<RootProvider search={{ SearchDialog }}>
			{children}
		</RootProvider>
	);
}
