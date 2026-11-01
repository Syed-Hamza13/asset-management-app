---
title: "07 — User Guide"
---

# How to use this guide

This guide is for people who **use** and **configure** the app in a browser —
no coding needed. Each section gives the exact words you will see on the screen
in quotes, and the click path as `Page → Button → Dialog`.

Names used below:

- **Admin** — the account with full access. An admin sees every card in
  Settings and every button.
- **User** — a normal account. A user only sees what their granted capabilities
  allow, and only their own data.
- **Visitor** — a person who is not signed in, using the Quick Entry form on the
  sign-in screen.

The app has nine links in the menu, and a user who lacks the right for a link
does not see it at all. That is normal, not a bug.

# First time only

## Create the admin account

The very first time the app is opened it shows a setup screen.

1. Open the app address in a browser.
2. You see the small line "First-time setup", the heading "Create admin
   account" and "This screen is available only once."
3. Fill "Email", "Password" and "Confirm password". The password must be at
   least 10 characters — that is enforced by the browser, so a short password
   will not let you press the button.
4. If human verification is on, complete the Cloudflare box. The button stays
   grey until it passes. When verification is off you see
   "Human verification is turned off for this environment." instead of a box.
5. Press "Create admin account". You land on the Assets page.

This screen never appears again: it disappears the moment one account exists.
If the two passwords do not match you get "Passwords do not match."

## Sign in

1. Open the app address. The sign-in card says "Welcome back" and
   "Sign in to manage your assets."
2. Enter "Email" and "Password", complete the verification box if shown, then
   press "Login".

Wrong password or unknown email shows one red line (the server does not say
which one was wrong, on purpose). Too many failed tries shows
"Too many login attempts. Please try again later." Wait 15 minutes.

If you are a brand-new user, or your password was reset by an admin, the app
sends you straight to **Settings** and says "You must change your password
before continuing. Use your temporary password as the current password below."
Change it there (see "Change your password") before doing anything else.

## Change your password

Settings → "Change password" card → type "Current password", "New password" and
"Confirm new password" (both new fields need at least 10 characters) → press
"Change password". You see "Password changed successfully." and the app takes
you to the Assets page after a moment.

## Sign out

Press "Logout" — bottom of the sidebar on a computer, top-right on a phone.

# The Assets page (home)

This is where day-to-day work happens. The page title is "Assets" and the line
under it says "Choose an asset type to manage its records."

Each asset type is a card with an icon, its name, and "N assets". The icon is
picked automatically from the name: a type called *Laptop* gets a laptop,
*Printer* gets a printer, and anything unknown gets a plain box. You cannot
choose the icon yet.

Things you can do here:

| To | Do |
| --- | --- |
| Open a type | click its card |
| Find a type by name | type in the search box "Search asset types by name"; the count line shows "X of Y asset types" |
| Add an asset | press "+ Add Asset" |
| Create a new type | press "+ Add Asset Type", type a name such as "Laptop", press "Create Asset Type" |
| See who owns it | a card you do not own shows a blue "Shared" badge (admins do not see this badge) |

New notifications also appear as a dark strip at the top of this page. It shows
at most three and only when something is unread. "Dismiss all" marks them read.

## Add an asset in two steps

1. Assets page → "+ Add Asset".
2. In "Add Asset", type in the "Asset Type" box. Matching types appear under it
   as a list; click one. If the type does not exist and you are allowed to
   create types, the list shows **Create "your text"** — click it (or press
   Enter) and the type is made on the spot, with a "Asset type created
   successfully." message.
3. The form for that type opens, under the line "Adding a new <type> asset".
   Fill the fields; a red `*` marks required ones.
4. Press "Save <type name>". You get "Asset added successfully.", or
   "Asset added. 2 notifications queued." when an email rule fired.

If the type has no fields yet, the dialog tells you:
"No fields configured for this asset type yet." with a "Configure Form" link,
or — for a brand-new type — "The Common Form has no fields yet, so new asset
types start empty. Configure the Common Form to add default fields." Fixing
that is covered in "Build an asset type".

## Date fields

A date box accepts typing in `DD/MM/YYYY` (day first, Indian style) or the ▦
button, which opens a calendar. While you type, an incomplete date like `5/11`
is simply not saved yet — the box holds the last complete date. The app always
uses Indian dates, even if your computer is set to another country.

A field named "Current Date (Editable)" is a date that fills itself with
today's date when you open a **new** record. You may change it, and you may
clear it — the app does not push today's date back in. On an existing record it
never changes itself.

## Edit or delete an asset

Two ways to edit:

- **From the list (fast).** Open the type → press "Edit" at the end of the row
  → the same form opens in a popup → change the fields → "Save Changes". Close
  with "Cancel" or the round ✕. Nothing jumps you to another page: the list
  simply refreshes. A "View full page" link at the bottom opens the record
  itself.
- **On its own page.** Open the type → "Open →" (or click the row when you
  cannot edit) → record page → "Edit". The page is titled "Edit <type>" with a
  "← Back" link; after saving you return to the record page.

The record page shows the type name, the asset code under it, every field with
its value, and a line at the bottom "Created … · Updated … (IST)". "Delete" on
that page asks "Delete this asset? This action cannot be undone." and then
returns you to the type's list.

## Use the asset list

Open any asset type. The toolbar above the table has, from left to right,
"+ Add Asset", "Configure Form", "Export XLSX", "Automations", "Columns",
"Share" (admin), "Rename" and "Delete" — you only see the ones you are allowed
to use. On a phone this one row scrolls sideways; swipe it to reach the last
button.

The table shows one column per field marked "Show in Asset List".

| To | Do |
| --- | --- |
| Filter a column | click the column heading (it has a ▾). A list of every distinct value opens with a "Search <column>" box. Tick values; use "Select visible" to tick all shown, "Clear visible" to untick them, "Clear all" to drop that column's filter. The heading turns to ● when a filter is live. |
| See what is hidden | a strip above the table says "Showing 12 of 40 assets" with "Clear filters" |
| Change several at once | tick rows (the heading checkbox selects every row currently shown), pick "Update selected" and set one field to one value, or "Delete selected" and confirm |
| Export to Excel | press "Export XLSX" — you get the rows you can currently see, with the columns you have turned on |
| Sort | not in this table — sorting exists on the Reports page |

Two practical notes:

- A list shows up to 100 assets. If a type grows past that, use **Reports**
  (it loads every row) or filter first. Exports from this page are capped the
  same way.
- Bulk update cannot set a Quantity field. That is deliberate: quantity is a
  1–15 counter, not a text value.

# Build an asset type

A type is just a name plus a form. Do it in this order.

## 1. Name it

Assets page → "+ Add Asset Type" → "Create Asset Type" dialog → type the name
under "Asset Type Name" (placeholder "e.g. Laptop") → press "Create Asset
Type". The type appears as a card with 0 assets.

## 2. Put fields on its form

Open the type → "Configure Form".

- The dialog says "Configure Asset Form" and "Add, remove, require and reorder
  fields for this asset type."
- Pick an existing field from the "Add existing field..." dropdown and press
  "Add". It appears at the bottom of the list, not required, shown in the list.
- Each row has a number, the field name, its type, a "Required" box, a
  "Show in Asset List" box, "↑" and "↓" to move it, and "Remove".
- Press "Save form" when finished. Until you do, nothing is stored — closing
  with the ✕ throws the edits away.
- If the dropdown is empty, no reusable field exists yet. Create one under
  **Field Definitions** first, or add it to the **Common Form** (see below).

## 3. Decide what the table shows

Open the type → "Columns". The dialog "Customize Asset List" says "Choose which
fields should appear as columns in the asset list." Tick "Show", reorder with
"↑"/"↓", press "Save Columns".

## 4. Add automations (optional)

Open the type → "Automations". The section says "Automatically set one field
when another field meets a condition." Build one rule left to right:

| Box | Choices |
| --- | --- |
| "When field" | any field on this form |
| "Condition" | "is filled", "is empty", "is changed", "equals" |
| "Value" (only for "equals") | a dropdown of the source field's options, or a text box |
| "Set field" | any field on this form |
| "Action" | "Set a value", "Set today (Date)", "Clear (leave blank)" |
| "Value" (only for "Set a value") | matches the target field's type; labelled "Date" for a date target |

Press "Add Rule". Saved rules appear underneath as a sentence, for example
*When **Repair Status** is filled → set **Repair Date** to Today*. "Delete"
removes one after asking "Delete this automation?".

Set today (Date) is only useful on a date field — picking a date target for
"Set field" switches the action to it automatically.

What rules do in practice:

- They run while you type, so you see the result before saving, and again on
  the server when you save. The server's answer is what is stored.
- "is changed" compares with the value the record had before this editing
  session — on a new record, "is changed" means "you typed something".
- A rule that writes into a field will stop writing there if you edit that
  field by hand, until you change the trigger field again.
- Rules never touch a field that is not on this form; the builder only offers
  fields from this form.

## 5. Rename or delete a type

| Action | Path | What you see |
| --- | --- | --- |
| Rename | type → "Rename" | "Rename Asset Type" dialog, one "Asset Type Name" box, "Save" |
| Delete | type → "Delete" | "Delete Asset Type" dialog warning "This action cannot be undone. Asset types with existing assets cannot be deleted; delete those assets first." Tick "I understand this operation cannot be undone." and "Delete asset type" becomes clickable |

A type that still has assets cannot be deleted; the app will refuse until the
assets are gone.

## 6. Share a type with a colleague (admin)

Type → "Share". The dialog "Share this asset type" explains: shared users "see
the type in their list with its full form, fields and automations, and can add
or edit entries. Only you and admins can change its structure." Tick names in
the list (active non-admin users, except yourself; current shares are already
ticked) → "Save sharing". The person's Assets page now shows the card with a
"Shared" badge. Untick and save to revoke.

# Reusable building blocks

## Field Definitions

Menu → "Field Definitions". This is the library of questions a form can ask.
A field has three parts: a human name ("Serial Number"), an internal key
(`serial_number`), and a type.

Add one: "+ Add Field" → "Create Field" dialog.

- "Field Name" (placeholder "Serial Number") — what users see.
- "Internal Key" (placeholder `serial_number`, hint "Letters, numbers and
  underscores are recommended.") — what the API, email placeholders and rules
  use. Decide this before you collect data; changing it later breaks saved
  values.
- "Field Type" — choose one: "Short Text", "Multiline Text", "Mobile Number",
  "Number", "Quantity (1-15)", "Yes / No", "Date", "Current Date (Editable)",
  "Dropdown".
- "Dropdown Source" appears only for the Dropdown type: pick the option set.
- Press "Create field".

Which type to pick:

| Type | Use it for | What the user can enter |
| --- | --- | --- |
| Short Text | names, numbers on a label | one line |
| Multiline Text | remarks, descriptions | several lines |
| Mobile Number | phone | digits, optional leading `+`, spaces and dashes; 10–15 digits |
| Number | price, wattage | a number |
| Quantity (1-15) | count of items | `−` / `+` buttons, 1 to 15 only |
| Yes / No | working or not | "Yes", "No", or nothing |
| Date | purchase date | `DD/MM/YYYY` or the calendar |
| Current Date (Editable) | the day of this entry | today's date, already typed in; you may still change or clear it |
| Dropdown | fixed choices | only the options you defined |

Changing a type later: the app warns "This field is used by N form(s). You will
be shown a confirmation before the type is changed." Then it shows a "Confirm
type change" screen: what is changing, how many forms use it, and whether the
stored values can be converted — "N stored value(s) will be converted to the
new type." or "No stored values need converting." It also states whether
automation rules and email rules will keep working. Press "Confirm & migrate"
to go ahead; if the data cannot be converted the button does not appear and the
screen lists the problem values in a table ("Asset", "Type", "Current value",
"Why") so you can fix them first. "Back" cancels.

Delete: row → "Delete" → "Delete this field definition? It must not be in
use." A field used by any form cannot be deleted.

The list also shows "Owner" (admins only) and "Source" (the dropdown it uses) —
useful because two people may each have a field called *Serial Number*.

## Dropdowns

Menu → "Dropdowns" — "Reusable option sets."

1. "+ Add" → "Create Dropdown" dialog → "Dropdown Name" (placeholder
   "Department") → "Create Dropdown".
2. Select the dropdown in the left list; its name appears on the right with
   "Manage options. Changes are applied wherever this dropdown is used."
3. Add an option: "Label" is what the user picks ("Accounts"), "Value" is what
   is stored (`accounts`). Both are required → "Add option".
4. Change one: row → "Edit" → "Edit Dropdown Option" → "Save option".
5. Stop offering one: row → "Deactivate" (the status becomes "Inactive"). This
   is not a delete — old records that already hold that value still display it.
   There is no re-activate in this dialog; edit the option if you need to.
6. Rename the dropdown itself: "Edit name" → "Save name".

New options go to the end of the list; there is no manual ordering yet.

## Common Form

Menu → "Common Form". Fields chosen here are offered automatically to every
asset type, so put Serial Number, Brand and Purchase Date here once instead of
adding them to each type. The subtitle says "Fields selected here become
available automatically when creating an asset of any type."

- Rows work exactly like the asset-type form: "Required", "Show in Asset List",
  "↑", "↓", "Remove".
- Adding is one step: pick from "Add field to common form..." (options read
  "<name> · <type>") and it is added immediately.
- For a Quantity field the "Show in Asset List" box is greyed out and reads
  "Not a list column".
- Save with "Save common form" → "Common form saved successfully."
- Automations for the common form are edited on this same page, in the
  "Automations" section under it. Those rules apply everywhere; a type's own
  rules are applied after them.

### Copy to users (admin)

Common Form → "Copy to users". The dialog "Copy this common form to users"
says it "Puts an independent copy of your form — N field(s) and N automation
rule(s) — into their account. Any field or dropdown they do not have yet is
created in their name... Only users whose common form is still empty can
receive a copy, so nothing of theirs is ever overwritten."

Tick the people you want (anyone who already has a common form is dimmed and
labelled "has N field(s)"), press "Copy to N user(s)", then read the result
list: a green ✓ with "N fields, N rules copied (N new field(s))" or a red ✕
with the reason. Press "Done". The toast says "Copied to N user(s)." or
"Nothing was copied."

This is how you roll a standard form out to the office without giving anyone
else your data. After the copy, the two forms are separate — editing yours
never changes theirs.

# Reports

Menu → "Reports" — "View and analyze assets across every asset type." One
giant table: every asset you can see, from every type, in one place.

| Control | What it does |
| --- | --- |
| "Search any column..." | looks for the text in every visible column |
| Column heading | click to sort; ↕, ↑ or ↓ shows the direction |
| ● on a heading | opens the same value filter used in asset lists |
| "Customize Columns" | tick which columns to show. "Asset Type" cannot be unticked (marked "Required") |
| "Export XLSX" | downloads `asset-report.xlsx` containing exactly the rows and columns on screen |
| "Open →" | the record itself |

The count line reads "Showing 120 of 400 assets matching "laptop"" while you
filter. Loading takes a moment on a big office — it reads every type and every
page first. Nothing is stored server-side for reports: no saved report, no
scheduled export.

# Email notifications

Email is how the app tells people something happened without them watching a
screen. Three pieces, on one page: menu → "Email Notifications"
("Create templates, manage recipients, and set rules that email when assets
change."), with tabs "Templates", "Recipients", "Rules".

Work in this order: recipients → templates → rules. Then test.

## Recipients

"Recipients" tab → "+ New Recipient". Fill "Name" (optional) and "Email"
(required), leave "Active" ticked, press "Save recipient" → "Recipient saved."
These are external or internal addresses that should receive mails — they are
not app accounts. Deactivate one later by unticking "Active" in its edit
dialog.

## Templates

"Templates" tab → "+ New Template".

- "Name" — for yourself, e.g. "Laptop issued".
- "Subject" — the mail subject line.
- "Body" — plain text. Hint: "Plain text. Click any placeholder to insert it
  into the body."
- Under "General placeholders" are chips you click to insert:
  `{{asset_type_name}}`, `{{asset_public_id}}`, `{{created_at}}`,
  `{{updated_at}}`, `{{user.email}}`, `{{user.name}}`, `{{field.<key>}}`,
  `{{field.<key>.previous}}`.
- Under "Asset field placeholders" are chips for **your** real fields, grouped
  as "Common (all N asset types)" and "Other fields (specific asset types)".
  Clicking one inserts `{{field.serial_number}}` and so on. Tick
  "previous value (.previous)" first if you want the old value instead —
  useful for "was X, now Y" mails.
- "Active" controls whether rules may use it.
- "Save template" → "Template saved."

Example body:

```
{{asset_type_name}} {{asset_public_id}} was just recorded.
By: {{user.name}} ({{user.email}})
Serial: {{field.serial_number}}
Status went from {{field.status.previous}} to {{field.status}}
```

Note the double braces. Email templates use `{{...}}`; the Quick Entry
notification text uses single `{...}` because there the token is a field label,
not a key. Mixing them up leaves the braces in the message.

Rules for placeholders:

- A field that is not on the triggered asset renders as blank. The screen
  warns: "A field that isn't on the triggered asset renders blank, so use the
  common ones for shared rules."
- `.previous` only has meaning on a "field changes" rule; on a created rule
  there is no previous value, so it renders blank.
- Mail is plain text, so no bold, no links styled, no HTML.

## Rules

"Rules" tab → "+ New Rule".

1. "Asset types *" — tick one or more types. A rule can cover several types at
   once. This is a checkbox list, not a single dropdown.
2. "Trigger" — "When an asset is created" or "When a field changes".
3. For "When a field changes": "Field" (only fields that exist in **all** the
   types you ticked), then "Condition" — "Any change", "Equals value",
   "Not equals value", "Becomes filled", "Becomes empty" — and "Value" for the
   two "equals" choices.
4. "Template" — pick one of your active templates.
5. "Recipients *" — tick at least one person.
6. "Active" keeps the rule switched on.
7. "Save rule" (disabled while no recipient is ticked) → "Rule saved."

Row display is a summary you can read at a glance:
*Laptop, Printer · On "serial_number" Becomes filled · template "Laptop issued"
· 2 recipient(s)*.

### Test a rule

Press "Test" on the rule. The app sends a real mail right now, to that rule's
recipients, using the newest matching asset as the data. Success reads
"Test email sent to a@x.com, b@x.com." Use this before you rely on a rule; then
ask the recipients whether they actually got it.

### What makes a rule fire

- It fires when **you save** an asset (add, edit, or a bulk update), not when
  you merely type.
- It checks the value **before** and **after** this save, so "Becomes filled"
  needs the field to have been empty before.
- Automation-written values count: if a rule sets Service Date, an email rule
  watching Service Date fires.
- One mail per recipient list per event; the mail is queued, so a slow server
  delays it rather than losing it.
- Bulk updates queue one mail per asset.

## History and troubleshooting

Menu → "Email History" — "Every notification email queued from your asset
activity." Pick a "Status" (All statuses, Pending, Sending, Sent, Failed,
Cancelled); admins can tick "All users" to see everyone's. Press "Refresh" to
reload. Each row shows the status, the subject, and a line like
"Asset created · LAP-0007 · 01/11/2026, 4:12 PM". A failed row shows the error
in red. Click "Details" for the recipient, attempts, sent time and the exact
body that was stored. There is no retry button: the app retries failed mail by
itself, and gives up with a permanent error you can read here.

| Symptom | Cause | Fix |
| --- | --- | --- |
| No mail at all, nothing in History | no rule matched, or the rule/template is inactive | check the trigger condition; press "Test" |
| History shows "Pending" forever | mail server not configured or switched off | Settings → "SMTP (email delivery)", tick "Enabled", Save, then "Test connection" |
| "Failed" with an authentication error | wrong SMTP user/password | re-enter them in the SMTP card |
| Blank part of the body | that field is not on this asset type, or the key is wrong | use a Common field placeholder, or fix the key in Field Definitions |
| Old value missing in `.previous` | the rule is "asset created" | use a "field changes" rule |
| Nothing queued after a big bulk update | the fields you set are not watched by any rule | add the rule, or edit one asset to test |

# Quick Entry

Quick Entry lets a person submit something **without an account**. It does not
create an asset; it notifies the staff you choose.

## Configure it (admin)

Settings → "Quick Entry".

1. Tick the switch next to the heading — the word beside it flips between
   "Enabled" and "Disabled". Until it is enabled, no visitor sees the form.
2. "Form heading" (placeholder "Quick Entry") and "Sub-heading" (placeholder
   "Submit a request without signing in.") are the two lines the visitor sees.
3. Under "Form fields", press "+ Add field" per line. Each row: the label
   (placeholder "Field label"), a type of "Text" or "Long text", a "Required"
   box, an optional "Placeholder text shown inside the empty field (optional)",
   and "Remove". Order is the order the visitor sees; to reorder, remove and
   re-add.
4. "Notification the user receives" — write the message that arrives, using
   `{Field Label}` tokens (the chips under the help text list them) or `{all}`
   to list every answer the visitor gave. "Notification title" is the first
   line, e.g. `New entry: {Name}`; "Notification message" can stay empty,
   because empty means "list every filled field".
5. Tick "Let the person submitting choose who to notify (shows a name dropdown
   on the form)" if you want the visitor to pick.
6. Tick the users who may be notified, under "Notify these users".
7. "Save Quick Entry settings" → "Quick Entry settings saved."

The visitor's form is limited on purpose: at most 15 fields, a short answer up
to 200 characters, a long answer up to 2000. Anyone who can see the app can
only submit a handful of times in 15 minutes from one connection.

## Use it as a visitor

1. Open the app address without signing in. Beside the sign-in card you see the
   Quick Entry card with the heading and sub-heading the admin chose.
2. Fill the fields. Required ones carry a red `*`.
3. If a "Notify" dropdown is present, open it and tick at least one person —
   otherwise pressing "Submit" shows "Select at least one person to notify."
4. Complete the human verification box if it is shown.
5. Press "Submit". The card is replaced by
   "Your entry was submitted. The relevant people have been notified." and a
   "Submit another" button.

If the card is missing while a colleague can see it, the app is either switched
off for you or your network is not allowed in.

## See what visitors submitted

Submitted entries appear as **notifications**, not as assets: the notified
people see a bell badge and the dashboard strip. The bell panel groups
"New" and "Earlier"; click a row to read the full answers, click the circle to
mark one read, "Mark all read" for everything. The panel refreshes by itself
about every minute.

# Users and permissions (admin)

Menu → "Users" — "Create accounts, grant capabilities, deactivate or reset
passwords."

## Add a user

"+ Add User":

| Box | What to enter |
| --- | --- |
| "Email" | their login address |
| "Display Name" | optional; the name shown in the Quick Entry notify dropdown |
| "Temporary Password" | at least 10 characters. It is shown as plain text here on purpose, so you can tell it to someone |
| "Role" | "User (granted capabilities only)" or "Admin (full access)" |

For a User, tick their capabilities in the checklist and press "Create User".
The toast says "User created. They must change the password on first login."
Give the temporary password to the person; the app forces them to replace it.

## Capabilities

The checklist is grouped, and each tick box shows the technical name:

| Group | Names shown |
| --- | --- |
| Asset Types | `asset_types.view_own`, `asset_types.create_own`, `asset_types.edit_own`, `asset_types.delete_own` |
| Assets | `assets.view_own`, `assets.create_own`, `assets.edit_own`, `assets.delete_own`, `assets.bulk_own` |
| Configuration | `fields.manage_own`, `dropdowns.manage_own`, `common_form.manage_own`, `automations.manage_own` |
| Reports & Branding | `reports.view_own`, `reports.export_own`, `branding.manage` |
| Email Notifications | `email.templates.manage_own`, `email.rules.manage_own`, `email.history.view_own` |

In plain words: the first group controls creating and shaping asset types, the
second controls records, the third controls forms/fields/dropdowns/automations,
the fourth controls reports, exports and the app's own logo and name, the fifth
controls email. `_own` always means "their own copies", never everyone's.

A new user created with the User role comes with a sensible starting set; from
then on only what you tick applies. An admin needs none of them — an admin can
do everything.

Change them: row → "Permissions" (title "Permissions — <email>") → tick or
untick → "Save Permissions". The message reads "Permissions updated. They apply
on the user's next request."

## Other user actions

| Button | What happens |
| --- | --- |
| "Display name" | edit the name used in Quick Entry pickers; empty falls back to the email |
| "Reset password" | set a new "New Temporary Password" (10+ characters); they must change it at next login |
| "Make admin" / "Make user" | change the role (you cannot demote yourself) |
| "Deactivate" / "Reactivate" | block or unblock sign-in; data stays |
| "Delete" | asks "Delete <email>? All of their asset types, assets, fields, and dropdowns will be permanently deleted." |

Badges on each row: "you", the role, "deactivated", "must change password", and
a line such as "3 capabilities granted" or "Full access to everything".

# Settings

Menu → "Settings" — "Manage your account and application branding."

## Application branding

Settings → "Application branding" — "Upload a favicon and app icon for this
workspace." Two items, "Favicon" and "App icon", each with a "Choose image"
button and the note "PNG, JPG, GIF or SVG, max 2 MB". A too-large file is
refused with "Please choose an image smaller than 2 MB." Press "Save branding"
→ "Branding saved successfully." The browser tab icon updates immediately.
The app name and the install icon everywhere else (home screen, manifest) come
from this too.

## Turnstile (human verification)

Settings → "Turnstile (human verification)" — "Show a Cloudflare Turnstile
challenge on the sign-in and setup pages. Only applies in production." Tick or
untick "Require Turnstile verification"; "Save" stays grey until you change it.
The toast states "Turnstile is now enabled." or "Turnstile is now disabled."
If the server has no Turnstile keys, the card warns in red that turning it on
will block sign-in — read that warning before saving.

## Network restriction (IP allowlist)

Settings → "Network restriction (IP allowlist)" — "Only the addresses or
networks listed below can use this app. Anyone outside them gets a plain 404
(Not Found) — no login page, no message, nothing else."

1. "IP the server sees for you:" shows your current address. Press
   "Add to list" to put it in the box — do this **first**.
2. Choose what to restrict: "Restrict the whole app" (sign-in and every page)
   or "Restrict Quick Entry" (only the public form), or both.
3. "Allowed addresses" — one per line (commas also work). Four formats are
   accepted, as shown in the box: `192.168.1.23`, `192.168.1.0/24`,
   `10.0.0.5-10.0.0.40`, `192.168.7.*`. The hint shows how many of the allowed
   entries you have used.
4. "Save" → "Network restriction saved."

Before you keep a switch on, read the warnings this card gives you: if your own
address is not on the saved list, it says so and explains that this very page
would show 404 after you sign out. If the server has enforcement switched off,
it says the list "is saved but not applied". If some saved lines cannot be
read, it lists them — those lines are ignored, not applied.

The card also warns about Docker: run from a container behind a published port,
every visitor can look like the same gateway address, so a per-device rule will
not work. Check the "IP the server sees for you" value from a second device
before relying on it.

## SMTP (email delivery)

Settings → "SMTP (email delivery)" — "Global mail server used to deliver
notification emails. Admins only." A pill says "Configured" or "Not
configured".

| Box | Notes |
| --- | --- |
| "Host" | e.g. `smtp.gmail.com` |
| "Port" | 1–65535, default 587 |
| "Username" | the login, usually the full email address |
| "Password" | the app password. Once stored it says "Stored. Leave blank to keep, or type to replace." The password is never shown back to anyone |
| "From email" | required |
| "From name" | shown as the sender name |
| "Reply-To (optional)" | |
| "Use TLS/SSL (secure)" | tick for 465; leave unticked for 587 |
| "Enabled" | master switch — off means nothing is sent |

Then: "Save SMTP" ("SMTP settings saved."), "Test connection"
("SMTP connection OK."), "Clear password" (asks "Remove the stored SMTP
password?"), and "Send test email" with a "Send a test email to" box
("Test email sent to <address>."; greyed until the server is configured).

For Gmail, use an app password, not the normal one. Ask your mail provider for
the host, port and whether TLS is needed — the settings page for a mail server
is not this app.

## Change password

The same card as described near the start: "Current password", "New password",
"Confirm new password", "Change password".

# Using the app on a phone

- The sidebar is replaced by a top bar with the page name, the bell and
  "Logout", and a row of menu tabs you can swipe sideways.
- The asset-type toolbar is one swipeable line: buttons keep their full labels
  and the row scrolls, instead of stacking into four rows.
- Dialog buttons stack with the main action on top.
- Tables scroll sideways; every field still has its column.
- Date fields open the phone's own picker through the ▦ button, and the
  "Mobile Number" field brings up the numeric keypad.
- You can install the app to the home screen (PWA) from the browser menu, which
  gives it its own icon and window. Install only appears on HTTPS or on
  `localhost`; over a plain `http://192.168.x.x` address the browser will not
  offer it, which is a browser rule and not a fault in the app.
- The app is not an offline tool. Without a network the screens will not load
  real data.

# Habits that keep the data clean

1. Agree field names and keys before anyone records data. A renamed key is a
   broken email template.
2. Put shared fields in the Common Form; per-type oddities stay in the type.
3. Keep one owner per asset type, and use "Share" rather than duplicating a
   type for a colleague.
4. Use Dropdowns instead of free text wherever the answer comes from a fixed
   list — filters, reports and exports all read better.
5. Test an email rule with "Test" before you depend on it, and check Email
   History once after go-live.
6. Never delete a user who owns data unless you mean to lose that data.
7. Take a database backup before a big change (see the operations document).

# Short answers to common questions

| Question | Answer |
| --- | --- |
| Can two people have a field with the same name? | Yes — they are separate fields. Use the Owner column to tell them apart |
| Can I see another person's assets? | Only if they shared that asset type with you, or you are an admin |
| Why is a button I saw on my colleague's screen missing? | You do not have that capability; ask an admin |
| Can I undo an edit? | No. There is no history of asset values — keep the old value in a field if it matters |
| Can I import from Excel? | No. There is export only |
| Can I print a record? | Use the browser's own print on the record page |
| Can I get a mail every day with a summary? | No scheduled mail; rules fire on saves only |
| Is the time shown in my local time? | Dates and times are Indian (IST) everywhere, by design |
| Why did the app show a 404 on a page that exists? | Your network may not be on the allowlist — that is the intended behaviour of the restriction |
| Is my data safe if the server restarts? | Yes, it is in MySQL. Restarts re-check the structure only; see the operations document |
