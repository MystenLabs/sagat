import { PersonalMessages } from '@mysten/sagat';
import { PublicKey } from '@mysten/sui/cryptography';
import { Context } from 'hono';
import {
	deleteCookie,
	getCookie,
	setCookie,
} from 'hono/cookie';
import { jwtVerify, SignJWT } from 'jose';

import { LIMITS } from '../constants/limits';
import { JWT_SECRET } from '../db/env';
import { ValidationError } from '../errors';
import {
	getPublicKeyFromSerializedSignature,
	parsePublicKey,
} from '../utils/pubKey';
import {
	registerPublicKeys,
	validatePersonalMessage,
} from './addresses.service';

const JWT_COOKIE_NAME = 'connected-wallet';

const getJwtSecret = () =>
	new TextEncoder().encode(JWT_SECRET);

// Issue a JWT for the user.
const issueJwt = async (
	publicKeys: PublicKey[],
	subject: 'cookie' | 'script',
) => {
	return (
		new SignJWT({
			publicKeys: publicKeys.map((pubKey) =>
				pubKey.toSuiPublicKey(),
			),
		})
			.setSubject(subject)
			.setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
			// It's super long. The data is not extremely confidential so it's fairly safe to prioritize UX.
			// We can always revisit our JWT approach the more we productionize (E.g. introduce a layer of "account" that owns multiple keys)
			.setExpirationTime(
				subject === 'cookie' ? '365d' : '1h',
			)
			.sign(getJwtSecret())
	);
};

export type AuthEnv = {
	Variables: {
		publicKeys: PublicKey[];
	};
};

// Connect to the system for a script, this only grants access to a single
// public key data.
// Script tokens are short-lived (1hr), matching the maximum duration of a signature.
export const connectForScript = async (c: Context) => {
	const { signature, expiry } = await c.req.json();
	validateExpiry(expiry);

	const pubKey =
		getPublicKeyFromSerializedSignature(signature);

	await validatePersonalMessage(
		pubKey,
		signature,
		PersonalMessages.connect(expiry),
	);

	const jwt = await issueJwt([pubKey], 'script');

	return c.json({ token: jwt });
};

// We connect to the system incrementally with each public key we verify.
// This is because the wallet connect might have multiple keys..
export const connectToPublicKey = async (c: Context) => {
	try {
		// Read cookie from client
		const cookie = getCookie(c, JWT_COOKIE_NAME);

		const pubKeys: PublicKey[] = [];
		// If user is already logged in, we check the payload we have.
		// If it's valid, we append to the list of pub keys.
		// Otherwise, we just generate a JWT with the new public key.
		if (cookie) {
			try {
				const publicKeys = await getPublicKeysFromJwt(
					cookie,
					'cookie',
				);
				pubKeys.push(...(publicKeys || []));
			} catch (err) {
				// JWT is invalid or expired, start fresh
			}
		}

		// Only allow up to 10 pub keys per JWT, to control querying depth.
		if (pubKeys.length >= 10) {
			throw new ValidationError(
				'You cannot connect to more than 10 addresses at the same time',
			);
		}

		// Get the public key, signature, and expiry from the request body.
		const { signature, expiry } = await c.req.json();

		// Validate required fields
		if (!signature || !expiry) {
			return c.json(
				{ error: 'Missing required fields' },
				400,
			);
		}

		validateExpiry(expiry);

		const pubKey =
			getPublicKeyFromSerializedSignature(signature);
		await validatePersonalMessage(
			pubKey,
			signature,
			PersonalMessages.connect(expiry),
		);

		// If the public key is not already in the list, we add it.
		if (
			!pubKeys.some(
				(existingKey) =>
					existingKey.toSuiPublicKey() ===
					pubKey.toSuiPublicKey(),
			)
		) {
			pubKeys.push(pubKey);
		}

		// Set the cookie for the connected wallet address with the right expiration.
		setCookie(
			c,
			JWT_COOKIE_NAME,
			await issueJwt(pubKeys, 'cookie'),
			{
				sameSite: 'Lax',
				secure: true,
				httpOnly: true,
				path: '/',
				maxAge: 60 * 60 * 24 * 365, // 365 days
			},
		);

		// Automatically register all addresses for the connected public keys
		await registerPublicKeys(pubKeys);

		return c.json({ success: true });
	} catch (error) {
		return c.json({ error: 'Authentication failed' }, 500);
	}
};

// Middleware to authenticate requests using JWT cookies
export const authMiddleware = async (
	c: Context,
	next: () => Promise<void>,
) => {
	// Check for authorization header.
	const authHeader = c.req.header('Authorization');
	try {
		// If `Authorization` header is set, we are authenticating using this instead of the cookie.
		if (authHeader) {
			const parts = authHeader.split(' ');
			if (parts.length !== 2)
				return c.text('Unauthorized', 401);
			if (parts[0] !== 'Bearer')
				return c.text('Unauthorized', 401);
			// `Authorization: Bearer <jwt>`
			const keys = await getPublicKeysFromJwt(
				parts[1],
				'script',
			);
			if (!keys) return c.text('Unauthorized', 401);
			// We only accept single-key jwt from Authorization.
			if (keys.length !== 1)
				return c.text('Unauthorized', 401);
			c.set('publicKeys', keys);
			return await next();
		}

		// Read cookie from client
		const cookie = getCookie(c, JWT_COOKIE_NAME);

		// If we have no cookie, we're unauthorized.
		if (!cookie) return c.text('Unauthorized', 401);

		const keys = await getPublicKeysFromJwt(
			cookie,
			'cookie',
		);
		if (!keys) return c.text('Unauthorized', 401);

		c.set('publicKeys', keys);
		return await next();
	} catch (err) {
		return c.text('Unauthorized', 401);
	}
};

const getPublicKeysFromJwt = async (
	jwt: string,
	subject: 'cookie' | 'script',
) => {
	const { payload } = await jwtVerify(jwt, getJwtSecret(), {
		subject,
	});

	if (!payload) return null;
	const payloadPublicKeys = payload.publicKeys as string[];
	return payloadPublicKeys.map((pubKey) =>
		parsePublicKey(pubKey),
	);
};

// Validate the expiry time of the signature.
export const validateExpiry = (expiry: string) => {
	const expiryDate = new Date(expiry);
	const now = Date.now();

	if (isNaN(expiryDate.getTime()))
		throw new ValidationError('Invalid expiry date format');

	if (expiryDate.getTime() < now)
		throw new ValidationError('Signature has expired');

	if (
		expiryDate.getTime() >
		now + LIMITS.maxSignatureExpiry
	)
		throw new ValidationError(
			'Signature expiry too far in the future (max 1 hour)',
		);
};

export const disconnect = async (c: Context) => {
	deleteCookie(c, JWT_COOKIE_NAME, {
		path: '/',
		secure: true,
		httpOnly: true,
		sameSite: 'Lax', // Match the cookie setting
	});
	return c.json({ success: true });
};
