// Owner-scoping helper. Admin gets an explicit empty scope (sees everything);
// regular users are always restricted to their own rows.
export function ownerScope(actor, column = "owner_user_id") {
  return actor.isAdmin
    ? { sql: "", params: [] }
    : { sql: ` AND ${column} = ?`, params: [actor.id] };
}
