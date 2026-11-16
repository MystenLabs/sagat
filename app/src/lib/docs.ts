// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

export const DOCS_URL = 'https://docs.suipods.io';

/** A docs page's URL from its path, like `/guide/wallets#connect-a-wallet`. */
export function docsUrl(path: string): string {
	return `${DOCS_URL}${path}`;
}
