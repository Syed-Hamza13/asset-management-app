// Read-only diagnosis: why auto_date does not prefill/persist for non-admin users.
import { pool } from '../server/src/config/db.js';
import { applyAutomationRules } from '../shared/automationRules.js';

const defCache = new Map();
async function defById(id) {
  if (defCache.has(id)) return defCache.get(id);
  const [r] = await pool.execute("SELECT id, `key` AS k, type FROM field_definitions WHERE id = ?", [id]);
  const v = r[0] || null;
  defCache.set(id, v);
  return v;
}

const [users] = await pool.execute(
  'SELECT u.id, u.email, u.role, cf.id AS form_id FROM users u LEFT JOIN common_forms cf ON cf.owner_user_id = u.id ORDER BY u.id',
);

for (const u of users) {
  const [defs] = await pool.execute(
    "SELECT id, `key` AS k, name, type FROM field_definitions WHERE owner_user_id = ? AND type = 'auto_date' AND is_active = 1",
    [u.id],
  );
  if (!defs.length) {
    console.log(`user #${u.id} ${u.email} (${u.role}) - auto_date definitions: 0`);
    continue;
  }
  console.log(`\nuser #${u.id} ${u.email} (${u.role})`);
  const [types] = await pool.execute(
    'SELECT id, name FROM asset_types WHERE owner_user_id = ? ORDER BY id',
    [u.id],
  );
  for (const t of types) {
    const [fields] = await pool.execute(
      'SELECT f.id, f.`key` AS k, f.type FROM asset_type_fields atf JOIN field_definitions f ON f.id = atf.field_definition_id ' +
        'WHERE atf.asset_type_id = ? AND f.is_active = 1 ORDER BY atf.display_order',
      [t.id],
    );
    const dateFields = fields.filter((f) => f.type === 'auto_date');
    if (!dateFields.length) continue;
    const keys = new Set(fields.map((f) => f.k));
    const byId = new Map(fields.map((f) => [Number(f.id), f]));
    // merged rules exactly as getEffectiveAutomations builds them for the owner actor
    const ruleRows = await rulesFor(u.id, t.id, byId, keys);
    const [assets] = await pool.execute('SELECT COUNT(*) c FROM assets WHERE asset_type_id = ?', [t.id]);
    console.log(
      `  type #${t.id} ${t.name}: assets=${assets[0].c} auto_date=[${dateFields.map((f) => f.k).join(',')}] rules=${ruleRows.length}`,
    );
    for (const r of ruleRows)
      console.log(`     rule #${r.id} ${r.scope}: ${r.sourceKey} ${r.conditionType}${r.conditionValue ? `(${r.conditionValue})` : ''} -> ${r.targetKey} ${r.actionType}${r.actionValue ? `(${r.actionValue})` : ''}`);
    // simulate: client prefills today, then the server create pass runs
    const values = Object.fromEntries(fields.map((f) => [f.k, '']));
    for (const f of dateFields) values[f.k] = '2026-10-31';
    const out = applyAutomationRules(ruleRows, values, {});
    for (const f of dateFields)
      if (out[f.k] !== values[f.k])
        console.log(`     >>> on create the server CLEARS ${f.k}: '${values[f.k]}' -> '${out[f.k]}'`);
  }
}
await pool.end();

async function rulesFor(ownerId, typeId, byId, keys) {
  const out = [];
  // common-form rules of this owner
  const [cf] = await pool.execute('SELECT id FROM common_forms WHERE owner_user_id = ? LIMIT 1', [ownerId]);
  if (cf.length) {
    const [rows] = await pool.execute(
      'SELECT cfa.id, cfa.source_field_id, cfa.condition_type, cfa.condition_value, cfa.target_field_id, cfa.action_type, cfa.action_value ' +
        'FROM common_form_automations cfa WHERE cfa.common_form_id = ? AND cfa.is_active = 1 ORDER BY cfa.id',
      [cf[0].id],
    );
    for (const r of rows) {
      const s = await defById(r.source_field_id);
      const t = await defById(r.target_field_id);
      if (!s || !t) continue;
      if (!keys.has(s.k) || !keys.has(t.k)) continue; // same filter the API applies
      out.push({ id: r.id, scope: 'common', sourceKey: s.k, conditionType: r.condition_type, conditionValue: r.condition_value, targetKey: t.k, targetType: t.type, actionType: r.action_type, actionValue: r.action_value });
    }
  }
  const [arows] = await pool.execute(
    'SELECT id, source_field_id, condition_type, condition_value, target_field_id, action_type, action_value FROM asset_automations WHERE asset_type_id = ? AND is_active = 1 ORDER BY id',
    [typeId],
  );
  for (const r of arows) {
    const s = byId.get(Number(r.source_field_id));
    const t = byId.get(Number(r.target_field_id));
    if (!s || !t || !keys.has(s.k) || !keys.has(t.k)) continue;
    out.push({ id: r.id, scope: 'asset_type', sourceKey: s.k, conditionType: r.condition_type, conditionValue: r.condition_value, targetKey: t.k, targetType: t.type, actionType: r.action_type, actionValue: r.action_value });
  }
  return out;
}
