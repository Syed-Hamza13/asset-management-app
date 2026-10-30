// Read-only check of the real server create path for the owner of Charger (#27),
// using their own rules from the database. Writes nothing.
import { pool } from '../server/src/config/db.js';
import { applyAutomations } from '../server/src/modules/assets/automation.js';
import { applyCommonAutomations } from '../server/src/modules/commonForms/automationService.js';
import { automationToday } from '../shared/automationRules.js';

const actor = { id: 10, email: 'syed13hamza@gmail.com', role: 'user', isAdmin: false, permissions: [] };
const TYPE = 27;

const base = { name: 'Probe', model: '', user: '', date_of_issue: '', mobile_no: '', status: '' };

// 1. form prefills today, user leaves it untouched and saves
const prefilled = { ...base, date_of_issue: automationToday() };
const out1 = await applyAutomations(actor, TYPE, await applyCommonAutomations(actor, prefilled));
console.log(`prefilled date  -> stored: "${out1.date_of_issue}"  status: "${out1.status}"`);

// 2. user deliberately clears the date before saving
const cleared = { ...base, date_of_issue: '' };
const out2 = await applyAutomations(actor, TYPE, await applyCommonAutomations(actor, cleared));
console.log(`cleared date    -> stored: "${out2.date_of_issue}"  status: "${out2.status}"`);

// 3. user filled -> status=issued must still work, date untouched
const issued = { ...base, user: 'Ram', date_of_issue: automationToday() };
const out3 = await applyAutomations(actor, TYPE, await applyCommonAutomations(actor, issued));
console.log(`user filled     -> date: "${out3.date_of_issue}"  status: "${out3.status}"`);

// 4. edit path: stored asset has a date and blank user, another field changes
const stored = { name: 'Probe', model: 'A', user: '', date_of_issue: '2026-10-05', mobile_no: '', status: 'stock' };
const incoming = { ...stored, model: 'B' };
const out4 = await applyAutomations(
  actor,
  TYPE,
  await applyCommonAutomations(actor, incoming, stored),
  stored,
);
console.log(`edit (saved date) -> date: "${out4.date_of_issue}"`);

// committed rows must be unchanged
const [r] = await pool.execute('SELECT COUNT(*) c FROM assets WHERE asset_type_id = ?', [TYPE]);
console.log('Charger assets still in DB:', r[0].c);
await pool.end();
