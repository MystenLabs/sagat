// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { clsx, type ClassValue } from 'clsx';
import { extendTailwindMerge } from 'tailwind-merge';

// The design's pixel-named text sizes (see index.css). Without this,
// tailwind-merge reads `text-13` as a colour and drops it whenever a text
// colour appears in the same class list.
const twMerge = extendTailwindMerge({
	extend: {
		classGroups: {
			'font-size': [
				{
					text: [
						'10',
						'11',
						'12',
						'13',
						'14',
						'15',
						'16',
						'24',
						'30',
						'32',
						'40',
					],
				},
			],
		},
	},
});

export function cn(...inputs: ClassValue[]) {
	return twMerge(clsx(inputs));
}

export const getExplorerUrl = (
	digest: string,
	network: string,
) => {
	return `https://suiexplorer.com/txblock/${digest}?network=${network}`;
};
