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
  SESSION_MAX_AGE_MS: z.coerce.number().int().positive().default(86_400_000)
});

export const env = schema.parse(process.env);
