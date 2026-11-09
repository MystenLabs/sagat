import { readFileSync } from 'fs';
import path from 'path';
import { loadEnv } from 'vite';
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react-swc';
import tailwindcss from '@tailwindcss/vite';

import { apiOrigin } from './scripts/api-origin';

// The nginx response headers, with the local stack allowed.
function previewHeaders(env: Record<string, string>) {
	const api = apiOrigin(
		env.VITE_API_URL || 'http://localhost:3000',
	);
	const origins = env.VITE_LOCALNET_RPC_URL
		? `${api} ${new URL(env.VITE_LOCALNET_RPC_URL).origin}`
		: api;
	const template = readFileSync(
		path.resolve(__dirname, 'nginx/headers.conf.template'),
		'utf8',
	);
	const headers: Record<string, string> = {};
	for (const line of template.split('\n')) {
		const match = line.match(
			/^add_header (\S+) "(.*)" always;$/,
		);
		if (match)
			headers[match[1]] = match[2].replace(
				'${API_ORIGIN}',
				origins,
			);
	}
	if (!headers['Content-Security-Policy'])
		throw new Error(
			'No Content-Security-Policy in headers.conf.template',
		);
	return headers;
}

// https://vitejs.dev/config/
export default defineConfig(({ mode, isPreview }) => ({
	plugins: [react(), tailwindcss()],
	resolve: {
		alias: {
			'@': path.resolve(__dirname, './src'),
			'@mysten/sagat': path.resolve(
				__dirname,
				'../sdk/src/index.ts',
			),
		},
	},
	preview: isPreview
		? {
				headers: previewHeaders(
					loadEnv(mode, process.cwd(), 'VITE_'),
				),
			}
		: undefined,
	test: {
		setupFiles: ['./test/setup.ts'],
	},
}));
