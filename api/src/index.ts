import { Hono } from 'hono';
import addressesRouter from './routes/addresses';
import multisigRouter from './routes/multisig';
import { appErrorHandler } from './errors';
import proposalsRouter from './routes/proposals';
import authRouter from './routes/auth';
import {
  SUI_RPC_URL,
  SUPPORTED_NETWORKS,
  CORS_ALLOWED_ORIGINS,
} from './db/env';
import { cors } from 'hono/cors';

const app = new Hono();

console.log(
  `Using RPC URLs: ${SUPPORTED_NETWORKS.map((n) => SUI_RPC_URL[n]).join(', ')}`,
);

app.use(
  '*',
  cors({
    origin: (origin) => {
      // Allow localhost for development
      if (origin.startsWith('http://localhost:')) return origin;
      // Check against allowed origins from environment
      return CORS_ALLOWED_ORIGINS.includes(origin)
        ? origin
        : CORS_ALLOWED_ORIGINS[0];
    },
    allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'Authorization'],
    maxAge: 600,
    credentials: true,
  }),
);
// Health check endpoint
app.get('/health', (c) => {
  return c.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    networks: SUPPORTED_NETWORKS,
    version: '1.0.0',
  });
});

// Root endpoint
app.get('/', (c) => {
  return c.text(
    `Sagat API is up and running on networks: ${SUPPORTED_NETWORKS.join(', ')}`,
  );
});

app.route('/auth', authRouter);
app.route('/addresses', addressesRouter);
app.route('/multisig', multisigRouter);
app.route('/proposals', proposalsRouter);

// Map known errors
app.onError(appErrorHandler);

export default app;
