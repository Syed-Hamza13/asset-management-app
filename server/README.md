# Server

## Environment
Copy `.env.example` to `.env` and configure MySQL, session secret, and production Turnstile keys.

## Database
The server applies SQL migrations on startup. The configured MySQL database must already exist.

For local development with no Turnstile keys, the app allows a dev-only bypass. Production refuses missing Turnstile secrets.

## Security
- Argon2id password hashing
- MySQL-backed sessions
- HttpOnly/Secure/SameSite session cookie
- Session regeneration after login
- CSRF token in `X-CSRF-Token` for mutations
- Parameterized MySQL queries
- Helmet
- Exact-origin CORS
- Login rate limiting
- Request body limit
- Safe production errors
