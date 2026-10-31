import { pool } from '../../config/db.js';
import { AppError } from '../../utils/errors.js';
import { assertIntegerId } from '../../utils/validation.js';

function shape(row) {
  let body = row.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch { /* keep as string */ }
  }
  return {
    id: row.id,
    kind: row.kind,
    entryId: row.entry_id,
    title: row.title,
    body,
    isRead: Boolean(row.is_read),
    createdAt: row.created_at,
  };
}

export async function listNotifications(actor, { unreadOnly = false } = {}) {
  const userId = assertIntegerId(actor.id, 'user id');
  const sql = unreadOnly
    ? 'SELECT * FROM notifications WHERE user_id = ? AND is_read = 0 ORDER BY created_at DESC, id DESC LIMIT 200'
    : 'SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC, id DESC LIMIT 200';
  const [rows] = await pool.execute(sql, [userId]);
  return rows.map(shape);
}

export async function unreadCount(actor) {
  const [[row]] = await pool.execute(
    'SELECT COUNT(*) AS count FROM notifications WHERE user_id = ? AND is_read = 0',
    [assertIntegerId(actor.id, 'user id')],
  );
  return Number(row.count) || 0;
}

export async function markRead(actor, id) {
  const noteId = assertIntegerId(id, 'notification id');
  const [result] = await pool.execute(
    'UPDATE notifications SET is_read = 1 WHERE id = ? AND user_id = ?',
    [noteId, actor.id],
  );
  if (!result.affectedRows) throw new AppError(404, 'NOTIFICATION_NOT_FOUND', 'Notification not found.');
  return { ok: true };
}

export async function markAllRead(actor) {
  await pool.execute('UPDATE notifications SET is_read = 1 WHERE user_id = ? AND is_read = 0', [actor.id]);
  return { ok: true };
}
