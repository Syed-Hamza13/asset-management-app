import 'dotenv/config';
import { z } from 'zod';

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  HOST: z.string().default('0.0.0.0'),
  PORT: z.coerce.number().int().positive().default(3000),
  FRONTEND_URL: z.string().url(),
  DB_HOST: z.string().min(1),
  DB_PORT: z.coerce.number().int().positive().default(3306),
  DB_NAME: z.string().min(1),
  DB_USER: z.string().min(1),
  DB_PASSWORD: z.string(),
  SESSION_SECRET: z.string().min(32),
  TURNSTILE_SITE_KEY: z.string().default(''),
  TURNSTILE_SECRET_KEY: z.string().default(''),
  SESSION_MAX_AGE_MS: z.coerce.number().int().positive().default(86_400_000),
  // Phase 4 — email. SMTP_ENCRYPTION_KEY must be 32+ chars when an SMTP
  // password is stored; it is optional at boot so existing deploys still start.
  SMTP_ENCRYPTION_KEY: z.string().default(''),
  EMAIL_WORKER_ENABLED: z.enum(['true', 'false']).default('true'),
  EMAIL_WORKER_INTERVAL_MS: z.coerce.number().int().positive().default(15_000),
  EMAIL_MAX_ATTEMPTS: z.coerce.number().int().positive().default(5),
  // Break-glass for the IP allowlist: set to 'false' and restart if an
  // allowlist mistake ever locks an admin out. Login/quick-entry are gated
  // while this is 'true' (default).
  IP_ACCESS_ENFORCE: z.enum(['true', 'false']).default('true'),
  // Addresses of the reverse proxies that sit in front of this app, e.g.
  // '192.168.1.10,172.17.0.1'. Empty (default) means "nothing is in front of
  // the container", so the allowlist gate reads the TCP socket address. List
  // the proxy machine here when nginx forwards your traffic, otherwise every
  // visitor arrives as the proxy IP and one allowlist entry admits them all.
  IP_ACCESS_TRUSTED_PROXIES: z.string().default('')
});

export const env = schema.parse(process.env);
