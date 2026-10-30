import { pool } from '../server/src/config/db.js';

const [fields] = await pool.execute(
  'SELECT atf.display_order AS o, f.`key` AS k, f.type AS t, atf.required AS req ' +
    'FROM asset_type_fields atf JOIN field_definitions f ON f.id = atf.field_definition_id ' +
    'WHERE atf.asset_type_id = 27 ORDER BY atf.display_order',
);
console.log('Charger (#27) fields:', fields.map((f) => `${f.o}:${f.k}(${f.t}${f.req ? ',req' : ''})`).join(' '));

const [rules] = await pool.execute(
  'SELECT cfa.id, sf.`key` AS source, cfa.condition_type AS cond, tf.`key` AS target, cfa.action_type AS act, cfa.action_value AS val, cfa.is_active AS on1 ' +
    'FROM common_form_automations cfa ' +
    "JOIN common_forms cf ON cf.id = cfa.common_form_id JOIN users u ON u.id = cf.owner_user_id " +
    'LEFT JOIN field_definitions sf ON sf.id = cfa.source_field_id LEFT JOIN field_definitions tf ON tf.id = cfa.target_field_id ' +
    "WHERE u.email = 'syed13hamza@gmail.com' ORDER BY cfa.id",
);
console.log('Charger owner common rules:');
for (const r of rules) console.log(`  #${r.id} ${r.source} ${r.cond} -> ${r.target} = ${r.act}:${r.val} active=${r.on1}`);

const [assets] = await pool.execute(
  "SELECT COUNT(*) AS c FROM assets WHERE asset_type_id = 27",
);
console.log('Charger assets:', assets[0].c);
await pool.end();
