import { env } from '../../config/env.js';

export async function verifyTurnstile(token, remoteip) {
  if (env.NODE_ENV !== 'production') return true;
  if (!env.TURNSTILE_SECRET_KEY) {
    console.error('Turnstile verification failed: TURNSTILE_SECRET_KEY is missing.');
    return false;
  }

  const body = new URLSearchParams({ secret: env.TURNSTILE_SECRET_KEY, response: token });
  if (remoteip) body.set('remoteip', remoteip);

  const response = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });

  if (!response.ok) {
    console.error('Turnstile verification failed: HTTP', response.status);
    return false;
  }

  const result = await response.json();
  if (!result.success) {
    console.error('Turnstile verification failed:', result['error-codes'] || 'unknown reason');
    return false;
  }

  return true;
}
