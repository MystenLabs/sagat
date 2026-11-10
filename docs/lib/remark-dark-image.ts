// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { existsSync } from 'node:fs';
import path from 'node:path';
import type { Root } from 'mdast';
import { visit } from 'unist-util-visit';

type EsmNode = {
	type: 'mdxjsEsm';
	data?: {
		estree?: {
			body: {
				type: string;
				source?: { value: unknown };
				specifiers?: { local: { name: string } }[];
			}[];
		};
	};
};

type JsxAttribute = {
	type: string;
	name?: string;
	value?: unknown;
};

type JsxNode = {
	type: 'mdxJsxFlowElement';
	name: string | null;
	attributes: JsxAttribute[];
};

function identifierValue(name: string) {
	return {
		type: 'mdxJsxAttributeValueExpression',
		value: name,
		data: {
			estree: {
				type: 'Program',
				sourceType: 'script',
				body: [
					{
						type: 'ExpressionStatement',
						expression: { type: 'Identifier', name },
					},
				],
			},
		},
	};
}

function esmImport(name: string, source: string) {
	return {
		type: 'mdxjsEsm',
		value: '',
		data: {
			estree: {
				type: 'Program',
				sourceType: 'module',
				body: [
					{
						type: 'ImportDeclaration',
						source: { type: 'Literal', value: source },
						specifiers: [
							{
								type: 'ImportDefaultSpecifier',
								local: { type: 'Identifier', name },
							},
						],
					},
				],
			},
		},
	};
}

// Runs after remarkImage: gives each imported image with a `-dark` twin a `darkSrc` import.
export function remarkDarkImage() {
	return (tree: Root, file: { dirname?: string }) => {
		if (!file.dirname) return;
		const dir = file.dirname;
		const twins = new Map<string, string>();
		const imports: ReturnType<typeof esmImport>[] = [];

		for (const node of tree.children as unknown as EsmNode[]) {
			if (node.type !== 'mdxjsEsm') continue;
			for (const statement of node.data?.estree?.body ??
				[]) {
				const source = statement.source?.value;
				const local = statement.specifiers?.[0]?.local.name;
				if (
					statement.type !== 'ImportDeclaration' ||
					typeof source !== 'string' ||
					!local?.startsWith('__img')
				)
					continue;
				const dark = source.replace(/(\.\w+)$/, '-dark$1');
				if (
					dark === source ||
					!existsSync(path.resolve(dir, dark))
				)
					continue;
				const name = `${local}_dark`;
				twins.set(local, name);
				imports.push(esmImport(name, dark));
			}
		}
		if (twins.size === 0) return;

		visit(tree, (raw) => {
			const node = raw as unknown as JsxNode;
			if (
				node.type !== 'mdxJsxFlowElement' ||
				node.name !== 'img'
			)
				return;
			const src = node.attributes.find(
				(a) => a.name === 'src',
			);
			const value = src?.value as
				{ value?: unknown } | undefined;
			const dark =
				typeof value?.value === 'string' &&
				twins.get(value.value);
			if (!dark) return;
			node.attributes.push({
				type: 'mdxJsxAttribute',
				name: 'darkSrc',
				value: identifierValue(dark),
			});
		});
		tree.children.unshift(
			...(imports as unknown as Root['children']),
		);
	};
}
