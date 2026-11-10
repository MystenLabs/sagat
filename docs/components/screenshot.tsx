// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { existsSync } from 'node:fs';
import path from 'node:path';
import {
	ImageZoom,
	type ImageZoomProps,
} from 'fumadocs-ui/components/image-zoom';

// The `-dark` twin of a public image, if it exists at build time.
function darkSource(src: ImageZoomProps['src']) {
	if (typeof src !== 'string' || !src.startsWith('/'))
		return undefined;
	const dark = src.replace(/(\.\w+)$/, '-dark$1');
	return existsSync(
		path.join(process.cwd(), 'public', dark),
	)
		? dark
		: undefined;
}

export function Screenshot(props: ImageZoomProps) {
	const dark = darkSource(props.src);
	if (!dark) return <ImageZoom {...props} />;
	// Lazy, so the display: none twin is never fetched.
	return (
		<>
			<span className="block dark:hidden">
				<ImageZoom {...props} loading="lazy" />
			</span>
			<span className="hidden dark:block">
				<ImageZoom {...props} src={dark} loading="lazy" />
			</span>
		</>
	);
}
