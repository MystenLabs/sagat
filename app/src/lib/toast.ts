// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import {
	toast as sonner,
	type ExternalToast,
} from 'sonner';

/** An underlined link at the end of the toast: a URL opens in a new tab. */
export type ToastLink = {
	label: string;
	href?: string;
	onClick?: () => void;
};

type Options = Omit<ExternalToast, 'action'> & {
	link?: ToastLink;
};

function withLink({
	link,
	...rest
}: Options = {}): ExternalToast {
	if (!link) return rest;
	return {
		...rest,
		action: {
			label: link.label,
			onClick: () => {
				if (link.href)
					window.open(link.href, '_blank', 'noopener');
				link.onClick?.();
			},
		},
	};
}

/**
 * The app's toast API, wrapping sonner with the behaviour from the designs:
 * success and copy toasts close on their own, error toasts stay until the
 * user closes them. Components import this, never `sonner` directly.
 */
export const toast = {
	success: (message: string, options?: Options) =>
		sonner.success(message, withLink(options)),
	info: (message: string, options?: Options) =>
		sonner.info(message, withLink(options)),
	warning: (message: string, options?: Options) =>
		sonner.warning(message, withLink(options)),
	error: (message: string, options?: Options) =>
		sonner.error(message, {
			duration: Infinity,
			closeButton: true,
			...withLink(options),
		}),
	/** "Address copied" and friends. */
	copied: (what = 'Copied', options?: Options) =>
		sonner.success(what, withLink(options)),
	loading: (message: string, options?: Options) =>
		sonner.loading(message, withLink(options)),
	dismiss: (id?: string | number) => sonner.dismiss(id),
};
