// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { useEffect, useRef, useState } from 'react';

import { type FailedLookup } from '@/lib/create-multisig';
import {
	lookupPublicKey,
	MultisigAddressError,
} from '@/lib/onChainLookup';

const DEBOUNCE_MS = 400;

/**
 * Looks up the public key of each address pasted into a key field, once
 * typing settles. A found key goes to `onFound` (which must be stable);
 * the addresses that came back empty are returned. Each address is looked
 * up once per mount; pasting it again reuses the answer.
 */
export function usePublicKeyLookups(
	addresses: string[],
	onFound: (address: string, publicKey: string) => void,
): Record<string, FailedLookup> {
	const [failed, setFailed] = useState<
		Record<string, FailedLookup>
	>({});
	const started = useRef(new Set<string>());
	const found = useRef(new Map<string, string>());
	const pending = [...new Set(addresses)]
		.filter((a) => !(a in failed))
		.sort()
		.join(',');

	useEffect(() => {
		if (!pending) return;
		const timer = setTimeout(() => {
			for (const address of pending.split(',')) {
				const known = found.current.get(address);
				if (known) onFound(address, known);
				if (started.current.has(address)) continue;
				started.current.add(address);
				lookupPublicKey(address).then(
					(publicKey) => {
						if (publicKey) {
							found.current.set(address, publicKey);
							onFound(address, publicKey);
						} else
							setFailed((prev) => ({
								...prev,
								[address]: { kind: 'missing' },
							}));
					},
					(error: unknown) =>
						setFailed((prev) => ({
							...prev,
							[address]:
								error instanceof MultisigAddressError
									? {
											kind: 'error',
											message: error.message,
										}
									: { kind: 'missing' },
						})),
				);
			}
		}, DEBOUNCE_MS);
		return () => clearTimeout(timer);
	}, [pending, onFound]);

	return failed;
}
