// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { rpcRequestDuration } from '../../src/metrics';

// How many times the API has called an RPC method so far (see the
// instrumented client in src/utils/client.ts).
export async function rpcCalls(method: string) {
	const { values } = await rpcRequestDuration.get();
	return (
		values.find(
			(value) =>
				value.metricName ===
					'rpc_request_duration_seconds_count' &&
				value.labels.method === method,
		)?.value ?? 0
	);
}
