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
 * the addresses that came back empty are returned. A found key is kept
 * for the visit; an answer without one is kept only while the address is
 * in a field, so pasting it again retries the lookup.
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

	// An address that came back without a key and has left every field is
	// forgotten, so pasting it again looks it up afresh: a "missing" can
	// hide a source that was down at the time. Adjusted during render
	// rather than in an effect, like the page's threshold clamp.
	const present = new Set(addresses);
	const stale = Object.keys(failed).filter(
		(a) => failed[a].kind !== 'error' && !present.has(a),
	);
	if (stale.length > 0)
		setFailed((prev) => {
			const next = { ...prev };
			for (const a of stale) delete next[a];
			return next;
		});

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
					(result) => {
						if (result.kind === 'found') {
							found.current.set(address, result.publicKey);
							onFound(address, result.publicKey);
							return;
						}
						started.current.delete(address);
						setFailed((prev) => ({
							...prev,
							[address]: { kind: result.kind },
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
