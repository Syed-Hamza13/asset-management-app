import { useState } from 'react';
import { useNotifications } from '../context/NotificationsContext';
import { BellIcon, NotificationRow } from './NotificationBell';

// Top-of-page strip for the newest unread notifications, styled exactly like the bell
// panel rows. Ticking a row marks it read, which also removes it from here.
export function NotificationBanner() {
  const { notifications, markRead, markAllRead } = useNotifications();
  const [expanded, setExpanded] = useState(null);
  const unread = notifications.filter((n) => !n.isRead).slice(0, 3);
  if (!unread.length) return null;

  return (
    <div className="mb-4 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="flex items-center justify-between gap-2 bg-slate-900 px-3 py-2 text-white">
        <div className="flex min-w-0 items-center gap-2">
          <span className="grid h-6 w-6 shrink-0 place-items-center rounded-lg bg-white/10 text-emerald-300">
            <BellIcon className="h-3.5 w-3.5" />
          </span>
          <span className="truncate text-[13px] font-semibold">
            {unread.length} new notification{unread.length === 1 ? '' : 's'}
          </span>
        </div>
        {unread.length > 1 && (
          <button
            type="button"
            onClick={markAllRead}
            className="shrink-0 rounded-lg px-2 py-1 text-[11px] font-semibold text-slate-200 transition hover:bg-white/10 hover:text-white"
          >
            Dismiss all
          </button>
        )}
      </div>
      <div className="divide-y divide-slate-100">
        {unread.map((n) => (
          <NotificationRow
            key={n.id}
            notification={n}
            expanded={expanded === n.id}
            onToggle={() => setExpanded((e) => (e === n.id ? null : n.id))}
            onMarkRead={() => markRead(n.id)}
          />
        ))}
      </div>
    </div>
  );
}
