import argon2 from 'argon2';
import { pool, withTransaction } from '../../config/db.js';
import { AppError } from '../../utils/errors.js';
import { assertIntegerId } from '../../utils/validation.js';
import { ALL_CAPABILITIES, DEFAULT_PERMISSIONS } from './capabilities.js';

export async function listUsers() {
  const [users] = await pool.execute(
    'SELECT id, email, display_name, role, is_active, must_change_password, created_at FROM users ORDER BY email ASC',
  );
  const [perms] = await pool.execute('SELECT user_id, capability FROM user_permissions');
  const byUser = new Map();
  for (const row of perms) {
    if (!byUser.has(row.user_id)) byUser.set(row.user_id, []);
    byUser.get(row.user_id).push(row.capability);
  }
  return users.map((user) => ({
    id: user.id,
    email: user.email,
    displayName: user.display_name || null,
    role: user.role,
    isActive: Boolean(user.is_active),
    mustChangePassword: Boolean(user.must_change_password),
    createdAt: user.created_at,
    permissions: user.role === 'admin' ? [...ALL_CAPABILITIES] : byUser.get(user.id) || [],
  }));
}

function normalizePermissions(input) {
  if (input === undefined) return DEFAULT_PERMISSIONS;
  if (!Array.isArray(input)) throw new AppError(400, 'INVALID_PERMISSIONS', 'Permissions must be an array.');
  const invalid = input.filter((capability) => !ALL_CAPABILITIES.includes(capability));
  if (invalid.length) throw new AppError(400, 'INVALID_PERMISSIONS', `Unknown capabilities: ${invalid.join(', ')}`);
  return [...new Set(input)];
}

function normalizeDisplayName(input) {
  if (input === undefined || input === null) return null;
  if (typeof input !== 'string') throw new AppError(400, 'INVALID_DISPLAY_NAME', 'Display name must be a string.');
  const cleaned = input.replace(/[\u0000-\u001F\u007F]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 100);
  return cleaned || null;
}

export async function createUser({ email, password, role = 'user', permissions, displayName }) {
  const normalizedEmail = String(email || '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) throw new AppError(400, 'INVALID_EMAIL', 'Email is invalid.');
  if (typeof password !== 'string' || password.length < 10 || password.length > 200) throw new AppError(400, 'INVALID_PASSWORD', 'Password must be at least 10 characters.');
  if (!['admin', 'user'].includes(role)) throw new AppError(400, 'INVALID_ROLE', 'Role must be admin or user.');
  const caps = role === 'admin' ? [] : normalizePermissions(permissions);
  const passwordHash = await argon2.hash(password, { type: argon2.argon2id });
  try {
    let newId;
    await withTransaction(async (conn) => {
      const [result] = await conn.execute(
        'INSERT INTO users (email, display_name, password_hash, role, is_active, must_change_password) VALUES (?, ?, ?, ?, 1, 1)',
        [normalizedEmail, normalizeDisplayName(displayName), passwordHash, role],
      );
      newId = result.insertId;
      for (const capability of caps) {
        await conn.execute('INSERT INTO user_permissions (user_id, capability) VALUES (?, ?)', [newId, capability]);
      }
    });
    return (await listUsers()).find((user) => user.id === newId);
  } catch (e) {
    if (e.code === 'ER_DUP_ENTRY') throw new AppError(409, 'USER_EXISTS', 'A user with this email already exists.');
    throw e;
  }
}

async function getUserOr404(id) {
  const idN = assertIntegerId(id, 'user id');
  const [rows] = await pool.execute('SELECT id, email, role, is_active FROM users WHERE id = ? LIMIT 1', [idN]);
  if (!rows.length) throw new AppError(404, 'USER_NOT_FOUND', 'User not found.');
  return rows[0];
}

export async function updateUser(actor, id, { isActive, role, displayName }) {
  const target = await getUserOr404(id);
  if (Number(target.id) === Number(actor.id)) {
    if (isActive === false) throw new AppError(400, 'CANNOT_DEACTIVATE_SELF', 'You cannot deactivate your own account.');
    if (role && role !== 'admin') throw new AppError(400, 'CANNOT_DEMOTE_SELF', 'You cannot remove your own admin role.');
  }
  if (role !== undefined && !['admin', 'user'].includes(role)) throw new AppError(400, 'INVALID_ROLE', 'Role must be admin or user.');
  if (role === 'user' && target.role === 'admin') {
    const [[adminCount]] = await pool.execute("SELECT COUNT(*) AS count FROM users WHERE role = 'admin' AND is_active = 1");
    if (Number(adminCount.count) <= 1) throw new AppError(400, 'LAST_ADMIN', 'At least one active admin must remain.');
  }
  const sets = [];
  const params = [];
  if (isActive !== undefined) { sets.push('is_active = ?'); params.push(Boolean(isActive)); }
  if (role !== undefined) { sets.push('role = ?'); params.push(role); }
  if (displayName !== undefined) { sets.push('display_name = ?'); params.push(normalizeDisplayName(displayName)); }
  if (!sets.length) return (await listUsers()).find((user) => user.id === Number(target.id));
  await pool.execute(`UPDATE users SET ${sets.join(', ')} WHERE id = ?`, [...params, target.id]);
  return (await listUsers()).find((user) => user.id === Number(target.id));
}

export async function resetUserPassword(actor, id, newPassword) {
  const target = await getUserOr404(id);
  if (typeof newPassword !== 'string' || newPassword.length < 10 || newPassword.length > 200) throw new AppError(400, 'INVALID_PASSWORD', 'Password must be at least 10 characters.');
  const passwordHash = await argon2.hash(newPassword, { type: argon2.argon2id });
  await pool.execute('UPDATE users SET password_hash = ?, must_change_password = 1 WHERE id = ?', [passwordHash, target.id]);
  return (await listUsers()).find((user) => user.id === Number(target.id));
}

export async function setUserPermissions(actor, id, permissions) {
  const target = await getUserOr404(id);
  if (target.role === 'admin') throw new AppError(400, 'ADMIN_HAS_ALL', 'Admins always have every capability.');
  const caps = normalizePermissions(permissions ?? []);
  await withTransaction(async (conn) => {
    await conn.execute('DELETE FROM user_permissions WHERE user_id = ?', [target.id]);
    for (const capability of caps) {
      await conn.execute('INSERT INTO user_permissions (user_id, capability) VALUES (?, ?)', [target.id, capability]);
    }
  });
  return (await listUsers()).find((user) => user.id === Number(target.id));
}

export async function deleteUser(actor, id) {
  const target = await getUserOr404(id);
  if (Number(target.id) === Number(actor.id)) throw new AppError(400, 'CANNOT_DELETE_SELF', 'You cannot delete your own account.');
  if (target.role === 'admin') {
    const [[adminCount]] = await pool.execute("SELECT COUNT(*) AS count FROM users WHERE role = 'admin' AND is_active = 1");
    if (Number(adminCount.count) <= 1) throw new AppError(400, 'LAST_ADMIN', 'At least one active admin must remain.');
  }
  // Several child FKs are ON DELETE RESTRICT (assets->asset_types,
  // dropdown_options->dropdowns, *_fields->field_definitions), so a bare
  // cascade from users is not reliably ordered. Delete owned rows children-first.
  await withTransaction(async (conn) => {
    const ownerId = target.id;
    // Email tables first: email_rules -> email_templates is ON DELETE RESTRICT.
    await conn.execute('DELETE FROM email_outbox WHERE owner_user_id = ?', [ownerId]);
    await conn.execute('DELETE err FROM email_rule_recipients err JOIN email_rules er ON er.id = err.rule_id WHERE er.owner_user_id = ?', [ownerId]);
    await conn.execute('DELETE FROM email_rules WHERE owner_user_id = ?', [ownerId]);
    await conn.execute('DELETE FROM email_templates WHERE owner_user_id = ?', [ownerId]);
    await conn.execute('DELETE FROM email_recipients WHERE owner_user_id = ?', [ownerId]);
    await conn.execute('DELETE do FROM dropdown_options do JOIN dropdowns d ON d.id = do.dropdown_id WHERE d.owner_user_id = ?', [ownerId]);
    await conn.execute('DELETE FROM assets WHERE owner_user_id = ?', [ownerId]);
    await conn.execute('DELETE atf FROM asset_type_fields atf JOIN asset_types at ON at.id = atf.asset_type_id WHERE at.owner_user_id = ?', [ownerId]);
    await conn.execute('DELETE aa FROM asset_automations aa JOIN asset_types at ON at.id = aa.asset_type_id WHERE at.owner_user_id = ?', [ownerId]);
    await conn.execute('DELETE cff FROM common_form_fields cff JOIN common_forms cf ON cf.id = cff.common_form_id WHERE cf.owner_user_id = ?', [ownerId]);
    await conn.execute('DELETE cfa FROM common_form_automations cfa JOIN common_forms cf ON cf.id = cfa.common_form_id WHERE cf.owner_user_id = ?', [ownerId]);
    await conn.execute('DELETE FROM asset_types WHERE owner_user_id = ?', [ownerId]);
    await conn.execute('DELETE FROM common_forms WHERE owner_user_id = ?', [ownerId]);
    await conn.execute('DELETE FROM field_definitions WHERE owner_user_id = ?', [ownerId]);
    await conn.execute('DELETE FROM dropdowns WHERE owner_user_id = ?', [ownerId]);
    await conn.execute('DELETE FROM users WHERE id = ?', [ownerId]);
  });
}
