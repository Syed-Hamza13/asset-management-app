import express from 'express';
import session from 'express-session';
import MySQLStoreFactory from 'express-mysql-session';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { env } from './config/env.js';
import { pool } from './config/db.js';
import { csrfProtection } from './middleware/csrf.js';
import { errorHandler, notFound } from './middleware/errorHandler.js';
import { requireAuth } from './middleware/auth.js';
import { loginRateLimit } from './middleware/rateLimit.js';
import { setupStatus, setupAdmin } from './modules/setup/controller.js';
import { login, logout, me, csrf, updatePassword } from './modules/auth/controller.js';
import apiRouter from './routes.js';
import { get as getBranding, update as updateBranding } from './modules/branding/controller.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const frontendDist = path.resolve(__dirname, '../../client/dist');

const app = express();
const MySQLStore = MySQLStoreFactory(session);
const sessionStore = new MySQLStore({ clearExpired: true, checkExpirationInterval: 15 * 60 * 1000, expiration: env.SESSION_MAX_AGE_MS }, pool);
const isSecureSession = /^https:/i.test(env.FRONTEND_URL);
const frontendUrl = new URL(env.FRONTEND_URL);
const isLocalBrowserOrigin = frontendUrl.hostname === 'localhost' || frontendUrl.hostname === '127.0.0.1';
const enableSecureBrowserHeaders = isSecureSession || isLocalBrowserOrigin;

app.set('trust proxy', 1);
app.use(
  helmet({
    crossOriginOpenerPolicy: enableSecureBrowserHeaders
      ? { policy: 'same-origin' }
      : false,

    originAgentCluster: enableSecureBrowserHeaders,

    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        baseUri: ["'self'"],

        connectSrc: [
          "'self'",
          'https://challenges.cloudflare.com',
          'https://*.cloudflare.com',
        ],

        frameSrc: [
          "'self'",
          'https://challenges.cloudflare.com',
          'https://*.cloudflare.com',
        ],

        imgSrc: [
          "'self'",
          'data:',
          'https:',
        ],

        objectSrc: ["'none'"],

        scriptSrc: [
          "'self'",
          'https://challenges.cloudflare.com',
          'https://*.cloudflare.com',
        ],

        scriptSrcElem: [
          "'self'",
          'https://challenges.cloudflare.com',
          'https://*.cloudflare.com',
        ],

        styleSrc: [
          "'self'",
          "'unsafe-inline'",
        ],

        workerSrc: [
          "'self'",
          'blob:',
        ],

        formAction: ["'self'"],

        // IMPORTANT:
        // Do not upgrade HTTP LAN resources to HTTPS.
        upgradeInsecureRequests: null,
      },
    },
  })
);
app.use(cors({ origin: env.NODE_ENV === 'development' ? true : env.FRONTEND_URL, credentials: true }));
app.use(express.json({ limit: '6mb' }));
app.use(cookieParser());
app.use(session({
  name: 'sid',
  secret: env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  store: sessionStore,
  cookie: {
    httpOnly: true,
    secure: isSecureSession,
    sameSite: 'lax',
    maxAge: env.SESSION_MAX_AGE_MS,
  }
}));
app.use(csrfProtection);

app.get('/health', (_req, res) => res.json({ success: true, data: { status: 'ok' } }));
app.get('/api/v1/setup/status', setupStatus);
app.post('/api/v1/setup', setupAdmin);
app.post('/api/v1/auth/login', loginRateLimit, login);
app.post('/api/v1/auth/logout', requireAuth, logout);
app.get('/api/v1/auth/me', requireAuth, me);
app.get('/api/v1/auth/csrf', requireAuth, csrf);
app.post('/api/v1/auth/change-password', requireAuth, updatePassword);
app.get('/api/v1/branding', requireAuth, getBranding);
app.put('/api/v1/branding', requireAuth, updateBranding);

app.use('/api/v1', apiRouter);

app.use(express.static(frontendDist));

app.get('/{*splat}', (_req, res) => {
  res.sendFile(path.join(frontendDist, 'index.html'));
});

app.use(notFound);
app.use(errorHandler);

export default app;
