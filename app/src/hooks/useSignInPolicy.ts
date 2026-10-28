// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { useLocation } from 'react-router-dom';

import { getAuthLevel } from '@/lib/auth-level';

// Pages that need an API session sign the wallet in on connect; tools
// pages and shared proposal links only connect.
export function useSignInPolicy(): boolean {
	return getAuthLevel(useLocation().pathname) === 'full';
}
