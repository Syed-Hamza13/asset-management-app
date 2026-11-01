---
title: "01 — Overview and Core Concepts"
---

# What this application is

Asset Manager is a small, self-hosted office application for keeping an inventory
of anything: laptops, chairs, printers, servers, books, tools — whatever the
office needs to track.

Nothing about the data shape is fixed in code. A user creates an **asset type**
("Laptop"), decides which **fields** that type should have (Brand, Serial No,
Issued To, Purchase Date, ...), and the application builds the form, the table,
the validation and the export from those definitions. Records saved inside a
type are called **assets**.

The same application also supports:

- many accounts, each with their own private records and their own permissions;
- automatic field filling (**automations**) while a form is being typed;
- **email notifications** when a record is created or a field changes;
- a public **Quick Entry** form on the sign-in screen, so a person without an
  account can hand over a request that notifies chosen staff;
- **XLSX export** and a cross-type **Reports** page;
- browser install (PWA), a custom app icon, and an optional **IP allowlist**.

It is one container, one MySQL database, no external service except Cloudflare
Turnstile (the human-verification widget) and the SMTP server the admin configures.

# Who uses it, and what each role can do

| Role | How they get here | What they can do |
| --- | --- | --- |
| **Admin** | created once, during first-time setup | sees every record in the workspace, creates users, grants permissions, configures SMTP / Turnstile / Quick Entry / branding / IP allowlist, shares asset types, copies their common form to other users |
| **Ordinary user** | created by an admin with a temporary password | works with what they own: their asset types, fields, dropdowns, common form, automations, email rules, reports — limited to the capabilities the admin granted. New accounts start with "assets only" |
| **Anonymous visitor** | opens the app URL without signing in | sees only the sign-in screen and, if the admin enabled it, the Quick Entry form |

Two rules that define the whole product:

1. **Private by default.** A record belongs to whoever created it. Another
   ordinary user cannot read or change it — the API answers `404`, not `403`, so
   even the existence of the record is not leaked.
2. **The admin is an operator, not a data owner.** When the admin edits a record
   that belongs to someone else, the server temporarily acts *as that owner*
   for automations, form attachment and email rules, so the owner's own
   configuration drives the record and the admin's personal settings never leak
   into it.

# Feature list

| Area | Feature | Controlled by |
| --- | --- | --- |
| Data | Asset types with owner-scoped slug, rename, delete | `asset_types.*` capabilities |
| Data | Field definitions: 9 types, per-owner unique key, safe type change with preview | `fields.manage_own` |
| Data | Dropdowns with options, per-owner unique slug | `dropdowns.manage_own` |
| Data | Common Form: a personal default field set auto-attached to every owned type | `common_form.manage_own` |
| Data | Automations: 4 conditions, 3 actions, live while typing and enforced on save | `automations.manage_own` |
| Data | Assets: create, view, edit (in-row or full page), delete, bulk update, bulk delete | `assets.*` capabilities |
| Data | Column show/hide and re-order for the asset list | form save (`asset_types.edit_own` or `fields.manage_own`) |
| Sharing | Admin shares one asset type with chosen users | admin only |
| Sharing | Admin deep-copies their common form into another user's empty form | admin only |
| Reports | Cross-type table with sort, per-column filters, search | `reports.view_own` |
| Reports | XLSX export of the filtered rows | `reports.export_own` |
| Email | One global SMTP account (admin), per-user templates / recipients / rules | `email.*` capabilities |
| Email | Transactional outbox + background delivery worker with retries | env flags |
| Entry | Public Quick Entry form with its own fields and notification templates | admin only |
| Entry | In-app notification bell and dashboard banner | automatic |
| Access | Cloudflare Turnstile on sign-in, setup and Quick Entry, with an on/off switch | admin switch + env keys |
| Access | IP allowlist for the whole app or only Quick Entry, blocked visitors get a plain `404` | admin only (+ `IP_ACCESS_ENFORCE` break-glass) |
| Look | Uploaded favicon / app icon, generated PWA manifest | `branding.manage` |
| Accounts | Users page: create, edit display name, reset password, set permissions, deactivate, delete | admin only |
| Accounts | Forced password change on first login | `must_change_password` flag |

# Core concepts (glossary)

| Term | Meaning |
| --- | --- |
| **Asset type** | A category of things, e.g. *Laptop*. Has a name, a URL slug and a form. |
| **Field definition** | A reusable question, e.g. *Serial No* of type `text`. Owned by one user, so two users can both have "Serial No". |
| **Field key** | The machine name of a field (`serial_no`). Unique per owner, immutable after creation, used in automations, email placeholders and exports. |
| **Dropdown / option** | A list of allowed values (*Brand: Dell, HP*). A `dropdown` field points at one dropdown; its stored value is the option's `value`, its display is the option's `label`. |
| **Common Form** | Each user's personal base field set. Fields here are automatically attached to every asset type the user creates, and their own automation rules run before type rules. |
| **Automation rule** | "When *this* field on this form matches *this* condition, set *that* field to *this*." |
| **Asset** | One saved record. Publicly addressed by `publicId` (a UUID), so internal numeric ids are never exposed. |
| **Show in list** | Per-type flag deciding whether a field is one of the asset-list columns. |
| **Share** | An admin granting specific users access to one asset type they do not own. |
| **Capability** | A named permission such as `assets.create_own`. Users have a list of them; admins implicitly have all 19. |
| **Outbox** | The `email_outbox` table. A row is inserted in the same transaction as the asset save; a worker then delivers it. |
| **Notification** | An in-app bell message. Only Quick Entry produces them today. |
| **Quick Entry** | The public form on the sign-in screen. It stores a submission and notifies people; it does **not** create an asset. |
| **IP allowlist** | A saved list of addresses/CIDRs/ranges/wildcards that may reach the app or Quick Entry. |

# A worked example

1. **Aisha** creates the asset type *Laptop*.
2. In **Common Form** she adds `Purchase Date` (type `date`) and `In Use`
   (type `boolean`) — both now appear automatically on every type she creates.
3. In the type's **Configure Form** she adds `Brand` (dropdown: Dell / HP / Lenovo),
   `Serial No` (text) and `Quantity` (quantity).
4. She writes one **automation**: when `Brand` *equals* `lenovo`, set
   `Serial No` to the text `PENDING-LENOVO`. It fires live in the browser while
   typing, and the same rule is re-applied by the server on save.
5. She saves a laptop. The response says `notificationsQueued: 1`, because her
   **email rule** ("when an asset is created, send the *New purchase* template to
   the Accounts recipient") matched. The outbox row is part of the same
   transaction; the worker sends it seconds later.
6. **The admin** opens **Reports**, filters `Brand = dell`, and clicks
   **Export XLSX** — one file with an `Asset Type` column plus every distinct
   field name as a column.
7. A visitor at the front desk opens the app URL, fills **Quick Entry**
   ("Printer jam, room 2"), and chooses whom to notify. A bell notification
   appears for those users. No asset was created.

# What this application deliberately does not do

| Not supported | Why / what to know instead |
| --- | --- |
| Offline data sync | The PWA only caches the app shell. `client/README.md` states offline sync is not part of the MVP. |
| Server-side reports | There is no `/reports` API. Reports and XLSX are computed in the browser from the asset APIs. |
| Server-side search or sorting of assets | The list endpoint only takes `page` and `pageSize`. Filtering, sorting and search are client-side. |
| Multi-tenant / multiple offices | One database, one workspace, one admin-created user set. |
| Native mobile apps | It is a responsive web app, installable as a PWA. |
| Currency or number localisation | There is no currency formatting anywhere in the client. |
| Timezones other than IST | "Today" is always computed in `Asia/Kolkata`, never the browser's zone. |
| Two separate environments in one image | Environment differences come from variables, not from build stages. |

# Technology at a glance

| Layer | Choice |
| --- | --- |
| Client | React 19.1, Vite 7.1, Tailwind CSS 4.1 (CSS-first, no config file), react-router-dom 7.8, xlsx 0.18 (SheetJS), lucide-react 0.545 |
| Server | Node.js ESM, Express 5.1, Zod 4 (validation), mysql2 3.14, express-session + express-mysql-session 3, argon2 0.43, nodemailer 10.2, helmet 8.1, express-rate-limit 8, uuid 11 |
| Database | MySQL 8 (external to the container), 28 tables, numbered SQL migrations |
| Delivery | One Docker image (`node:bookworm-slim`, 2-stage build), built by GitHub Actions, published to Docker Hub |
| Verification | Cloudflare Turnstile; passwords with argon2id; SMTP password with AES-256-GCM |

# License, author and contributors

| | |
| --- | --- |
| License | MIT (repository `LICENSE` file) — free to use, modify and redistribute, including commercially, with the copyright notice kept |
| Version | 1.0.0 |
| Author and developer | Syed Hamza — <https://github.com/Syed-Hamza13>, <mailto:syed13hamza@gmail.com> |
| Contributors | Tariq Khan, Eklavya Foundation |
| Source | <https://github.com/Syed-Hamza13/asset-management-app> |
| Issues | <https://github.com/Syed-Hamza13/asset-management-app/issues> |

There is no paid tier, no feature gate and no telemetry. The only outbound
network calls are the ones an operator configures: the MySQL host, the SMTP
server, and Cloudflare Turnstile if it is switched on.

The same facts are shown inside the application in the About overlay
(**Settings → About this application**, or the info button at the bottom of the
desktop sidebar). Its text lives in one file, `client/src/appInfo.js`, together
with `APP.version` — which is why a release bumps that file along with the three
`package.json` versions.

# How to read the rest of this documentation set

Start with `00 — Index`. Then:

- to understand the shape of the system: **02 Architecture**;
- to change data or write a migration: **03 Data model and migrations**;
- to change the API or business rules: **04 Backend guide** and **05 API reference**;
- to change screens: **06 Frontend guide**;
- to train a colleague: **07 User guide**;
- to work on the code locally: **08 Setup and development**;
- to run it in production: **09 Docker deployment and operations**.
