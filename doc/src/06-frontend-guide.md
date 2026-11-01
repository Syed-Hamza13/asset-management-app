---
title: "06 — Frontend Guide"
---

# What the frontend is

The client is a single-page React 19 application. It holds no data of its own —
every screen renders what the API returns. It is built by Vite 7 into static
files, and the Express server serves those files and the API from one process,
so the browser sees one origin.

| Item | Value |
| --- | --- |
| Framework | React 19 + React Router 7 (`BrowserRouter`) |
| Styling | Tailwind CSS 4 through `@tailwindcss/vite`, no config file — utilities plus a small hand-written `src/index.css` |
| Icons | Inline SVG in components, plus `src/icons/assetIcons.js` for asset-type tiles |
| Spreadsheet export | SheetJS `xlsx` 0.18.5, imported in `src/utils/xlsx.js` |
| HTTP | one thin `fetch` wrapper, `src/api/client.js` |
| State | React `useState`/`useEffect` per page + three contexts; no Redux, no React Query |
| Dates | `src/utils/date.js` only |

# Folder map

```
client/
  index.html              favicon + manifest links, #root, theme-colour
  vite.config.js          dev/preview host, /api proxy
  public/
    sw.js                 service worker (offline shell)
    icons/icon.svg        fallback app icon
  src/
    main.jsx              StrictMode + BrowserRouter + AuthProvider, SW register
    App.jsx               every route, guards, redirect rules
    index.css             font reset, spinner, row-hover, phone breakpoints
    appInfo.js            the About text: name, version, license, author,
                          contributors, tech stack
    api/client.js         one place where the API is called
    context/              AuthContext, ToastContext, NotificationsContext
    components/           Layout, ui.jsx, DynamicForm, AssetForm,
                          AutomationBuilder, NotificationBell/Banner,
                          AboutDialog, AssetTypeIcon, Turnstile
    pages/                one file per route, plus three folders of
                          page-private sub-components
    hooks/                useColumnFilters.js, useAppIcon.js
    utils/                date.js, assetValues.js, xlsx.js
    icons/assetIcons.js
```

Rule worth keeping: a component used by only one page lives inside
`pages/<page>/`. It moves to `components/` only when a second page needs it.
That is why `ConfigureFormModal` sits in `pages/assetType/` while `Modal` sits
in `components/`.

# Routing

All routes are declared in `App.jsx`. There is no lazy loading; one JS bundle
covers the app.

| Path | Component | Guard |
| --- | --- | --- |
| `/` | `Dashboard` | signed in (also renders the `Login` screen when signed out) |
| `/reports` | `Reports` | `reports.view_own` |
| `/common-form` | `CommonForm` | `common_form.manage_own` |
| `/fields` | `Fields` | `fields.manage_own` |
| `/dropdowns` | `Dropdowns` | `dropdowns.manage_own` |
| `/users` | `Users` | admin only |
| `/email-notifications` | `EmailNotifications` | `email.rules.manage_own` |
| `/email-history` | `EmailHistory` | `email.history.view_own` |
| `/settings` | `Settings` | signed in, no capability |
| `/asset-types/:id` | `AssetType` | `asset_types.view_own` |
| `/asset-types/:assetTypeId/new` | `AssetEditor` (create) | `assets.create_own` |
| `/assets/:publicId` | `AssetDetail` | `assets.view_own` |
| `/assets/:publicId/edit` | `AssetEditor` (edit) | `assets.edit_own` |
| `/setup` | `Setup` | rendered only while `setupRequired` is true |
| anything else | redirect | to `/setup` if setup is pending, else `/` |

## The guard component

`Protected` wraps every signed-in route and answers in this order:

1. `booting` (the first `/auth/me` has not returned) → a full-screen
   "Loading...". This prevents a flash of the login form on refresh.
2. No user → if the path is `/`, render `<Login />`; otherwise
   `<Navigate to="/" state={{ from: pathname }} replace />`. The sign-in screen
   therefore exists at exactly one URL, and the deep link is remembered.
3. `user.mustChangePassword` and the path is not `/settings` → hard redirect to
   `/settings`. There is no way to dismiss this; every other screen is
   unreachable until the password is changed.
4. At `/` with a remembered `state.from` → resume that path now.
5. Otherwise render `<Outlet />`, which is `<Layout />`.

`RequireCap` is separate: it checks one capability (`can(cap)`) or admin
(`cap === 'admin'`) and otherwise sends the visitor to `/`. A page the user
cannot see is also absent from the sidebar, so the redirect is rarely noticed.

# Talking to the API

`src/api/client.js` exports `api` (a flat object of methods mirroring the route
map) and `ensureCsrf()` / `clearCsrf()`.

- Base URL: `VITE_API_BASE_URL` if set at build time, otherwise
  `${window.location.origin}/api/v1`. Because the server serves the client too,
  the default needs no configuration.
- Every request sends `credentials: 'include'` so the session cookie travels.
- Responses are parsed as JSON. A body that is not JSON (an HTML error page) is
  turned into `{ success:false, error:{ message: 'Invalid server response.' } }`.
- On a non-2xx status the wrapper `throw`s an `Error` whose message is the
  server's `error.message`, with `code`, `fields` and `status` attached. Pages
  read `e.message` and show it; forms read `e.fields` to mark inputs.

## CSRF handling

The token is kept in a module variable, not in React state.

- A `GET`/`HEAD`/`OPTIONS` request never sends a token.
- For a write, if no token is cached yet, the wrapper first calls
  `GET /auth/csrf`, caches the result, then sends `X-CSRF-Token`.
- Three paths skip that pre-fetch because they are public and have no session
  to read a token from: `/auth/login`, `/quick-entry/submit`, `/setup`.
- `api.login()` re-reads the token after a successful login (a new session
  means a new token). `api.logout()` and `AuthContext.logout()` clear it.

Consequence worth remembering: calling `api` from your own code is safe — the
token is fetched lazily. But the token is per-session, so a second browser tab
that logs out invalidates the first tab's cached token until the next write
re-fetches it.

# Auth state

`AuthContext` holds three things: `user` (`null` when signed out), `booting`,
and `login` / `logout` / `refresh` / `can` / `isAdmin`.

- On mount it calls `/auth/me` once. Failure is treated as "signed out", not as
  an error.
- `can(capability)` returns `true` for any admin, otherwise tests
  `user.permissions.includes(capability)`. It never calls the server — the
  permission list is what `/auth/me` returned at login. After an admin changes
  someone's permissions, that person must sign out and back in (or a page must
  call `refresh()`).
- `isAdmin` is `user?.role === 'admin'`.
- Pages use it as `const { can, isAdmin } = useAuth();` and hide buttons with
  `{can('...') && <Button …/>}`. Hiding is cosmetic only; the server enforces
  every action again.

# Layout and navigation

`components/Layout.jsx` renders the shell, and provides the two contexts pages
depend on:

```
ToastProvider
  NotificationsProvider
    aside (sidebar, hidden below lg)
      header row: app icon + name + bell
      nav list
      footer: user email, Logout, About (info button)
    header (compact, lg:hidden)  ← <h1> page name + bell + logout
    main (max-w-7xl, p-4 sm:p-6) ← <Outlet />
```

The nav list is one array of `[path, label, capability]`; entries with a
capability are filtered by `can`/`isAdmin`, so a user only ever sees links that
work for them. `/` and `/settings` have `null` and are always visible.

Two things are deliberate:

- Below `lg:` the sidebar is gone and a sticky header shows the page name as an
  `<h1>`. That header is the page's only visible title, which is why
  `.page-title` (the in-page `<h2>`) is hidden under 1024 px — otherwise the
  name would print twice.
- `ToastProvider` wraps the whole shell. A toast raised from a page outside
  this tree cannot render, and `useToast()` throws. This is why the login and
  setup screens use inline `<Alert>` instead of toasts.
- The sidebar header is `icon + <span class="min-w-0 flex-1 truncate"> + bell
  with shrink-0`. The name used to be a text node inside a truncating flex
  container, where `truncate` cannot reach it, so at `w-64` "Asset Manager" ran
  under the bell. Keep the truncation on a real flex item and keep the bell
  `shrink-0`.

## About overlay

`components/AboutDialog.jsx` is the read-only About panel: name, version,
license badge, overview, feature list, license link, author with GitHub /
LinkedIn / email buttons, contributors, tech stack, repository and issue links.
Every string comes from `appInfo.js`; the component takes `open`, `onClose` and
an optional `icon` (the branding data URL from `hooks/useAppIcon.js`, falling
back to a neutral mark).

It is mounted from two places — the sidebar footer button and the Settings
`AboutCard` — and is portalled to `<body>` for the same reason as the
notification panel: the compact header uses `backdrop-blur`, and a
`backdrop-filter` ancestor would clip a `position: fixed` overlay to that box.
Escape and an outside click close it; it fetches nothing of its own.

Its width ladder is `calc(100vw-1.5rem)` on phones (edge to edge),
`min(40rem, 100vw-2rem)` from 640px up, and `min(60rem, 58vw)` from 1280px — a
little over half a desktop window. Its height is capped at `100vh-7rem`
(`100vh-3rem` on a phone), so it keeps a clear margin above and below instead of
filling the screen, and scrolls inside that box: a tall overlay never widens or
scrolls the page behind it.

## Notifications

`NotificationsContext` loads the list plus the unread count on mount and then
polls every 60 seconds while signed in. `markRead` / `markAllRead` update local
state first and fire the API call after, so the badge reacts instantly; a
failed request is swallowed. Errors on the polling call are also ignored — a
notification outage must never blank the app.

`NotificationBell` is mounted twice (sidebar and compact header) and takes an
`align` prop. `NotificationBanner` sits at the top of the Dashboard for the
newest unread items.

# Forms: DynamicForm

`components/DynamicForm.jsx` turns a field list into inputs. It is used by the
asset create/edit pages, the in-row edit modal, and the Add-Asset modal.

| Field type | Control | Notes |
| --- | --- | --- |
| `text` | `Input` (plain) | default branch |
| `multiline` | `Input type="textarea"` | |
| `number` | `Input type="number"` | stores `Number(x)`, or `''` when the box is empty |
| `quantity` | `-` / value / `+` stepper | clamped to 1–15 in the UI, buttons disable at the ends |
| `dropdown` | `Select` from `field.options` | options must be attached by the caller (see below) |
| `boolean` | native `<select>` Yes/No | `''` maps to `undefined`, i.e. "not answered" |
| `date` | `DateInput` | |
| `auto_date` | `DateInput` | identical control; the difference is behaviour, not looks |
| `mobile` | `Input type="tel" inputMode="tel"` | placeholder `e.g. 9876543210` |

Layout is `grid gap-4 md:grid-cols-2`, so a form is one column on a phone and
two from 768 px up.

## auto_date and automation rules in the browser

`DynamicForm` runs the owner's automation rules live, while typing, using the
same `shared/automationRules.js` functions the server uses (`conditionMatches`,
`actionValue`, `isFilledValue`, `isBlockedAutoDateClear`). One `useEffect` does
everything, in one pass:

1. **Seed** — when `isNew` and the mounted form has not been seeded yet, an
   empty `auto_date` gets `todayInputValue()`. Seeding once per mount is what
   makes a deliberate manual clear stick.
2. **Diff** — compare `values` with the previous snapshot to find changed keys.
3. **Manual override** — if the user edited a key that a rule had just written,
   that key is remembered as manual; rules stop re-filling it until its trigger
   source changes again.
4. **Evaluate** — for each rule, test the condition against the current and
   previous value, skip blocked `auto_date` clears, otherwise assign
   `actionValue(rule)`.
5. **Patch** — `setValues` receives only the keys this pass changed. Replacing
   the whole object here would drop an edit typed in the same commit.

`applyingRef` marks the state update this effect itself caused, so the next
run treats it as its own input instead of a user edit.

The result: rules are a preview. The server recomputes them on save and the
saved values are the server's answer, so client and server can never disagree.

## Dropdown options are fetched separately

The form endpoints return a dropdown field without its options. Any page that
renders a form must call `withDropdownOptions(fields)`
(`utils/assetValues.js`) first; that helper issues one
`GET /dropdowns/:id` per dropdown field, in parallel.

- `withDropdownOptions(fields)` → full option rows (list and detail views need
  deactivated options too, because stored values may still reference them).
- `withDropdownOptions(fields, { activeOnly: true })` → only active options,
  shaped `{ value, label }` for `Select`.

Cost: a form with ten dropdown fields makes ten extra requests. That is the
known trade-off; the API deliberately does not embed options.

# Asset list

`pages/AssetType.jsx` is the biggest page. It loads four things in parallel
(`assetTypes.get`, `assets.list`, `assetTypes.form`, `fields.list`) and keeps
all row state in the page, passing it down to `AssetListTable`.

- **One fetch, no paging controls.** `api.assets.list` asks for
  `pageSize=100`. The server clamps to 1–100, so a type with more than 100
  assets shows the first 100 and no more. If that ever becomes a problem, the
  fix belongs in this call plus a pager in the table.
- **Columns.** `visibleFields = form.filter(f => f.showInList !== false)`.
  Order comes from the form's saved order.
- **Cell text.** `formatAssetValue(value, field)`
  (`utils/assetValues.js`) is the single renderer shared by the asset list,
  reports and asset detail: dates → `DD/MM/YYYY`, dropdown id → option label,
  everything else → string, `null`/`undefined` → `''`.
- **Filters.** `useColumnFilters` builds, per column, the sorted distinct
  display values of the rows it was given, and filters in memory. Changing a
  filter makes no request. `resetKey: id` clears picks when you switch asset
  type. The header shows `●` on a filtered column and `▾` otherwise, plus a
  "Showing X of Y assets / Clear filters" strip.
- **Filter popovers are portalled.** `Popover` (`components/ui.jsx`) renders
  into `document.body` at fixed coordinates and flips up or clamps when there
  is no room. This exists because the table is inside `overflow-x-auto`, which
  clips vertically as well — an anchored panel would be cut off.
- **Editing.** When the user has `assets.edit_own`, the last column is an
  `Edit` button that opens the in-row modal (`AssetForm` mounted with the
  asset's `publicId`, plus a "View full page" link in the footer). Otherwise it
  is an `Open →` link to the detail page. After a save, `assetEdited()` closes
  the modal and reloads the list; it does not navigate anywhere.
- **Bulk.** Needs `assets.bulk_own`. Checkboxes select rows ("select visible"
  takes the filtered rows only). The action picker is `update` or `delete`:
  `update` opens `BulkUpdateModal` (one field, one value, applied to the
  selection); `delete` asks with `window.confirm` and then calls the bulk
  delete. Both report the count, and the update toast appends
  "N notifications queued." when the response says so.
- **Export.** `exportAssets()` maps the **filtered** rows through the
  **visible** columns into `{ header: value }` objects and hands them to
  `downloadXlsx`. No server call. Button is disabled when nothing is shown.
- **Toolbar.** One `action-bar action-bar-scroll` row: Add Asset, Configure
  Form, Export XLSX, Automations, Columns, Share (admin), Rename, Delete.
  Every button is `size="sm"` and wrapped in its own capability test. On a
  phone this bar stays on one line and swipes sideways; on desktop it is a
  right-aligned row.
- **Delete dialog** requires a tick-box ("I understand this operation cannot
  be undone") before the danger button enables.

## Modals mount only while open

`{configureForm && <ConfigureFormModal open … />}` is the pattern used
throughout this page. Unmounting on close means the next open re-reads the
saved state, instead of showing last time's unsaved edits.

# Other pages

| Page | What it does | Notable behaviour |
| --- | --- | --- |
| `Setup` | creates the first admin | reachable only while `setupRequired`; posts `/setup` with Turnstile |
| `Login` | sign-in + public Quick Entry | the only screen with no session; no toasts (outside `Layout`), errors via `<Alert>` |
| `Dashboard` | asset-type cards | client-side name search with a "no match" empty state; `Shared` badge on types you do not own; `+ Add Asset` opens `AddAssetModal` (pick or create a type, then fill the form) |
| `AssetEditor` | full-page create/edit | wraps `AssetForm`; deep linkable (`/assets/:id/edit`) |
| `AssetDetail` | read-only view + delete | renders every field through `formatAssetValue`; `Edit` goes to `AssetEditor`; delete uses `window.confirm` |
| `Fields` | field definitions | create/edit, dropdown binding, and the type-change preview flow (asks the server what would be lost before saving) |
| `Dropdowns` | dropdowns and their options | inline option add/edit/deactivate |
| `CommonForm` | one form reused across types | `Copy to users` (admin) deep-copies it into users whose own form is empty |
| `Reports` | cross-type table | built from the same `useColumnFilters` + `downloadXlsx`; all rows are fetched, then filtered and exported client-side |
| `Users` | accounts, permissions, password reset, display name | admin only |
| `EmailNotifications` | templates, recipients, rules | rule editor supports several asset types per rule |
| `EmailHistory` | per-user send log | status filter, admin "All users" checkbox, expandable "Details" row; there is no retry button — the worker retries by itself |
| `Settings` | card stack | see below |

# Settings cards

Visibility is decided in `pages/Settings.jsx`, one card per component in
`pages/settings/`:

| Card | Shown when | Manages |
| --- | --- | --- |
| `BrandingCard` | `can('branding.manage')` | app name, tab icon, login image (data URLs) |
| `TurnstileCard` | admin | enable/disable the bot check |
| `IpAccessCard` | admin | allowlist switch and CIDR list |
| `QuickEntryCard` | admin | public form fields, title/subtitle/placeholders, templates, recipients |
| `SmtpCard` | admin | host/port/user/password/encryption, test connection, test email |
| `PasswordCard` | always | own password |
| `AboutCard` | always | nothing — opens the read-only About overlay |

Each card fetches and saves its own settings, so a failing endpoint only blanks
that card. The SMTP password is never rendered: the API returns
`passwordConfigured` and the card shows "saved — leave blank to keep" instead of
a value.

# Shared UI primitives (`components/ui.jsx`)

| Export | Purpose |
| --- | --- |
| `Button` | `variant` primary/secondary/danger/ghost, `size` sm/md, `loading` shows the spinner. Padding lives in the component, not in `className`, so a `size="sm"` button cannot lose a Tailwind cascade fight with the default `px-4 py-2.5` |
| `Input` | label + `type="textarea"` switch + `hint` + `error`; appends a red `*` when `required` |
| `DateInput` | text box in `DD/MM/YYYY` plus a hidden `<input type="date">` opened by the ▦ button (`showPicker()`, else `click()`) |
| `Select` | label + options; `hideBlank` drops the automatic "Select..." |
| `SearchInput` | three sizes, magnifier, clear-on-`Escape` and an ✕ button |
| `Card`, `EmptyState`, `Alert`, `Modal` | containers; `Modal` is a fixed overlay, `max-w-2xl` by default, scrollable body, `CloseButton` labelled "Close <title>" |
| `Popover` | portalled anchored panel (see filters) |
| `CloseIcon`, `CloseButton` | the ✕ used by modals and the search clear |

`DateInput` keeps two representations: what the user types (`display`) and the
ISO value the API stores. Typing is accepted only while it matches
`^\d{0,2}(\/\d{0,2}(\/\d{0,4})?)?$`; a complete, real `DD/MM/YYYY` is converted
and pushed up. Half-typed or impossible dates are simply not pushed — the value
keeps the last valid one. Clearing the box pushes `''`.

# Styling conventions

`index.css` is short on purpose: Tailwind utilities do the rest.

| Class | What it does |
| --- | --- |
| `page-title` | hidden below 1024 px (the compact header already prints the name) |
| `action-bar` | on a phone: full width, children become two equal columns (`flex: 1 1 calc(50% - 5px)`, `min-width: min-content`) |
| `action-bar action-bar-scroll` | the exception: one non-wrapping, sideways-swiping line, no visible scrollbar, `flex-start` so the first buttons stay reachable |
| `dialog-actions` | stacks footer buttons, `column-reverse` so the primary action is on top while the DOM order stays Cancel → Save |
| `row-hover` | hovered table row gets a slate-100 tint and a 3 px dark inset bar on the first cell (a collapsed `<tr>` cannot paint a box-shadow itself) |
| `spinner` | 18 px current-colour ring |
| `field-row` | first child (the label input) takes the whole line on a phone |

Two rules that were learned the hard way:

- The control font reset (`button, input, textarea, select { font: inherit }`)
  must stay inside `@layer base`. Written unlayered, the `font` shorthand also
  carries `font-size` and beats every `text-*` utility — a `text-sm` button
  rendered at 16 px.
- The phone table padding override is written **unlayered on purpose**, because
  it has to beat `px-*` utilities. The `max-width: 639.98px` cap keeps desktop
  tables pixel-identical.

Breakpoints used: `639.98px` (phone) and `1023.98px` (phone/tablet header
swap). `md:grid-cols-2` (768 px) splits forms into two columns.

# Dates

`utils/date.js` is the only date module. Four exports, four jobs:

| Function | Direction | Note |
| --- | --- | --- |
| `todayInputValue()` | IST today → `YYYY-MM-DD` | uses `Intl` with `timeZone: 'Asia/Kolkata'`, so a browser in another zone still gets India's date |
| `formatDateValue(v)` | ISO → `DD/MM/YYYY` | slices the first 10 characters, so it also accepts a datetime string |
| `indianDateToIso(v)` | `DD/MM/YYYY` → ISO | `''` when empty, `null` when not a real date (checked against a UTC Date) |
| `formatIndiaDateTime(v)` | timestamp → `DD/MM/YYYY, hh:mm AM/PM` (`en-IN`) | timestamps arrive as UTC **or** as naive IST strings from MySQL; the `/[zZ]\|[+-]\d{2}:\d{2}$/` test decides whether to append `Z` |

`en-CA` is chosen for `todayInputValue` because it formats `YYYY-MM-DD`.

# Export features

Both export buttons are frontend-only and use `utils/xlsx.js`:

| From | Rows | Columns |
| --- | --- | --- |
| Asset-type page | the currently **filtered** assets of one type | the **visible** list columns, in order |
| Reports page | the filtered / searched / sorted rows of the cross-type report | the columns left on in "Customize Columns", "Asset Type" first and always kept |

`downloadXlsx(rows, { sheet, fileName })` builds one sheet from
`{ header: value }` objects and calls `XLSX.writeFile`, which downloads through
the browser. File names are fixed — `<slug>-assets.xlsx` and `asset-report.xlsx`
(sheet "Report") — with no date in them. Consequences:

- Values are exported exactly as displayed (`formatAssetValue`), so dates are
  `DD/MM/YYYY` and dropdown ids become labels. Numbers are exported as the
  strings the table shows.
- Coverage differs between the two buttons, and this is the one real
  gotcha on the asset-type page. `api.assets.list` asks for `pageSize=100` and
  that page never asks for page 2, so an asset-type export holds at most 100
  rows. The Reports page reads `total`/`pageSize` from the first response and
  fetches every remaining page before drawing, so its export is complete.
- No server work, and no server-side filter either: both exports reflect what
  the browser is currently showing, not the whole table in the database.
- The buttons are gated by `reports.export_own`; there is no separate export
  permission for the asset list.

# PWA, client side

| Piece | Detail |
| --- | --- |
| Manifest | served by the **server** at `/manifest.webmanifest`, generated from branding settings; linked from `index.html` |
| Icons | `index.html` points `rel=icon` and `apple-touch-icon` at `/api/v1/branding/icon`, with `/icons/icon.svg` as the file on disk |
| Registration | `main.jsx` registers `/sw.js` only when `import.meta.env.PROD` — a dev server must never cache |
| Cache name | `asset-manager-shell-v1`; activation deletes every other cache |
| Pre-cached | `/`, `/index.html`, `/manifest.webmanifest`, `/icons/icon.svg` |
| Fetch strategy | network-first for same-origin `GET`; a successful response is written to the cache, and only a network failure falls back to the cache, then to `/index.html` |

Practical meaning: the app is **not** an offline tool. Once the JS bundle has
been cached, a reload without a server shows the shell and then fails its API
calls, so the user sees the signed-out/loading state. The real benefits are a
launchable home-screen icon, a standalone window, no address bar, and a faster
repeat load. Because assets are hashed by Vite, an old `index.html` from cache
still points at files that exist in the same cache — a deploy with a new
`sw.js` cache name is what changes that.

Install can only be tested over HTTPS or on `localhost`. On a plain-HTTP LAN IP
the browser offers no install prompt; that is a browser rule, not a bug in the
app.

# Toasts, confirms and error display

- `showToast(message, type)` with `type` = `success` (default, green), `error`
  (red) or `queued` (amber). One toast at a time, auto-dismisses after
  3500 ms, top-right, `role="status"`.
- Toasts require `ToastProvider`, i.e. they only work inside `Layout`.
- Destructive one-off actions use `window.confirm` (bulk delete, asset delete).
  Structured destructive dialogs (deleting an asset type) use a `Modal` with an
  explicit acknowledgement tick-box.
- Pages keep a single `error` state and render `<Alert>{error}</Alert>` near
  the top; form fields get `errors[key]` from `e.fields`.

# Adding a screen: the checklist

1. Create `client/src/pages/MyPage.jsx` (sub-components used only here go in
   `client/src/pages/mypage/`).
2. Add the API methods to `api/client.js` — do not `fetch` from a component.
3. Add the route in `App.jsx` inside the `<Route element={<Protected />}>`
   block, wrapped in `RequireCap` if it needs a capability.
4. Add `[path, label, capability]` to the `nav` array in `Layout.jsx`.
5. Use `page-title` on the `<h2>`, `action-bar` on the button row, `Card` for
   surfaces, and `EmptyState` when a list can be empty.
6. If it renders a dynamic form, call `withDropdownOptions` and pass
   `automations` + `isNew` to `DynamicForm`.
7. Add a spec to `testing/` before changing anything it already does.
