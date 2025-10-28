import typescript from '@typescript-eslint/eslint-plugin';
import typescriptParser from '@typescript-eslint/parser';
import globals from 'globals';
import header from '@tony.ganchev/eslint-plugin-header';

export default [
	{
		ignores: [
			'**/dist',
			'**/node_modules',
			'**/.vite',
			'**/build',
			'**/coverage',
			'**/.next',
			'**/storybook-static',
			'**/vite-env.d.ts',
			'app/**', // App has its own config with React rules
		],
	},
	{
		files: ['**/*.ts', '**/*.tsx'],
		languageOptions: {
			parser: typescriptParser,
			ecmaVersion: 2020,
			sourceType: 'module',
			globals: {
				...globals.node,
			},
			parserOptions: {
				ecmaFeatures: {
					jsx: true,
				},
			},
		},
		plugins: {
			header: header,
			'@typescript-eslint': typescript,
		},
		rules: {
			...typescript.configs.recommended.rules,

			// TypeScript
			'@typescript-eslint/no-unused-vars': [
				'error',
				{
					argsIgnorePattern: '^_',
					varsIgnorePattern: '^_|^React$',
					vars: 'all',
					args: 'none',
					ignoreRestSiblings: true,
				},
			],
			'@typescript-eslint/no-explicit-any': 'warn',
			'@typescript-eslint/consistent-type-imports': [
				'error',
				{
					prefer: 'type-imports',
					disallowTypeAnnotations: true,
					fixStyle: 'inline-type-imports',
				},
			],

			// General
			'no-unused-vars': 'off',
			'no-console': 'warn',
			'no-case-declarations': 'off',
			'prefer-const': 'error',
			'no-implicit-coercion': [
				'error',
				{ number: true, string: true, boolean: false },
			],
			'header/header': [
				2,
				'line',
				[
					' Copyright (c) Mysten Labs, Inc.',
					' SPDX-License-Identifier: Apache-2.0',
				],
				2,
			],
		},
	},
	// Test files can use any and have relaxed rules
	{
		files: [
			'**/*.test.ts',
			'**/*.test.tsx',
			'**/*.spec.ts',
			'**/*.spec.tsx',
		],
		rules: {
			'@typescript-eslint/no-explicit-any': 'off',
			'no-console': 'off',
		},
	},
];
