import rateLimit from 'express-rate-limit';

export const loginRateLimit = rateLimit({ windowMs: 15 * 60 * 1000, limit: 10, standardHeaders: true, legacyHeaders: false, message: { success: false, error: { code: 'RATE_LIMITED', message: 'Too many login attempts. Please try again later.' } } });
