/**
 * Format a Sui address for display
 * @param address - The full address string
 * @returns Formatted address like "0x1234...5678"
 */
export function formatAddress(address: string): string {
	if (!address) return '';
	return `${address.slice(0, 6)}...${address.slice(-4)}`;
}
