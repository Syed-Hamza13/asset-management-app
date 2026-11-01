---
title: "00 — Documentation Set: Start Here"
---

# What this set is

Nine documents about the asset-management application in this folder: what it
does, how it is built, how it is used, how it runs, and how it is deployed.
They describe the code as it stands on **2026-11-01**, after the modularisation
refactor and the 2026-11-01 production release.

Every factual statement was taken from the source, from a live read of the
database, or from a measured run — not from the older `README.md`. Where the
`README.md` or `IMPLEMENTATION-PLAN.md` disagree with the code, document 02
lists the differences.

# Which document to read

| Document | Read it if you are | Rough length |
| --- | --- | --- |
| **01 — Overview** | new to the app, an office user, or deciding what this software does | short |
| **02 — Architecture** | about to change the code, or reviewing an approach | medium |
| **03 — Data Model and Migrations** | working on the database, or on a migration | medium |
| **04 — Backend Guide** | writing or reviewing server code | long |
| **05 — API Reference** | calling the API, from the client or from your own script | medium |
| **06 — Frontend Guide** | writing or reviewing React code | medium |
| **07 — User Guide** | using or administering the app in a browser, or training someone | long |
| **08 — Setup and Development** | setting up a machine, running tests, making a change | medium |
| **09 — Docker, Deployment and Operations** | running it in production, deploying, or fixing an outage | medium |

A new developer's path: **01 → 07 (skim) → 02 → 08**, then 03/04/05/06 as
needed per task. An admin's path: **01 → 07 → 09** for the Settings cards.

# The app in eight lines

- It tracks **assets** — laptops, printers, chairs — for an organisation.
- An **asset type** is a name plus a form; the form is built from reusable
  **field definitions**, so nothing about the data model is hard-coded.
- **Users** each own their own asset types, fields, dropdowns and forms. A
  person sees only their own work unless an admin shares a type with them; an
  admin sees everything.
- **Automation rules** fill or clear one field when another field changes.
- **Email notification rules** mail named recipients when an asset is created
  or a field changes. Mail is queued in the database and sent by a worker
  inside the server process.
- **Quick Entry** puts a public form on the sign-in screen so an outsider can
  submit a request, which becomes a notification rather than an asset.
- **Reports** cross asset types, and both table pages export to Excel in the
  browser.
- One Docker container runs the API and the built website together; MySQL 8
  holds every byte of state.

# Vocabulary used consistently

| Word | Means |
| --- | --- |
| asset type | a category with a form, e.g. *Laptop* |
| field definition | one reusable question, e.g. *Serial Number* with key `serial_number` |
| form | the ordered set of fields attached to one asset type, or the common form |
| common form | the field set automatically offered to every asset type of the owner |
| capability | a permission key such as `assets.edit_own`; see documents 01 and 04 |
| owner | the single user a record belongs to; `_own` in a capability refers to them |
| outbox | the `email_outbox` table; every queued mail is one row and is what the Email History page reads |
| break-glass | an environment variable that disables a safety gate when it has locked people out |

# Housekeeping for these documents

- Editable Markdown sources are in `doc/src/`. The Word files in `doc/` are
  generated from them — do not hand-edit a `.docx` and expect it to survive.
- Regenerate the whole set with `python doc/_build/build_docs.py` (or one
  document by name). Styling comes from `doc/_build/reference.docx`, which
  `python doc/_build/make_reference.py` rebuilds. `doc/README.md` has details.
- Each document is self-contained on purpose, with its own contents page, so it
  can be sent to one person on its own.
- Nothing in here contains a password, a token, a live Turnstile key or a
  database credential. Where a value is needed, the documents say so in words.
