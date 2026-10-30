// Read-only audit: asset_type_fields rows whose field definition belongs to a
// different user than the asset type's owner. Prints a restore script for the
// rows a repair migration would remove. Not part of the app; safe to delete.
import { pool } from '../server/src/config/db.js';

const [rows] = await pool.execute(
  `SELECT atf.id, atf.asset_type_id, at.owner_user_id AS type_owner, at.name AS type_name,
          atf.field_definition_id, f.\`key\` AS field_key, f.name AS field_name,
          f.type AS field_type, f.owner_user_id AS field_owner, fu.email AS field_owner_email,
          atf.required, atf.show_in_list, atf.display_order, atf.created_at
     FROM asset_type_fields atf
     JOIN asset_types at ON at.id = atf.asset_type_id
     JOIN field_definitions f ON f.id = atf.field_definition_id
     JOIN users fu ON fu.id = f.owner_user_id
    WHERE f.owner_user_id <> at.owner_user_id
    ORDER BY atf.asset_type_id, atf.display_order`,
);

const [assetsHolding] = await pool.execute(
  `SELECT at.id AS asset_type_id, at.name AS type_name, COUNT(*) AS assets
     FROM assets a JOIN asset_types at ON at.id = a.asset_type_id
    GROUP BY at.id`,
);

const orphanKeys = new Map();
for (const row of rows) {
  const [hits] = await pool.execute(
    `SELECT COUNT(*) AS n FROM assets a
      WHERE a.asset_type_id = ? AND JSON_CONTAINS_PATH(a.values_json, 'one', CONCAT('$."', ?, '"'))`,
    [row.asset_type_id, row.field_key],
  );
  orphanKeys.set(row.id, Number(hits[0].n));
}

console.log('foreign-owned attachment rows:', rows.length);
for (const row of rows) {
  console.log(
    `atf#${row.id} type=${row.type_name}(${row.asset_type_id}) owner=${row.type_owner} ` +
      `field=${row.field_key}/${row.field_name} (${row.field_type}) defOwner=${row.field_owner}<${row.field_owner_email}> ` +
      `order=${row.display_order} required=${row.required} show=${row.show_in_list} ` +
      `assetsStoringThisKey=${orphanKeys.get(row.id)}`,
  );
}

const restore = rows
  .map(
    (r) =>
      `INSERT INTO asset_type_fields (id, asset_type_id, field_definition_id, required, show_in_list, display_order) VALUES (${r.id}, ${r.asset_type_id}, ${r.field_definition_id}, ${r.required ? 1 : 0}, ${r.show_in_list ? 1 : 0}, ${r.display_order});`,
  )
  .join('\n');
console.log('\n-- restore script --\n' + (restore || '-- nothing to restore --'));
console.log('\ntypes and asset counts:', JSON.stringify(assetsHolding));

await pool.end();
