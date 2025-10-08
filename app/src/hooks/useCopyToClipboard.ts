import { useCallback, useState } from 'react';
import { toast } from 'sonner';

import { CONFIG } from '../lib/constants';

export function useCopyToClipboard(
	successMessage = 'Copied!',
) {
	const [copied, setCopied] = useState(false);

	const copy = useCallback(
		async (text: string) => {
			try {
				await navigator.clipboard.writeText(text);
				setCopied(true);
				toast.success(successMessage);
				setTimeout(
					() => setCopied(false),
					CONFIG.COPY_FEEDBACK_DURATION,
				);
				return true;
			} catch {
				toast.error('Failed to copy to clipboard');
				return false;
			}
		},
		[successMessage],
	);

	return { copied, copy };
}
