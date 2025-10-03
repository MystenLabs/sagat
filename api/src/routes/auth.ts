import { Hono } from 'hono';
import { Context } from 'hono';
import {
  connectToPublicKey,
  disconnect,
  authMiddleware,
  AuthEnv,
  connectForScript,
} from '../services/auth.service';
import { SIGNATURE_FLAG_TO_SCHEME } from '@mysten/sui/cryptography';

const authRouter = new Hono();

authRouter.post('/script-connect', connectForScript);
authRouter.post('/connect', connectToPublicKey);
authRouter.post('/disconnect', disconnect);

// Check auth status - uses middleware and returns user info if authenticated
authRouter.get('/check', authMiddleware, async (c: Context<AuthEnv>) => {
  const publicKeys = c.get('publicKeys');

  const addresses = publicKeys.map((pk) => {
    return {
      address: pk.toSuiAddress(),
      schema: SIGNATURE_FLAG_TO_SCHEME[pk.flag() as keyof typeof SIGNATURE_FLAG_TO_SCHEME],
      publicKey: pk.toBase64(),
    };
  });

  return c.json({
    authenticated: true,
    addresses,
  });
});

export default authRouter;
