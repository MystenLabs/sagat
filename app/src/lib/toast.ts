// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import {
	toast as sonner,
	type ExternalToast,
} from 'sonner';

import { content } from '../content';

/** An underlined link at the end of the toast: a URL opens in a new tab. */
export type ToastLink = {
	label: string;
	href: string;
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
			onClick: () =>
				window.open(link.href, '_blank', 'noopener'),
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
	error: (message: string, options?: Options) =>
		sonner.error(message, {
			duration: Infinity,
			closeButton: true,
			// Sticky, so repeats of the same error replace it instead of stacking
			id: message,
			...withLink(options),
		}),
	/** "Address copied" and friends. */
	copied: (
		what: string = content.common.copied,
		options?: Options,
	) => toast.success(what, options),
};
