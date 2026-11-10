// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import {
	ImageZoom,
	type ImageZoomProps,
} from 'fumadocs-ui/components/image-zoom';

export type ScreenshotProps = ImageZoomProps & {
	darkSrc?: ImageZoomProps['src'];
};

export function Screenshot({
	darkSrc,
	...props
}: ScreenshotProps) {
	if (!darkSrc) return <ImageZoom {...props} />;
	// Lazy, so the display: none twin is never fetched.
	return (
		<>
			<span className="block dark:hidden">
				<ImageZoom {...props} loading="lazy" />
			</span>
			<span className="hidden dark:block">
				<ImageZoom
					{...props}
					src={darkSrc}
					loading="lazy"
				/>
			</span>
		</>
	);
}
