import { pool } from '../server/src/config/db.js';
const [keep] = await pool.execute(
  'SELECT atf.id, f.`key` AS k, f.name, f.type, atf.required, atf.show_in_list, atf.display_order, f.dropdown_id ' +
    'FROM asset_type_fields atf ' +
    'JOIN asset_types at ON at.id = atf.asset_type_id ' +
    'JOIN field_definitions f ON f.id = atf.field_definition_id ' +
    'WHERE atf.asset_type_id = 27 AND f.owner_user_id = at.owner_user_id ' +
    'ORDER BY atf.display_order',
);
console.log('surviving Charger rows:', keep.length);
for (const r of keep)
  console.log(`  #${r.id} ${r.k} (${r.name}/${r.type}) req=${r.required} show=${r.show_in_list} order=${r.display_order}`);
await pool.end();
