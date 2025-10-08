import typescript from '@typescript-eslint/eslint-plugin';
import typescriptParser from '@typescript-eslint/parser';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import globals from 'globals';

export default [
	{
		ignores: [
			'dist',
			'node_modules',
			'.vite',
			'build',
			'coverage',
			'.next',
			'storybook-static',
		],
	},
	{
		files: ['**/*.{ts,tsx}'],
		languageOptions: {
			parser: typescriptParser,
			ecmaVersion: 2020,
			sourceType: 'module',
			globals: {
				...globals.browser,
				...globals.node,
			},
			parserOptions: {
				ecmaFeatures: {
					jsx: true,
				},
			},
		},
		plugins: {
			'@typescript-eslint': typescript,
			'react-hooks': reactHooks,
			'react-refresh': reactRefresh,
		},
		rules: {
			...typescript.configs.recommended.rules,
			...reactHooks.configs.recommended.rules,

			// React
			'react-refresh/only-export-components': [
				'warn',
				{ allowConstantExport: true },
			],

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
		},
	},
	// Test files can use any and have relaxed rules
	{
		files: ['**/*.test.{ts,tsx}', '**/*.spec.{ts,tsx}'],
		rules: {
			'@typescript-eslint/no-explicit-any': 'off',
			'no-console': 'off',
		},
	},
];
