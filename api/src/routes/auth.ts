import { Hono } from 'hono';
import { Context } from 'hono';
import {
  connectToPublicKey,
  disconnect,
  authMiddleware,
  AuthEnv,
  connectForScript,
} from '../services/auth.service';

const authRouter = new Hono();

authRouter.post('/script-connect', connectForScript);
authRouter.post('/connect', connectToPublicKey);
authRouter.post('/disconnect', disconnect);

// Check auth status - uses middleware and returns user info if authenticated
authRouter.get('/check', authMiddleware, async (c: Context<AuthEnv>) => {
  const publicKeys = c.get('publicKeys');

  // Convert public keys to addresses
  const addresses = publicKeys.map((pk) => pk.toSuiAddress());
  const publicKeyStrings = publicKeys.map((pk) => pk.toBase64());

  return c.json({
    authenticated: true,
    publicKeys: publicKeyStrings,
    addresses,
  });
});

export default authRouter;
