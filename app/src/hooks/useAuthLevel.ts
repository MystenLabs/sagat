// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { useLocation } from 'react-router-dom';

import {
	getAuthLevel,
	type AuthLevel,
} from '@/lib/auth-level';

// The route's auth level, read where a component needs the sign-in
// policy.
export function useAuthLevel(): AuthLevel {
	return getAuthLevel(useLocation().pathname);
}
