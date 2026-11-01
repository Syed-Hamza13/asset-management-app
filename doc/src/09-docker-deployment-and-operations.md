---
title: "09 — Docker, Deployment and Operations"
---

# The shape of a deployment

One container runs everything; the database lives outside it.

```
office PC / VPS
├─ Docker: asset-management-app  (Node, one process)
│    ├─ Express API  /api/v1/*
│    ├─ static client  /app/client/dist  (SPA fallback)
│    ├─ migration runner  (runs at boot, then serves)
│    └─ email delivery worker  (in-process, MySQL lock)
└─ MySQL 8  (separate: on the same host, another box, or a managed service)
```

There is no separate web server, no Redis, no queue, no object storage. Images
and branding are stored in the database as data URLs, so nothing on disk needs
persisting — the container is disposable and all state is in MySQL. That is
what makes `docker compose up -d` a complete deploy.

# The image

`Dockerfile`, two stages, both on `node:bookworm-slim`:

| Stage | Steps | Output used later |
| --- | --- | --- |
| `frontend-builder` | copy root + client manifests → `npm ci` → copy `client/` → copy `shared` to `/app/shared` → `ARG VITE_TURNSTILE_SITE_KEY` → `npm run build` | `/app/client/dist` |
| `production` | copy root + server manifests → `npm ci --omit=dev` → copy `server/src`, `server/migrations`, `shared` → copy `dist` from stage 1 → `EXPOSE 8073` → `CMD ["node", "src/server.js"]` | the running image |

Four things in this file are load-bearing:

1. **`COPY shared /app/shared` appears in both stages.** `shared/automationRules.js`
   is imported by the client (`../../../shared/...` from `DynamicForm.jsx`) and
   by the server's automation modules (`../../../../shared/...`). Both relative
   paths resolve only if `shared/` sits next to `/app/client` and `/app/server`.
   Delete either copy and the build breaks.
2. **The Turnstile site key is a build argument.** It is compiled into the JS
   bundle, so changing it means rebuilding the image — no runtime variable will
   do it. If it is empty, the widget cannot render on the sign-in page.
3. **`EXPOSE 8073` is documentation.** `EXPOSE` does not publish anything. The
   port the app listens on is `PORT` from the environment; the host mapping is
   `ports:` in the compose file. All three are kept at 8073 so nobody has to
   remember a mapping.
4. **`npm ci --omit=dev` in the final stage** means nodemon and Playwright are
   not in the image, and `node --test` is not available inside it.

`.dockerignore` keeps the build context small (roughly 22 MB saved) and keeps
secrets out of it: `node_modules`, `client/dist`, `.git`, every `.env`,
`README.md`, `IMPLEMENTATION-PLAN.md`, `testing/`, `backups/`, `tmp-logs/`,
`docker-compose.yml/yaml/example` and `.github/`. Nothing excluded is ever
`COPY`ed, so this is about speed and hygiene, not about correctness — except
for the `.env` lines, which are about not baking local credentials into a build.

Known gaps, deliberately left as-is: the image has no `HEALTHCHECK`, no
non-root `USER`, and no response compression middleware. It works; adding any
of the three is an optional improvement, listed at the end.

# Build the image

## On GitHub Actions (no Docker needed on your laptop)

`.github/workflows/docker-image.yml` builds and pushes
`syedhamza6265/asset-management-app`. Two triggers:

| Trigger | Tag used |
| --- | --- |
| **Run workflow** (Actions → Build and push Docker image → Run workflow → branch `master`) | whatever you type in the `tag` box. The prefilled default is a stale date — type today's, e.g. `release-20261101` |
| Pushing a **git tag** (`git tag release-20261101 && git push --tags`) | the git tag name, so git and Docker tags always match |

Both also publish `:latest`.

One-time setup on GitHub:

| Kind | Name | Where | Value |
| --- | --- | --- | --- |
| Secret | `DOCKERHUB_USERNAME` | Settings → Secrets and variables → Actions → **Secrets** | your Docker Hub username |
| Secret | `DOCKERHUB_TOKEN` | same | a Docker Hub **access token** (not your password). Names may only contain letters, digits and underscores, must start with a letter or underscore, no spaces or dashes — GitHub rejected `DOCKERHUB-TOKEN`, which is why the name uses an underscore |
| **Variable** | `VITE_TURNSTILE_SITE_KEY` | the **Variables** tab, not Secrets | the public site key. Variables are readable in logs by design; a secret would be masked and unusable as a build arg |

Notes on the workflow's choices:

- `provenance: false` — Docker Hub's own `docker pull` on older engines, and
  some container runtimes, choke on the OCI attestation manifest that
  buildx adds by default. Turning it off keeps the tag plainly pullable.
- `cache-from` / `cache-to: type=gha` — the layer cache lives in GitHub, so a
  rebuild with unchanged `package-lock.json` files skips `npm ci`, which is most
  of the build time.
- `concurrency: docker-image` with `cancel-in-progress: false` — two queued
  builds never run at once, and an older one is not cancelled mid-push.
- `permissions: contents: read` — the job needs nothing else.
- Pushing anything under `.github/workflows/` requires a credential with the
  `workflow` scope. A classic PAT with `repo` only gets `403`, and GitHub
  silently ignores the change; fine on the web editor, annoying from CLI.

## Locally, if you have Docker

```bash
docker build --build-arg VITE_TURNSTILE_SITE_KEY=<your-site-key> \
  -t syedhamza6265/asset-management-app:local .
```

Run the same compose file against `:local` to test a change before publishing.

# Tag policy

| Tag | Meaning | Rule |
| --- | --- | --- |
| `release-YYYYMMDD` | the dated build | one per release; add a suffix (`release-20261101-b`) if you re-build the same day |
| `latest` | always the newest build | overwritten by every publish |
| `bookworm-slim` | the build the office was running before the dated scheme | **never overwrite it.** It is the rollback anchor; note its digest (`docker images --digests`) and roll back by digest, not by tag |

`docker-compose.example.yaml` still points at `bookworm-slim`. Change `image:`
to the dated tag when you deploy, so the running version is recorded in the
compose file on the server.

# The compose file

`docker-compose.example.yaml` is the template; the real `docker-compose.yml` is
gitignored (as are `docker-compose.yaml`, `backups/` and every `.env`), so it
lives only on the server. Copy the example, fill the values, keep it next to
nothing else — there is no bundled MySQL service.

| Key | Value in the template | Notes |
| --- | --- | --- |
| `image` | `syedhamza6265/asset-management-app:bookworm-slim` | set to your dated tag |
| `container_name` | `asset-management-app` | makes `docker logs asset-management-app` work |
| `restart` | `unless-stopped` | survives restarts and crashes; a manual `docker stop` stays stopped |
| `ports` | `"8073:8073"` | host:container. Change both together unless you have a reason |

Environment values, with the required ones first:

| Variable | Required | Default if absent | What it does |
| --- | --- | --- | --- |
| `DB_HOST`, `DB_NAME`, `DB_USER`, `DB_PASSWORD` | **yes** | refuses to start | MySQL coordinates. `DB_PORT` defaults to 3306 |
| `SESSION_SECRET` | **yes** (32+ characters) | refuses to start | signs the session cookie. Changing it signs everyone out |
| `FRONTEND_URL` | **yes** | — | the CORS/CSRF origin. Must be the exact origin users type, e.g. `http://192.168.1.20:8073`; a mismatch means the browser blocks every write |
| `PORT` | recommended | 3000 | the port the process listens on |
| `HOST` | optional | 0.0.0.0 | inside a container leave as-is |
| `NODE_ENV` | yes | development | `production` turns on the SPA-safe caching and hides stack details |
| `TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET_KEY` | only if Turnstile is used | — | server-side verification keys |
| `SESSION_MAX_AGE_MS` | optional | 86400000 (24 h) | session lifetime |
| `SMTP_ENCRYPTION_KEY` | **yes before saving an SMTP password** (32+ characters) | — | AES-256-GCM key for the stored password. Changing it makes the stored password unreadable |
| `EMAIL_WORKER_ENABLED` | optional | `true` | `false` still queues rows but sends nothing — the safe switch during an incident |
| `EMAIL_WORKER_INTERVAL_MS` | optional | 15000 | how often the worker wakes up |
| `EMAIL_MAX_ATTEMPTS` | optional | 5 | after this a send is marked `failed` permanently |
| `IP_ACCESS_ENFORCE` | optional | `true` | break-glass. Set `"false"` and recreate the container if an allowlist mistake locks every admin out, fix the list in Settings, then set it back |

`SESSION_SECRET`, `SMTP_ENCRYPTION_KEY` and `DB_PASSWORD` are secrets. Keep
them in the compose file only if its permissions make that acceptable
(`chmod 600`), or move them to a `.env` next to the compose file — either way
they never enter git, and never get printed into a screenshot or a chat.

# First deploy on a machine

1. **MySQL.** Create the database (`utf8mb4`, `utf8mb4_unicode_ci`) and a user
   that can reach it from the container's network. Confirm the host is
   reachable from a container, not only from the host itself.
2. **Compose.** Copy `docker-compose.example.yaml` to `docker-compose.yml`, set
   `image:` to the tag you want, fill the table above.
3. **Start.**
   ```bash
   docker compose pull
   docker compose up -d
   docker logs -f asset-management-app
   ```
   At boot the server connects, creates `schema_migrations` if needed, applies
   every unapplied migration in filename order, and only then starts listening.
   Watch for "Applied migration …" lines and then
   `API listening on http://0.0.0.0:8073`.
4. **Health.**
   ```bash
   curl -s http://localhost:8073/health
   ```
   Expect `{"success":true,"data":{"status":"ok"}}`. `/health` is deliberately
   exempt from the IP allowlist gate so monitoring still works.
5. **Set up the admin.** Open `http://<host-ip>:8073` and complete the one-time
   setup screen. If the app is already in use, skip this — you are restoring an
   existing database, not creating a new one.
6. **Settings.** In the app: SMTP (then "Test connection" and
   "Send test email"), Turnstile, branding, Quick Entry, and last the IP
   allowlist.

# Deploying a new version

Order matters, because the migration runner will not roll back.

```bash
# 1. back up first, always
mysqldump -h <db-host> -P 3306 -u <user> -p --single-transaction \
  --routines --triggers <db-name> > backups/pre-deploy-$(date +%F).sql

# 2. confirm the dump is sane (it should list your tables)
grep -c "CREATE TABLE" backups/pre-deploy-*.sql

# 3. publish the image (GitHub Actions, or docker build locally)

# 4. on the server: point compose at the new tag
docker compose pull
docker compose up -d          # recreates the container
docker logs -f asset-management-app   # watch the migration lines
curl -s http://localhost:8073/health
```

Then check the app itself: sign in, open a type, add one test record and delete
it, and look at Email History. Tell users to hard-refresh once — the service
worker keeps the old shell until the new one is fetched.

Roll back by putting the previous tag (or better, the recorded digest) back in
`image:` and re-creating. If the new version had already applied a migration,
rolling back the container does not undo the schema; the app tolerates extra
columns and tables, so a rollback is usually still safe — but if the migration
changed data (a field-type migration, for example), restoring the dump is the
correct move:

```bash
mysql -h <db-host> -u <user> -p <db-name> < backups/pre-deploy-2026-11-01.sql
```

# Migrations on restart: what actually happens

This was measured on a copy of real data, twice, and the result is what you
should expect in an office with unreliable power.

- The runner reads `server/migrations/*.sql` in filename order and, for each
  file, checks `SELECT id FROM schema_migrations WHERE name = ? LIMIT 1`. If a
  row exists, the file is skipped entirely. A row is inserted **only after the
  file succeeds**.
- So a container restart, a crash, a `docker compose up -d`, or a power cut
  that brings the machine back all replay the folder but apply nothing that is
  already recorded. Existing data is untouched. Repeated boots are normal and
  harmless.
- The one hazard: MySQL commits DDL automatically, so a file that is halfway
  through when power is lost is not recorded. The next boot replays the whole
  file, and an unguarded `ALTER TABLE … ADD COLUMN` then fails with
  `ER_DUP_FIELDNAME`, which stops boot — a restart loop, not data loss. Fix it
  by inserting the missing ledger row by hand and letting the container
  restart:
  ```sql
  INSERT INTO schema_migrations (name) VALUES ('017_the_half_applied_file.sql');
  ```
  Newer migrations avoid the trap by guarding `ALTER` with
  `information_schema` checks plus `PREPARE`/`EXECUTE`.
- If MySQL is unreachable at boot, the server logs the connection error and
  calls `process.exit(1)`. `restart: unless-stopped` then retries, so a
  database that comes up late self-heals.

Never edit, rename or delete a migration that has been applied anywhere. Add a
new numbered file instead.

# Real client IPs and the allowlist

`app.set('trust proxy', 1)` is on, so rate limiters use the left-most address
in `X-Forwarded-For` (one trusted hop). The **IP allowlist does not** — it reads
`req.socket.remoteAddress`, because that header is attacker-controlled and a
gate built on it can be bypassed by typing a header. That difference is
deliberate and is documented in `modules/ipAccess/service.js`.

Practical consequences on a Docker deployment:

- With a published port and Docker's default **userland proxy**, the container
  sees the bridge gateway address (something like `172.17.0.1`) for *every*
  visitor. A per-device allowlist entry will then never match, and the list
  that "works" from your laptop will lock the office out.
- Two fixes, either of which is fine: `network_mode: "host"` for this service,
  or `"userland-proxy": false` in `/etc/docker/daemon.json` on the host
  (Linux only; restart Docker afterwards).
- Always verify before switching a gate on: open **Settings → Network
  restriction** from a second device and read the "IP the server sees for you:"
  line. If it shows the same address for two different devices, you are still
  behind the proxy.
- Behind an nginx/Caddy reverse proxy the socket address is the proxy's. In
  that topology you would need PROXY protocol or to accept the trust-proxy
  trade-off; a plain `X-Forwarded-For` from a proxy you control is the usual
  answer, and it is a change to `decideAccess`, not a config toggle.
- `IP_ACCESS_ENFORCE=false` is the break-glass. It disables enforcement
  entirely, without touching the saved list.

The blocked response is a `404` page for HTML and `{"code":"NOT_FOUND"}` for
JSON, with the real reason logged server-side. `/health` and the signed-in
`/api/v1/settings/ip-access` route are exempt so you can always fix the list
from inside the app.

# HTTPS, ports and users

- The container speaks plain HTTP. For anything reachable from the internet,
  put a reverse proxy (Caddy is the least work: automatic Let's Encrypt) in
  front and set `FRONTEND_URL` to the HTTPS origin.
- On a LAN, HTTP is what the office uses, and `FRONTEND_URL` must match exactly
  what people type — `http://localhost:8073` and `http://192.168.1.20:8073` are
  different origins, and a wrong value produces CORS/CSRF failures on writes.
- PWA install requires HTTPS or `localhost`. Over a plain LAN IP, Chrome and
  Firefox will not offer "Install app"; this is a browser rule.
- Turnstile needs the domain registered in its Cloudflare widget and does not
  work on a bare IP; keep it disabled for LAN-only runs (the Settings card
  warns you if it is enabled without keys).

# Backups

Everything worth keeping is in MySQL: assets, fields, forms, rules, templates,
sessions, notifications, branding images. There are no file uploads on disk.

- Dump before every deploy (the command above) and on a schedule. A daily
  `mysqldump` from cron, keeping 14 days, is enough for an office of this size.
- Keep dumps **outside** the repo folder, or at least in `backups/`, which is
  gitignored. Never commit a dump — it contains password hashes and session
  data.
- Test a restore once into a scratch database. An untested dump is a rumour.
- `mysqldump` output contains the `sessions` table too; restoring it signs
  everyone in again with their existing cookies. Harmless, but if you are
  restoring after a suspected cookie leak, run
  `TRUNCATE sessions;` on the restored database and have everyone sign in
  again.

# Routine operations

| Task | Command / action |
| --- | --- |
| Is it up? | `curl -s http://localhost:8073/health` |
| Logs | `docker logs --tail 200 -f asset-management-app` |
| Restart | `docker compose restart` (safe: migrations simply re-check and skip) |
| Change an env value | edit compose, then `docker compose up -d` (re-creates the container) |
| Enter the container | `docker compose exec asset-management-app sh` |
| Watch the email worker | it wakes every `EMAIL_WORKER_INTERVAL_MS`; a second container on the same DB is locked out by `GET_LOCK('asset_email_worker', 0)`, so scaling out is safe for sending but pointless for load |
| Stop email sending during an incident | `EMAIL_WORKER_ENABLED: "false"` and re-create |
| Free disk after many builds | `docker image prune -f` (keep the previous release tag) |
| Who has a live session? | `SELECT session_id, FROM_UNIXTIME(expires) AS expires_at FROM sessions ORDER BY expires DESC LIMIT 20;` |

Sessions live in MySQL (`express-mysql-session`, table `sessions` with
`session_id`, `expires`, `data`), which is why one container can restart
without logging anyone out, and why multiple containers could share sessions if
you ever scale. The store clears expired rows every 15 minutes on its own.

There is no metrics endpoint, no alerting and no log aggregation. `GET_LOCK`
means at most one worker sends; if emails stall, the queue depth is visible in
the Email History page or with
`SELECT status, COUNT(*) FROM email_outbox GROUP BY status;` (statuses are
`pending`, `sending`, `sent`, `failed`, `cancelled`).

Also note that the cookie's `Secure` flag follows `FRONTEND_URL`: it is set only
when that value starts with `https:` (or is `localhost`/`127.0.0.1` for a few
browser-isolation headers). On a plain-HTTP LAN address the session cookie is
correctly sent over HTTP; the moment you move behind an HTTPS proxy, switch
`FRONTEND_URL` to the `https://` origin or the browser will refuse to store the
cookie and nobody can stay signed in.

# Troubleshooting

| Symptom | Likely cause | What to do |
| --- | --- | --- |
| Container restarts in a loop, log shows `ER_DUP_FIELDNAME` / `Duplicate column name` | half-applied migration | insert the missing `schema_migrations` row, restart |
| Log shows `ECONNREFUSED` then exit | wrong `DB_HOST`/`DB_PORT`, firewall, or MySQL not yet up | fix `.env`/compose; the restart policy retries on its own |
| Log shows a Zod/env validation error naming variables | a required env value is missing or too short | fill exactly those names; `SESSION_SECRET` needs 32+ characters |
| Page loads, every save fails with a network error in the console | `FRONTEND_URL` does not match the origin in the address bar | set it to what users type |
| Sign-in says "Human verification failed" | Turnstile enabled without `TURNSTILE_SITE_KEY`/`SECRET_KEY`, or the domain is not registered, or the bundle was built without the site key | disable Turnstile in Settings (break-glass: sign in from an allowed host), or rebuild with the build arg |
| Login blocked with "Too many login attempts" | limiter: 10 per 15 minutes per IP | wait it out; check whether several users share one NAT address |
| Everyone gets a 404 page | allowlist switched on with the wrong entries (Docker gateway issue) | `IP_ACCESS_ENFORCE: "false"`, re-create, fix the list, set it back to `"true"` |
| No notification emails | SMTP disabled/unconfigured, `EMAIL_WORKER_ENABLED=false`, or no matching rule | Settings → SMTP → "Test connection"; check Email History status |
| Email History full of `failed` with `EAUTH` | bad SMTP credentials / no app password | re-enter; for Gmail use an app password |
| Stored SMTP password suddenly unreadable | `SMTP_ENCRYPTION_KEY` changed | restore the old key, or re-enter the password once |
| Quick Entry card missing for visitors | feature disabled, or their IP is gated | Settings → Quick Entry, and the "Restrict Quick Entry" switch |
| Browser shows an old screen after a deploy | service worker still serving the cached shell, or the image was built without the new bundle | hard-refresh; confirm the image tag; only then suspect caching |
| `docker pull` says the tag is not found | the Actions build failed, or the tag has uppercase characters | check the workflow run; tags must be lowercase `[a-z0-9._-]` |

# Improvement backlog (not done yet)

Deliberate, safe, and not needed for the current office scale:

1. `HEALTHCHECK CMD curl -f http://localhost:8073/health || exit 1` in the
   Dockerfile (needs `curl` installed in the image, or a `node -e` probe) so an
   orchestrator can see a hung process rather than a live one.
2. A non-root `USER node` in the final stage. Nothing in the app writes to the
   filesystem, so this is likely to work as-is, but it has not been tested.
3. Response compression (`compression` middleware). The bundle is a few
   hundred KB, which is fine on a LAN and slow over a phone tether.
4. `client/dist` is copied in at build time, which is correct — but the image
   also carries the whole Node toolchain from the base layer. A `distroless` or
   `node:slim` + `npm ci --omit=dev` is already used, so the gain is small.
5. Argon2 hashing is CPU-heavy by design; if user counts grow, the login path
   is the first place to measure.
6. Rate limiters are in-memory per process, so scaling to two containers
   doubles each budget. One container today, so this is theoretical.

# Release checklist

1. `server` and `testing` suites green; client rebuilt and clicked through at
   desktop and 360 px.
2. New migration tested against a **copy** of production data, then booted a
   second time to prove the skip.
3. Dump taken and verified.
4. Workflow run published the dated tag **and** `latest`; record the digest of
   the previous release for rollback.
5. Server: `docker compose pull && up -d`, watch migrations, `curl /health`.
6. In the app: one end-to-end real action (add an asset, watch Email History).
7. Tell users to hard-refresh once.
8. Nothing in git: no `.env`, no compose file, no dump, no test trace with a
   live `sid` cookie, no screenshot containing the Turnstile secret key.
