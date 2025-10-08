import { SagatClient } from '@mysten/sagat';

const API_BASE_URL =
	import.meta.env.VITE_API_URL || 'http://localhost:3000';

export const apiClient = new SagatClient(
	API_BASE_URL,
	'cookie',
);
