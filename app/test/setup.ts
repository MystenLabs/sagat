// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

// The first Intl call in a Node process initialises ICU and faults the
// locale data in from the node binary. On a cold CI runner that is
// disk-bound and has taken over 5s, which lands inside whichever test
// happens to touch Intl first and trips its 5s testTimeout (the
// `formatCoinAmount > zero` test timed out this way). This setup file
// runs before each test file, outside any timed test, so the one-off
// cost is paid here. Both subsystems the suite uses are warmed: number
// formatting (toLocaleString / Intl.NumberFormat) and collation
// (localeCompare).
0n.toLocaleString('en-US');
new Intl.NumberFormat('en-US', {
	style: 'currency',
	currency: 'USD',
}).format(0);
'a'.localeCompare('b');
