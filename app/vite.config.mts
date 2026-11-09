import { readFileSync } from 'fs';
import path from 'path';
import { loadEnv } from 'vite';
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react-swc';
import tailwindcss from '@tailwindcss/vite';

// The nginx response headers, with the CSP enforced and the local stack allowed.
function previewHeaders(env: Record<string, string>) {
	const apiOrigin = new URL(
		env.VITE_API_URL || 'http://localhost:3000',
	).origin;
	const origins = env.VITE_LOCALNET_RPC_URL
		? `${apiOrigin} ${new URL(env.VITE_LOCALNET_RPC_URL).origin}`
		: apiOrigin;
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
			headers[match[1].replace(/-Report-Only$/, '')] =
				match[2].replace('${API_ORIGIN}', origins);
	}
	return headers;
}

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
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
	preview: {
		headers: previewHeaders(
			loadEnv(mode, process.cwd(), 'VITE_'),
		),
	},
	test: {
		setupFiles: ['./test/setup.ts'],
	},
}));
