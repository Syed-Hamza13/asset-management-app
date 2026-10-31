-- Repair: a super admin who added an asset to a type owned by another user had
-- their own common-form fields attached to that type, so its add-form showed
-- every field twice (e.g. Charger had 13 rows for 6 real fields).
-- assets/service.js now substitutes the type owner for every actor, so nothing
-- new can be injected. This removes the historical rows: an attachment whose
-- field definition belongs to a different user than the asset type's owner.
-- Asset values are untouched; keys that only these rows defined simply stop
-- rendering (updateAsset keeps them as legacy values).
DELETE atf
  FROM asset_type_fields atf
  JOIN asset_types at ON at.id = atf.asset_type_id
  JOIN field_definitions f ON f.id = atf.field_definition_id
 WHERE f.owner_user_id <> at.owner_user_id;
