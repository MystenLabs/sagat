// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { asMarkdown, md } from 'fumadocs-core/server';
import type { ReactNode } from 'react';

// Joins each paragraph's authored lines into one, dropping the source indentation.
function reflow(text: string): string {
	return text
		.trim()
		.split(/\n\s*\n/)
		.map((paragraph) =>
			paragraph
				.split('\n')
				.map((line) => line.trim())
				.join(' '),
		)
		.join('\n\n');
}

function Cards({ children }: { children?: ReactNode }) {
	asMarkdown();
	return md`${children}`.then(
		(text) =>
			`\n${text
				.split('\n')
				.map((line) => line.trim())
				.filter(Boolean)
				.join('\n')}\n\n`,
	);
}

function Card({
	title,
	href,
	description,
}: {
	title: string;
	href: string;
	description: string;
}) {
	asMarkdown();
	return `- [${title}](${href}): ${description}\n`;
}

function Callout({
	title,
	children,
}: {
	title?: string;
	children?: ReactNode;
}) {
	asMarkdown();
	return md`${children}`.then((text) => {
		const body = reflow(text);
		return md.linePrefix(
			'> ',
		)`${title ? `**${title}**\n\n${body}` : body}`;
	});
}

export const markdownComponents = { Cards, Card, Callout };
