import { pool } from '../server/src/config/db.js';
const [types] = await pool.execute(
  'SELECT at.id, at.name, at.owner_user_id, u.email AS owner_email, ' +
    '(SELECT COUNT(*) FROM asset_type_fields x WHERE x.asset_type_id = at.id) AS field_rows ' +
    'FROM asset_types at JOIN users u ON u.id = at.owner_user_id ORDER BY at.id',
);
for (const t of types) {
  const [rows] = await pool.execute(
    'SELECT f.`key` AS k, f.owner_user_id AS def_owner, e.email AS def_owner_email ' +
      'FROM asset_type_fields atf JOIN field_definitions f ON f.id = atf.field_definition_id ' +
      'JOIN users e ON e.id = f.owner_user_id WHERE atf.asset_type_id = ? ORDER BY atf.display_order',
    [t.id],
  );
  const foreign = rows.filter((r) => Number(r.def_owner) !== Number(t.owner_user_id));
  console.log(
    `#${t.id} ${t.name} owner=${t.owner_email} rows=${t.field_rows} foreignRows=${foreign.length}` +
      (foreign.length ? ' -> ' + foreign.map((r) => `${r.k}(${r.def_owner_email})`).join(' ') : ''),
  );
}
await pool.end();
