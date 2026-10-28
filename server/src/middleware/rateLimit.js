import rateLimit from 'express-rate-limit';

export const loginRateLimit = rateLimit({ windowMs: 15 * 60 * 1000, limit: 10, standardHeaders: true, legacyHeaders: false, message: { success: false, error: { code: 'RATE_LIMITED', message: 'Too many login attempts. Please try again later.' } } });

export const emailTestRateLimit = rateLimit({ windowMs: 5 * 60 * 1000, limit: 20, standardHeaders: true, legacyHeaders: false, message: { success: false, error: { code: 'RATE_LIMITED', message: 'Too many email test attempts. Please try again later.' } } });

// Public, unauthenticated quick-entry submit endpoint: keep the per-IP budget tight.
export const quickEntryRateLimit = rateLimit({ windowMs: 15 * 60 * 1000, limit: 5, standardHeaders: true, legacyHeaders: false, message: { success: false, error: { code: 'RATE_LIMITED', message: 'Too many submissions. Please try again later.' } } });
