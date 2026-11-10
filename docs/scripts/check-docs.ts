// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import {
	existsSync,
	readdirSync,
	readFileSync,
	statSync,
} from 'node:fs';
import path from 'node:path';
import { remarkHeading } from 'fumadocs-core/mdx-plugins/remark-heading';
import type { Root } from 'mdast';
import remarkFrontmatter from 'remark-frontmatter';
import remarkMdx from 'remark-mdx';
import remarkParse from 'remark-parse';
import { unified } from 'unified';
import { visit } from 'unist-util-visit';
import { parse as parseYaml } from 'yaml';

// An optional argument points the check at another content directory.
const contentDir = path.resolve(
	process.argv[2] ??
		path.join(import.meta.dirname, '../content'),
);

const parser = unified()
	.use(remarkParse)
	.use(remarkFrontmatter)
	.use(remarkMdx)
	.use(remarkHeading, { generateToc: false });

type Link = { href: string; line: number };
type Page = {
	file: string;
	url: string;
	slugs: Set<string>;
	links: Link[];
};

const errors: string[] = [];
function report(
	file: string,
	line: number,
	message: string,
) {
	errors.push(
		`${path.relative(process.cwd(), file)}:${line}: ${message}`,
	);
}

function walk(dir: string): string[] {
	return readdirSync(dir).flatMap((name) => {
		const full = path.join(dir, name);
		return statSync(full).isDirectory()
			? walk(full)
			: [full];
	});
}

function pageUrl(file: string): string {
	const segments = path
		.relative(contentDir, file)
		.replace(/\.mdx$/, '')
		.split(path.sep);
	if (segments.at(-1) === 'index') segments.pop();
	return '/' + segments.join('/');
}

function readPage(file: string): Page {
	const tree = parser.runSync(
		parser.parse(readFileSync(file, 'utf8')),
	) as Root;
	const yaml = tree.children.find(
		(node) => node.type === 'yaml',
	);
	const frontmatter =
		(yaml ? parseYaml(yaml.value) : null) ?? {};
	for (const key of ['title', 'description']) {
		const value = frontmatter[key];
		if (typeof value !== 'string' || value.trim() === '') {
			report(
				file,
				1,
				`frontmatter needs a non-empty "${key}"`,
			);
		}
	}

	const slugs = new Set<string>();
	const links: Link[] = [];
	visit(tree, (node) => {
		const line = node.position?.start.line ?? 1;
		if (node.type === 'heading') {
			const { id } = node.data?.hProperties ?? {};
			if (typeof id === 'string') slugs.add(id);
		} else if (
			node.type === 'link' ||
			node.type === 'definition'
		) {
			links.push({ href: node.url, line });
		} else if (
			node.type === 'mdxJsxFlowElement' ||
			node.type === 'mdxJsxTextElement'
		) {
			for (const attr of node.attributes) {
				if (
					attr.type === 'mdxJsxAttribute' &&
					attr.name === 'href' &&
					typeof attr.value === 'string'
				) {
					links.push({ href: attr.value, line });
				}
			}
		}
	});
	return { file, url: pageUrl(file), slugs, links };
}

// A folder has pages if it holds one or lists a subfolder that does.
function hasPages(dir: string): boolean {
	const names = readdirSync(dir);
	if (names.some((name) => name.endsWith('.mdx')))
		return true;
	const metaFile = path.join(dir, 'meta.json');
	const pages: string[] = existsSync(metaFile)
		? (JSON.parse(readFileSync(metaFile, 'utf8')).pages ??
			[])
		: names;
	return pages.some((entry) => {
		const sub = path.join(
			dir,
			entry.replace(/^\.\.\./, ''),
		);
		return (
			existsSync(sub) &&
			statSync(sub).isDirectory() &&
			hasPages(sub)
		);
	});
}

function checkMeta(dir: string, entries: string[]) {
	const metaFile = path.join(dir, 'meta.json');
	let raw: string;
	try {
		raw = readFileSync(metaFile, 'utf8');
	} catch {
		if (entries.some((name) => name.endsWith('.mdx'))) {
			report(dir, 1, 'folder has pages but no meta.json');
		}
		return;
	}
	const meta = JSON.parse(raw) as {
		pages?: string[];
		root?: boolean;
	};
	const lineOf = (entry: string) =>
		raw
			.slice(0, raw.indexOf(JSON.stringify(entry)))
			.split('\n').length;
	const listed = new Set<string>();
	let hasRest = false;
	for (const entry of meta.pages ?? []) {
		if (/^---.*---$/.test(entry)) continue;
		const url =
			/^(?:external:)?(?:\[[^\]]+])?\[[^\]]+]\(([^)]+)\)$/.exec(
				entry,
			)?.[1];
		if (url !== undefined) {
			const folder: Page = {
				file: metaFile,
				url: pageUrl(path.join(dir, 'index.mdx')),
				slugs: new Set(),
				links: [],
			};
			checkLink(folder, url, lineOf(entry));
			continue;
		}
		if (entry === '...' || entry === 'z...a') {
			hasRest = true;
			report(
				metaFile,
				lineOf(entry),
				`"${entry}" is not allowed; list pages explicitly`,
			);
			continue;
		}
		const name = entry.replace(/^(\.\.\.|!)/, '');
		const target = path.join(dir, name);
		const exists =
			existsSync(`${target}.mdx`) ||
			(existsSync(target) &&
				statSync(target).isDirectory());
		if (!exists) {
			report(
				metaFile,
				lineOf(entry),
				`"${entry}" does not exist`,
			);
		} else if (
			!entry.startsWith('!') &&
			!existsSync(`${target}.mdx`) &&
			!hasPages(target)
		) {
			report(
				metaFile,
				lineOf(entry),
				`"${entry}" has no pages`,
			);
		}
		if (!entry.startsWith('!')) listed.add(name);
	}
	if (hasRest) return;
	// index.mdx is the folder page, except at the content root or a root: true folder.
	const isSubfolder = dir !== contentDir && !meta.root;
	for (const file of entries) {
		if (
			listed.has(file.replace(/\.mdx$/, '')) ||
			(isSubfolder && file === 'index.mdx')
		) {
			continue;
		}
		report(
			path.join(dir, file),
			1,
			`not listed in "pages" of ${path.relative(process.cwd(), metaFile)}`,
		);
	}
}

const files = walk(contentDir);
for (const file of files.filter((f) => f.endsWith('.md'))) {
	report(file, 1, 'pages must be .mdx');
}
const pages = files
	.filter((file) => file.endsWith('.mdx'))
	.map(readPage);
const byUrl = new Map(
	pages.map((page) => [page.url, page]),
);
const byFile = new Map(
	pages.map((page) => [page.file, page]),
);

// Folders with a meta.json or pages, at any depth.
const dirs = new Set(
	files
		.filter((f) => /\.mdx$|(^|\/)meta\.json$/.test(f))
		.flatMap((file) =>
			path
				.relative(contentDir, path.dirname(file))
				.split(path.sep)
				.map((_, i, segments) =>
					path.join(
						contentDir,
						...segments.slice(0, i + 1),
					),
				),
		),
);
for (const dir of dirs) {
	checkMeta(
		dir,
		readdirSync(dir).filter(
			(name) =>
				name.endsWith('.mdx') ||
				dirs.has(path.join(dir, name)),
		),
	);
}

function resolve(
	page: Page,
	target: string,
): Page | undefined {
	if (target === '') return page;
	if (target.startsWith('/')) {
		return byUrl.get(target.replace(/(.)\/$/, '$1'));
	}
	// File paths resolve from the folder, as Fumadocs' relative links do.
	if (target.endsWith('.mdx')) {
		return byFile.get(
			path.resolve(path.dirname(page.file), target),
		);
	}
	const { pathname } = new URL(
		target,
		`http://site${page.url}`,
	);
	return byUrl.get(pathname.replace(/(.)\/$/, '$1'));
}

function checkLink(page: Page, href: string, line: number) {
	if (/^([a-z][a-z\d+.-]*:|\/\/)/i.test(href)) return;
	const [target, anchor] = href.split('#', 2);
	const linked = resolve(page, decodeURI(target));
	if (!linked) {
		report(page.file, line, `link "${href}" has no page`);
	} else if (
		anchor &&
		!linked.slugs.has(decodeURI(anchor))
	) {
		report(
			page.file,
			line,
			`link "${href}" has no heading "#${anchor}" on ${linked.url}`,
		);
	}
}

for (const page of pages) {
	for (const { href, line } of page.links) {
		checkLink(page, href, line);
	}
}

if (errors.length > 0) {
	process.stderr.write(errors.join('\n') + '\n');
	process.exit(1);
}
process.stdout.write(
	`Checked ${pages.length} pages in ${contentDir}\n`,
);
