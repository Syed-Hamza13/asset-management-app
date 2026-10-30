import { pool } from '../server/src/config/db.js';
const [cols] = await pool.execute('SHOW COLUMNS FROM common_form_automations');
console.log('columns:', cols.map((c) => c.Field).join(', '));
const [rows] = await pool.query(
  'SELECT cfa.*, u.email AS owner_email FROM common_form_automations cfa ' +
    'JOIN common_forms cf ON cf.id = cfa.common_form_id JOIN users u ON u.id = cf.owner_user_id',
);
console.log('rows:', rows.length);
for (const r of rows) console.log(' ', JSON.stringify(r));
await pool.end();
