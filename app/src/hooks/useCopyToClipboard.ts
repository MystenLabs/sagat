// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { useCallback, useState } from 'react';

import { content } from '@/content';
import { toast } from '@/lib/toast';

import { CONFIG } from '../lib/constants';

/** Pass a null message to skip the toast when the caller shows "Copied". */
export function useCopyToClipboard(
	successMessage: string | null = content.common.states
		.copied,
) {
	const [copied, setCopied] = useState(false);

	const copy = useCallback(
		async (text: string) => {
			try {
				await navigator.clipboard.writeText(text);
				setCopied(true);
				if (successMessage) toast.copied(successMessage);
				setTimeout(
					() => setCopied(false),
					CONFIG.COPY_FEEDBACK_DURATION,
				);
				return true;
			} catch {
				toast.error(content.toasts.copyFailed);
				return false;
			}
		},
		[successMessage],
	);

	return { copied, copy };
}
