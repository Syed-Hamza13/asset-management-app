# Asset Management Application

A production-ready asset management system for tracking inventory, asset metadata, custom fields, dropdowns, automations, and reporting. The project is built with React + Vite on the frontend, Express + MySQL on the backend, and is designed for both local development and single-container Docker deployment.

## What this project does

- Manage multiple asset types with custom fields and validation
- Create and edit asset records with structured forms
- Support dropdown-driven metadata and dynamic field configuration
- Add business automations for asset lifecycle workflows
- Secure admin login with session-based authentication and CSRF protection
- Multi-user accounts with role-based permissions and strict per-owner data scoping (admin sees everything, ordinary users only see and manage their own records)
- Email notifications: per-user templates, recipients, and rules that fire on asset creation or field changes, delivered through a configurable global SMTP server
- Perform filtered reporting and spreadsheet export for operational analysis
- Support production-ready deployment behind a single Express container

## Tech stack

- Frontend: React, Vite, Tailwind CSS
- Backend: Node.js, Express
- Database: MySQL
- Auth/security: Argon2, express-session, Helmet, CSRF, Cloudflare Turnstile
- Deployment: Docker, Docker Compose

## Project structure

```text
asset-management-app/
├── Dockerfile
├── .dockerignore
├── docker-compose.yml
├── .gitignore
├── README.md
├── package.json
├── client/
│   ├── package.json
│   ├── src/
│   ├── public/
│   └── vite.config.js
├── server/
│   ├── package.json
│   ├── .env.example
│   ├── migrations/
│   └── src/
└── node_modules/
```

## Prerequisites

Before running locally, make sure you have:

- Node.js 18+ or newer
- npm
- MySQL database running locally or on a reachable host
- Docker and Docker Desktop (for container deployment)
- Cloudflare Turnstile keys for production if you want real verification enabled

## Local development setup

### 1) Clone the repository

```bash
git clone <your-repo-url>
cd asset-management-app
```

### 2) Install dependencies

```bash
npm install
npm --prefix client install
npm --prefix server install
```

You can also use:

```bash
npm run install:all
```

### 3) Configure environment variables

Copy the server environment template:

```bash
cp server/.env.example server/.env
```

Then update `server/.env` with your actual values:

```env
NODE_ENV=development
HOST=0.0.0.0
PORT=3000
FRONTEND_URL=http://localhost:5173
DB_HOST=localhost
DB_PORT=3306
DB_NAME=asset_management
DB_USER=asset_app
DB_PASSWORD=change_me
SESSION_SECRET=replace_with_a_long_random_secret
TURNSTILE_SITE_KEY=your_site_key
TURNSTILE_SECRET_KEY=your_secret_key
SESSION_MAX_AGE_MS=86400000

# Email notifications (see "Email notifications & SMTP" below).
SMTP_ENCRYPTION_KEY=replace_with_a_long_random_secret_at_least_32_chars
EMAIL_WORKER_ENABLED=true
EMAIL_WORKER_INTERVAL_MS=15000
EMAIL_MAX_ATTEMPTS=5
```

For frontend build-time Turnstile config in local development, create a `client/.env` file if needed:

```env
VITE_TURNSTILE_SITE_KEY=
```

If no key is set in development, the app intentionally bypasses Turnstile to make local testing easier.

### 4) Create MySQL database

Create a database named `asset_management` (or whatever you set in `DB_NAME`).

Example:

```sql
CREATE DATABASE asset_management;
```

### 5) Run the app locally

From the root project directory:

```bash
npm run dev
```

This starts:

- API on http://localhost:3000
- frontend preview/build on http://localhost:5173

Open the frontend URL in the browser and complete the first-time admin setup if the database is empty.

## Production deployment with Docker

This project is built for a single-container deployment architecture:

- Express serves the React production frontend from the same container
- MySQL runs externally, not inside the same Compose app
- Docker image contains the backend and built frontend bundle together

### 1) Build the Docker image

From the root directory:

```bash
docker build \
  --build-arg VITE_TURNSTILE_SITE_KEY="YOUR_SITE_KEY" \
  -t syedhamza6265/asset-management-app:bookworm-slim .
```

### 2) Configure Compose values

Update `docker-compose.yml` with your real values:

```yaml
services:
  asset-management:
    image: syedhamza6265/asset-management-app:bookworm-slim
    container_name: asset-management-app
    restart: unless-stopped

    ports:
      - "4000:3000"

    environment:
      NODE_ENV: production
      HOST: 0.0.0.0
      PORT: 3000
      FRONTEND_URL: http://localhost:4000

      DB_HOST: your_db_host # eg. localhost
      DB_PORT: 3306
      DB_NAME: your_db_name
      DB_USER: your_db_user
      DB_PASSWORD: your_db_password

      SESSION_SECRET: your_long_random_session_secret
      TURNSTILE_SITE_KEY: your_site_key
      TURNSTILE_SECRET_KEY: your_secret_key
      SESSION_MAX_AGE_MS: 86400000

      SMTP_ENCRYPTION_KEY: replace_with_a_long_random_secret_at_least_32_chars
      EMAIL_WORKER_ENABLED: "true"
      EMAIL_WORKER_INTERVAL_MS: 15000
      EMAIL_MAX_ATTEMPTS: 5
```

### 3) Start the container

```bash
docker compose up -d
```

### 4) Check logs

```bash
docker logs -f asset-management-app
```

### 5) Health check

```bash
curl http://localhost:4000/health
```

Expected response:

```json
{
  "success": true,
  "data": {
    "status": "ok"
  }
}
```


## Production security notes

Before public deployment, make sure:

- you use real Cloudflare Turnstile keys
- the database user is not root
- `SESSION_SECRET` is strong and unique
- HTTPS is enabled in front of the app
- `FRONTEND_URL` matches your real domain or IP
- `.env` files are not committed to GitHub



## Users, roles and permissions

The app supports multiple accounts on top of the initial admin.

- The account created during first-time setup is the **admin**. The admin can view and manage **every** record in the workspace and grants permissions to other users.
- Ordinary users are **private by default**: they can only see and manage asset types, assets, fields, dropdowns, common form, automations, reports and email settings that **they** created. One user can never read another user's records; attempts to access someone else's record return `404` (not `403`) so record existence is not leaked.
- The admin creates users from the **Users** page and assigns each a set of capabilities (for example `assets.create_own`, `reports.export_own`, `email.rules.manage_own`). New users default to an **Assets only** capability set and can be adjusted per user.
- New users must change their temporary password on first login; until they do, they are routed to the Settings page.
- Deactivating a user immediately invalidates their active sessions.

## Email notifications & SMTP

Email delivery is opt-in and requires a SMTP server the admin configures once.

1. **SMTP settings (admin only).** On the Settings page an admin sees an **SMTP** card: host, port, secure (TLS/SSL), username, password, from-email, from-name and an optional reply-to, plus a **Configured / Not configured** badge, a **Test connection** button and a **Send test email** button.
   - The SMTP password is **encrypted at rest** with AES-256-GCM using `SMTP_ENCRYPTION_KEY`, and is **never returned by any API** - the UI only shows whether a password is stored. Treat `SMTP_ENCRYPTION_KEY` as a permanent secret: rotating it makes the previously stored SMTP password unreadable, so re-enter the password after any key change.
2. **Templates, recipients and rules (per user).** Users with the email capabilities create plain-text templates (with placeholders such as `{{asset_type_name}}`, `{{asset_public_id}}`, `{{field.<key>}}`), a list of recipients, and rules that fire when **an asset is created** or a **specific field changes** (conditions: any change, equals, not equals, becomes filled, becomes empty).
3. **Delivery model.** When a rule matches, a row is inserted into the `email_outbox` table inside the **same transaction** as the asset save (transactional outbox) - so saving an asset never fails because email was down, and the user sees an "N notification(s) queued" toast. A background worker inside the same process polls the outbox and sends.
   - The worker uses a **MySQL `GET_LOCK`**, so it is safe to run the container more than once: only one process sends at a time. Set `EMAIL_WORKER_ENABLED=false` to queue without sending. `EMAIL_WORKER_INTERVAL_MS` controls the poll interval and `EMAIL_MAX_ATTEMPTS` bounds retries. Failed sends use exponential backoff; permanent errors (auth, bad address) stop retrying, transient ones (network) retry.
   - Every queued/sent/failed attempt is visible under **Email History** (admins can toggle **All users**).

## Backups & migrations

- **Back up before upgrading.** Take a full `mysqldump` of the database before starting the app on a new version, e.g.
  ```bash
  mysqldump -h <DB_HOST> -P <DB_PORT> -u <DB_USER> -p <DB_NAME> > backup-$(date +%F).sql
  ```
- **Migrations run automatically** at startup, in filename order, from `server/migrations`. They are tracked in the `schema_migrations` table and each one is written to be **idempotent** and to **preserve existing rows** (the multi-user migration assigns all pre-existing records to the existing admin).
- After upgrading, the existing single account continues to work as the admin; no manual data step is required.

## Notes

- The app includes a one-time admin setup flow for first-time installation.
- Production Turnstile verification is enforced only in `NODE_ENV=production`.
- The browser-side React client uses same-origin API calls when deployed behind the Express container, which makes the single-container architecture reliable and simpler to manage.



docker build --build-arg VITE_TURNSTILE_SITE_KEY="0x4AAAAAAEXeYHa6UT7ssNUT" -t syedhamza6265/asset-management-app:bookworm-slim .