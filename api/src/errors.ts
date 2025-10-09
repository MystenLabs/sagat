import { SuiHTTPTransportError } from '@mysten/sui/client';
import { DrizzleQueryError } from 'drizzle-orm';
import { Context } from 'hono';

export class CommonError extends Error {
	constructor(message: keyof typeof CommonErrors) {
		super();
		this.message = CommonErrors[message];
		this.name = 'CommonError';
	}
}

export class ApiAuthError extends Error {
	constructor(message: keyof typeof AuthErrors) {
		super();
		this.message = AuthErrors[message];
		this.name = 'ApiAuthError';
	}
}

// Generic error for unknown errors
export class ValidationError extends Error {}

export const AuthErrors = {
	NotAMultisigMember:
		'Proposer is either not a member of the multisig, or has not accepted the invitation to the multisig.',
};

export const CommonErrors = {
	InvalidAddress:
		'Invalid address. Must be a valid Sui address.',
	NotFound: 'The request resource was not found.',
	InvalidSignature: 'Invalid signature for message.',
};

// The error handler for the app.
export const appErrorHandler = (err: Error, c: Context) => {
	if (err instanceof ValidationError)
		return c.json({ error: err.message }, 400);

	if (err instanceof ApiAuthError)
		return c.json({ error: err.message }, 403);

	if (err instanceof CommonError)
		return c.json({ error: err.message }, 400);

	if (err instanceof SuiHTTPTransportError)
		return c.json({ error: err.message }, 400);

	if (err instanceof DrizzleQueryError) {
		const msg = err.cause?.message;
		if (msg?.includes('violates unique constraint')) {
			return c.json(
				{ error: 'Data already exists in the database.' },
				400,
			);
		}
	}

	console.error('Unhandled error:', err);
	return c.json({ error: 'Internal Server Error' }, 500);
};
