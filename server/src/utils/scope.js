// Owner-scoping helper. Admin gets an explicit empty scope (sees everything);
// regular users are always restricted to their own rows.
export function ownerScope(actor, column = "owner_user_id") {
  return actor.isAdmin
    ? { sql: "", params: [] }
    : { sql: ` AND ${column} = ?`, params: [actor.id] };
}

// Type-access scope for `asset_types` (aliased `alias`, default `at`).
// A user may access a type they own OR that a super admin shared with them.
// Admin sees everything. Used to replace the old owner-only filter so that
// shared types (and their forms, fields and automations) become usable.
export function accessibleTypesSql(actor, alias = "at") {
  return actor.isAdmin
    ? { sql: "", params: [] }
    : {
        sql: ` AND (${alias}.owner_user_id = ? OR EXISTS (SELECT 1 FROM asset_type_shares ats WHERE ats.asset_type_id = ${alias}.id AND ats.user_id = ?))`,
        params: [actor.id, actor.id],
      };
}

// Asset-access scope for `assets` (aliased `alias`, default `assets`).
// A user may touch every asset that lives in a type they own or that was
// shared with them (shared types are a common pool participants can all edit),
// plus, for backward compatibility, any asset they personally created.
// Admin sees everything.
export function assetAccessSql(actor, alias = "assets") {
  return actor.isAdmin
    ? { sql: "", params: [] }
    : {
        sql: ` AND (${alias}.owner_user_id = ? OR EXISTS (SELECT 1 FROM asset_types at_acc WHERE at_acc.id = ${alias}.asset_type_id AND (at_acc.owner_user_id = ? OR EXISTS (SELECT 1 FROM asset_type_shares ats WHERE ats.asset_type_id = at_acc.id AND ats.user_id = ?))))`,
        params: [actor.id, actor.id, actor.id],
      };
}
