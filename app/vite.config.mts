import path from 'path';
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react-swc';
import tailwindcss from '@tailwindcss/vite';

// https://vitejs.dev/config/
export default defineConfig({
	plugins: [react(), tailwindcss()],
	resolve: {
		alias: {
			'@': path.resolve(__dirname, './src'),
			'@mysten/sagat': path.resolve(
				__dirname,
				'../sdk/src/index.ts',
			),
			'@mysten/sagat-legacy': path.resolve(
				__dirname,
				'../sdk-legacy/src/index.ts',
			),
		},
	},
	test: {
		setupFiles: ['./test/setup.ts'],
	},
});
