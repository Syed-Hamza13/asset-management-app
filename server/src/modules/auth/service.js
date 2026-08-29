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
    const [result] = await pool.execute('INSERT INTO users (email, password_hash) VALUES (?, ?)', [email, passwordHash]);
    return { id: result.insertId, email };
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') throw new AppError(409, 'SETUP_COMPLETED', 'Initial setup has already been completed.');
    throw error;
  }
}

export async function authenticate(email, password) {
  const [rows] = await pool.execute('SELECT id, email, password_hash FROM users WHERE email = ? LIMIT 1', [email]);
  if (!rows.length) return null;
  const user = rows[0];
  const valid = await argon2.verify(user.password_hash, password);
  return valid ? { id: user.id, email: user.email } : null;
}

export async function changePassword(userId, currentPassword, newPassword) {
  const [rows] = await pool.execute('SELECT password_hash FROM users WHERE id = ? LIMIT 1', [userId]);
  if (!rows.length || !(await argon2.verify(rows[0].password_hash, currentPassword))) throw new AppError(400, 'INVALID_CURRENT_PASSWORD', 'Current password is incorrect.');
  const passwordHash = await argon2.hash(newPassword, { type: argon2.argon2id });
  await pool.execute('UPDATE users SET password_hash = ? WHERE id = ?', [passwordHash, userId]);
}
