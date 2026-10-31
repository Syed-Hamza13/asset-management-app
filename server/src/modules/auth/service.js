import argon2 from 'argon2';
import { pool } from '../../config/db.js';
import { AppError } from '../../utils/errors.js';

export async function countUsers() {
  const [rows] = await pool.execute('SELECT COUNT(*) AS count FROM users');
  return Number(rows[0].count);
}

export async function createAdmin(email, password) {
  if (await countUsers() > 0) throw new AppError(403, 'SETUP_COMPLETED', 'Initial setup has already been completed.');
  const passwordHash = await argon2.hash(password, { type: argon2.argon2id });
  try {
    const [result] = await pool.execute("INSERT INTO users (email, password_hash, role) VALUES (?, ?, 'admin')", [email, passwordHash]);
    return { id: result.insertId, email };
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') throw new AppError(409, 'SETUP_COMPLETED', 'Initial setup has already been completed.');
    throw error;
  }
}

export async function authenticate(email, password) {
  const [rows] = await pool.execute('SELECT id, email, password_hash, role, is_active FROM users WHERE email = ? LIMIT 1', [email]);
  if (!rows.length) return null;
  const user = rows[0];
  if (!user.is_active) return null;
  const valid = await argon2.verify(user.password_hash, password);
  return valid ? { id: user.id, email: user.email, role: user.role } : null;
}

export async function changePassword(userId, currentPassword, newPassword) {
  const [rows] = await pool.execute('SELECT password_hash FROM users WHERE id = ? LIMIT 1', [userId]);
  if (!rows.length || !(await argon2.verify(rows[0].password_hash, currentPassword))) throw new AppError(400, 'INVALID_CURRENT_PASSWORD', 'Current password is incorrect.');
  const passwordHash = await argon2.hash(newPassword, { type: argon2.argon2id });
  await pool.execute('UPDATE users SET password_hash = ?, must_change_password = 0 WHERE id = ?', [passwordHash, userId]);
}

export async function getUserProfile(userId) {
  const [rows] = await pool.execute('SELECT id, email, role, is_active, must_change_password FROM users WHERE id = ? LIMIT 1', [userId]);
  if (!rows.length || !rows[0].is_active) return null;
  const user = rows[0];
  let permissions = [];
  if (user.role !== 'admin') {
    const [permRows] = await pool.execute('SELECT capability FROM user_permissions WHERE user_id = ?', [user.id]);
    permissions = permRows.map((row) => row.capability);
  }
  return {
    id: user.id,
    email: user.email,
    role: user.role,
    permissions,
    mustChangePassword: Boolean(user.must_change_password),
  };
}
