import { z } from 'zod';
import { asyncHandler } from '../../utils/errors.js';
import { listNotifications, markRead, markAllRead, unreadCount } from './service.js';

export const list = asyncHandler(async (req, res) => {
  const unreadOnly = z.coerce.boolean().default(false).parse(req.query.unread ?? false);
  res.json({ success: true, data: await listNotifications(req.user, { unreadOnly }) });
});

export const counts = asyncHandler(async (req, res) =>
  res.json({ success: true, data: { unread: await unreadCount(req.user) } }));

export const read = asyncHandler(async (req, res) =>
  res.json({ success: true, data: await markRead(req.user, req.params.id) }));

export const readAll = asyncHandler(async (req, res) =>
  res.json({ success: true, data: await markAllRead(req.user) }));
