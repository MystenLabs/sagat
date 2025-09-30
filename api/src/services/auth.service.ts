import { Context } from 'hono';

import {
  deleteCookie,
  getCookie,
  getSignedCookie,
  setCookie,
} from 'hono/cookie';
import { JWT_SECRET } from '../db/env';
import { validatePersonalMessage } from './addresses.service';
import { PublicKey } from '@mysten/sui/cryptography';
import { parsePublicKey } from '../utils/pubKey';
import { SignJWT, jwtVerify, JWTPayload } from 'jose';
import { registerPublicKeys } from './addresses.service';
import { ValidationError } from '../errors';

const JWT_COOKIE_NAME = 'connected-wallet';

const getJwtSecret = () => {
  return new TextEncoder().encode(JWT_SECRET);
};

// Issue a JWT for the user.
const issueJwt = async (publicKeys: PublicKey[]) => {
  return (
    new SignJWT({
      publicKeys: publicKeys.map((pubKey) => pubKey.toBase64()),
    })
      .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
      // It's super long. The data is not extremely confidential so it's fairly safe to prioritize UX.
      // We can always revisit our JWT approach the more we productionize (E.g. introduce a layer of "account" that owns multiple keys)
      .setExpirationTime('365d')
      .sign(getJwtSecret())
  );
};

export type AuthEnv = {
  Variables: {
    publicKeys: PublicKey[];
  };
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
        const { payload } = await jwtVerify(cookie, getJwtSecret());

        const payloadPublicKeys = payload.publicKeys as string[];

        for (const pubKey of payloadPublicKeys) {
          pubKeys.push(parsePublicKey(pubKey));
        }
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
    const { publicKey, signature, expiry } = await c.req.json();

    // Validate required fields
    if (!publicKey || !signature || !expiry) {
      return c.json({ error: 'Missing required fields' }, 400);
    }

    // Validate expiry timestamp
    const expiryDate = new Date(expiry);
    const now = Date.now();

    // Check if expiry is a valid date
    if (isNaN(expiryDate.getTime())) {
      return c.json({ error: 'Invalid expiry date format' }, 400);
    }

    // Check if signature has expired
    if (expiryDate.getTime() < now) {
      return c.json({ error: 'Signature has expired' }, 400);
    }

    // Check if expiry is too far in the future (max 1 hour)
    const maxExpiry = now + 60 * 60 * 1000; // 1 hour
    if (expiryDate.getTime() > maxExpiry) {
      return c.json(
        { error: 'Signature expiry too far in the future (max 1 hour)' },
        400,
      );
    }

    const pubKey = await validatePersonalMessage(
      publicKey,
      signature,
      `Verifying address ownership until: ${expiry}`,
    );

    // If the public key is not already in the list, we add it.
    if (
      !pubKeys.some(
        (existingKey) => existingKey.toBase64() === pubKey.toBase64(),
      )
    ) {
      pubKeys.push(pubKey);
    }

    // Set the cookie for the connected wallet address with the right expiration.
    setCookie(c, JWT_COOKIE_NAME, await issueJwt(pubKeys), {
      sameSite: 'Lax',
      secure: true,
      httpOnly: true,
      path: '/',
      maxAge: 60 * 60 * 24 * 365, // 365 days
    });

    // Automatically register all addresses for the connected public keys
    try {
      await registerPublicKeys(pubKeys);
    } catch (error) {
      console.error('Failed to register addresses:', error);
      // Don't fail the connection if address registration fails
    }

    return c.json({ success: true });
  } catch (error) {
    console.error('Auth error:', error);
    return c.json({ error: 'Authentication failed' }, 500);
  }
};

// Middleware to authenticate requests using JWT cookies
export const authMiddleware = async (c: Context, next: () => Promise<void>) => {
  try {
    // Read cookie from client
    const cookie = getCookie(c, JWT_COOKIE_NAME);

    // If we have no cookie, we're unauthorized.
    if (!cookie) return c.text('Unauthorized', 401);

    // Now verify the JWT.
    const { payload } = await jwtVerify(cookie, getJwtSecret());

    // If we have no payload, we're unauthorized.
    if (!payload) return c.text('Unauthorized', 401);

    // Extract the public keys.
    const payloadPublicKeys = payload.publicKeys as string[];

    // Convert the public keys to Sui public keys.
    const availablePublicKeys = [];

    for (const pubKey of payloadPublicKeys) {
      availablePublicKeys.push(parsePublicKey(pubKey));
    }

    // Set the public keys in the context.
    c.set('publicKeys', availablePublicKeys);

    await next();
  } catch (err) {
    return c.text('Unauthorized', 401);
  }
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
