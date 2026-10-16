// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

/**
 * Checks that components stay on the design tokens defined in
 * `src/index.css` instead of reaching for raw colours or ad-hoc text
 * sizes. Run with `bun run lint:design` (part of `bun run lint`).
 *
 * Errors fail the run:
 * - hex colours and colour functions (rgb, hsl, oklch, color-mix)
 * - Tailwind palette shades such as `bg-blue-500` or `text-gray-400`
 * - arbitrary text sizes such as `text-[13px]`
 *
 * The default Tailwind text scale (`text-sm`, `text-lg`, ...) is reported
 * per file as legacy usage but does not fail: the pixel scale (`text-13`)
 * replaces it screen by screen. Pass `--verbose` to list the files and
 * `--strict` to fail on them too.
 *
 * A line ending in `// design-tokens-ignore` is skipped.
 */

import {
	readdirSync,
	readFileSync,
	statSync,
} from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = new URL('../src/', import.meta.url).pathname;
const STRICT = process.argv.includes('--strict');
const VERBOSE =
	STRICT || process.argv.includes('--verbose');
const IGNORE_MARK = 'design-tokens-ignore';

const SKIP_FILES = [
	/\.test\.tsx?$/,
	/\.spec\.tsx?$/,
	/vite-env\.d\.ts$/,
];

const COLOR_UTILITIES =
	'(?:bg|text|border|ring|outline|fill|stroke|from|via|to|shadow|divide|decoration|accent|caret|placeholder)';
const HUES =
	'(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)';

type Rule = { pattern: RegExp; message: string };

const ERRORS: Rule[] = [
	{
		pattern: /(?<![\w&])#[0-9a-fA-F]{3,8}\b/,
		message:
			'hex colour; add a token to src/index.css and use its class',
	},
	{
		pattern: /\b(?:rgba?|hsla?|oklch|color-mix)\(/,
		message:
			'colour function; colours live in src/index.css as tokens',
	},
	{
		pattern: new RegExp(
			`(?<![\\w-])(?:[\\w-]+:)*${COLOR_UTILITIES}-${HUES}-\\d{2,3}\\b`,
		),
		message:
			'Tailwind palette shade; use a semantic token class instead',
	},
	{
		pattern:
			/(?<![\w-])(?:[\w-]+:)*text-\[\d*\.?\d+(?:px|rem|em)\]/,
		message:
			'arbitrary text size; use the pixel scale (text-13, text-16, ...) or add a step in src/index.css',
	},
];

const LEGACY_TEXT_SCALE =
	/(?<![\w-])(?:[\w-]+:)*text-(?:xs|sm|base|lg|xl|[2-9]xl)\b/g;

function walk(dir: string, out: string[] = []) {
	for (const name of readdirSync(dir)) {
		const path = join(dir, name);
		if (statSync(path).isDirectory()) walk(path, out);
		else if (
			/\.tsx?$/.test(name) &&
			!SKIP_FILES.some((re) => re.test(name))
		)
			out.push(path);
	}
	return out;
}

let errorCount = 0;
const legacy: [string, number][] = [];

for (const file of walk(ROOT).sort()) {
	const rel = relative(process.cwd(), file);
	const lines = readFileSync(file, 'utf8').split('\n');
	let legacyHits = 0;

	lines.forEach((line, i) => {
		if (line.includes(IGNORE_MARK)) return;
		for (const { pattern, message } of ERRORS) {
			const match = line.match(pattern);
			if (match) {
				errorCount++;
				console.error(
					`${rel}:${i + 1}: ${match[0]} — ${message}`,
				);
			}
		}
		legacyHits +=
			line.match(LEGACY_TEXT_SCALE)?.length ?? 0;
	});

	if (legacyHits) legacy.push([rel, legacyHits]);
}

if (legacy.length) {
	const total = legacy.reduce((n, [, hits]) => n + hits, 0);
	const label = STRICT ? 'error' : 'legacy';
	console[STRICT ? 'error' : 'log'](
		`\n${label}: ${total} default text-scale classes (text-sm, text-lg, ...) in ${legacy.length} files still to move onto the pixel scale${VERBOSE ? ':' : ' (--verbose lists them).'}`,
	);
	if (VERBOSE)
		for (const [file, hits] of legacy)
			console[STRICT ? 'error' : 'log'](
				`  ${file} (${hits})`,
			);
	if (STRICT) errorCount += total;
}

if (errorCount) {
	console.error(`\n${errorCount} design token problem(s).`);
	process.exit(1);
}
console.log('Design tokens OK.');
