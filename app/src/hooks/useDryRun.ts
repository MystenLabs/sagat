import { useSuiClient } from '@mysten/dapp-kit';
import { Transaction } from '@mysten/sui/transactions';
import { useMutation } from '@tanstack/react-query';

export function useDryRun() {
	const client = useSuiClient();

	return useMutation({
		mutationFn: async (transactionData: string) => {
			// Parse and create transaction from JSON
			const tx = Transaction.from(transactionData);

			// Execute dry run
			const result = await client.dryRunTransactionBlock({
				transactionBlock: await tx.build({ client }),
			});

			// Check for errors in the result
			if (result.effects.status.status === 'failure') {
				const errorMsg =
					result.effects.status.error ||
					'Transaction would fail';
				throw new Error(errorMsg);
			}

			return result;
		},
		retry: 2, // Retry up to 2 times (3 total attempts)
		retryDelay: 1000, // Wait 1 second between retries
	});
}
