import { useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNotifications } from '../context/NotificationsContext';

export function entryRows(body) {
  if (!body || typeof body !== 'object') return [];
  const rows = [];
  for (const f of Array.isArray(body.fields) ? body.fields : []) {
    if (f && f.value) rows.push([f.label, f.value]);
  }
  return rows;
}

export function entryMessage(body) {
  if (!body || typeof body !== 'object') return '';
  return typeof body.message === 'string' ? body.message : '';
}

// Collapsed one-liner: only the first line, and it is dropped while the row is open
// so the same text never shows twice.
function previewOf(n) {
  const message = entryMessage(n.body);
  if (message) return message.split('\n').find(Boolean) || '';
  return entryRows(n.body).map(([, value]) => value).filter(Boolean).join(' · ');
}

export function when(iso) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const time = date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  const today = new Date().toDateString() === date.toDateString();
  if (today) return time;
  return date.toLocaleDateString([], { day: '2-digit', month: 'short' });
}

export function BellIcon({ className = 'h-[18px] w-[18px]' }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className={className} aria-hidden="true">
      <path d="M18 8a6 6 0 1 0-12 0c0 5-2 6-2 6h16s-2-1-2-6" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M13.7 19a2 2 0 0 1-3.4 0" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function CheckIcon({ className = 'h-3.5 w-3.5' }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" className={className} aria-hidden="true">
      <path d="M20 6 9 17l-5-5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ChevronIcon({ className = '' }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={`h-3.5 w-3.5 shrink-0 ${className}`} aria-hidden="true">
      <path d="m6 9 6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// Round read control: empty ring while unread, filled emerald tick once read.
// Read rows stay inert because marking an already-read row 404s on the server.
export function ReadToggle({ isRead, onClick }) {
  if (isRead) {
    return (
      <span
        aria-label="Read"
        title="Read"
        className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-full bg-emerald-500 text-white"
      >
        <CheckIcon />
      </span>
    );
  }
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Mark as read"
      title="Mark as read"
      className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-full text-transparent ring-1 ring-slate-300 ring-inset transition hover:bg-emerald-500 hover:text-white hover:ring-emerald-500 active:scale-95"
    >
      <CheckIcon />
    </button>
  );
}

export function NotificationDetails({ body }) {
  const message = entryMessage(body);
  const rows = entryRows(body);
  if (message) return <p className="whitespace-pre-line text-[13px] leading-5 text-slate-800">{message}</p>;
  if (!rows.length) return <p className="text-xs text-slate-500">No details.</p>;
  return (
    <dl className="space-y-0.5">
      {rows.map(([label, value], i) => (
        <div key={i} className="flex gap-2 text-[13px] leading-5">
          <dt className="w-24 shrink-0 text-slate-500">{label}</dt>
          <dd className="min-w-0 flex-1 break-words text-slate-800">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

export function NotificationRow({ notification, expanded, onToggle, onMarkRead }) {
  const { title, isRead, createdAt, body } = notification;
  const preview = previewOf(notification);
  return (
    <div
      className={`border-l-2 transition-colors ${isRead ? 'border-slate-200' : 'border-emerald-500'} ${
        expanded ? 'bg-slate-50' : 'hover:bg-slate-50'
      }`}
    >
      <div className="flex items-start gap-2.5 px-3 py-2.5">
        <ReadToggle isRead={isRead} onClick={onMarkRead} />
        <button type="button" onClick={onToggle} aria-expanded={expanded} className="min-w-0 flex-1 text-left">
          <div className="flex items-center gap-2">
            <span
              className={`min-w-0 flex-1 text-[13px] leading-5 ${
                isRead ? 'font-medium text-slate-700' : 'font-semibold text-slate-900'
              }`}
            >
              {title}
            </span>
            <span className="shrink-0 text-[11px] tabular-nums text-slate-400">{when(createdAt)}</span>
            <ChevronIcon className={`text-slate-400 transition-transform ${expanded ? 'rotate-180' : ''}`} />
          </div>
          {!expanded && preview && (
            <span className="mt-0.5 block truncate text-xs leading-4 text-slate-500">{preview}</span>
          )}
        </button>
      </div>
      {expanded && (
        <div className="px-3 pb-2.5">
          <div className="ml-[2.625rem] rounded-lg border border-slate-200 bg-white px-3 py-2">
            <NotificationDetails body={body} />
          </div>
        </div>
      )}
    </div>
  );
}

function Section({ label, tone, count, children }) {
  if (!children) return null;
  return (
    <div>
      <div className="sticky top-0 z-10 flex items-center gap-1.5 border-b border-slate-100 bg-slate-100/80 px-3 py-1.5 backdrop-blur">
        <span className={`h-1.5 w-1.5 rounded-full ${tone}`} />
        <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">{label}</span>
        <span className="text-[10px] font-medium tabular-nums text-slate-400">{count}</span>
      </div>
      <div className="divide-y divide-slate-100">{children}</div>
    </div>
  );
}

// The panel is portalled to <body> with fixed coordinates. Rendered inside the sidebar
// it would be trapped in that stacking context, so page popovers (e.g. the Reports
// column filter) would paint over it.
export function NotificationBell({ align = 'left' }) {
  const { notifications, unread, markRead, markAllRead } = useNotifications();
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState(null);
  const [pos, setPos] = useState(null);
  const bellRef = useRef(null);
  const fresh = notifications.filter((n) => !n.isRead);
  const older = notifications.filter((n) => n.isRead);

  useLayoutEffect(() => {
    if (!open) {
      setPos(null);
      return undefined;
    }
    function place() {
      const rect = bellRef.current?.getBoundingClientRect();
      if (!rect) return;
      const vw = window.innerWidth;
      // Phones: full-width sheet just below the 120px mobile header.
      if (vw < 640) {
        setPos({ top: 124, left: 8, width: vw - 16 });
        return;
      }
      const width = Math.min(336, vw - 24);
      const left =
        align === 'right'
          ? Math.max(12, rect.right - width)
          : Math.min(Math.max(12, rect.left), vw - width - 12);
      setPos({ top: rect.bottom + 8, left, width });
    }
    place();
    window.addEventListener('scroll', place, true);
    window.addEventListener('resize', place);
    return () => {
      window.removeEventListener('scroll', place, true);
      window.removeEventListener('resize', place);
    };
  }, [open, align]);

  function toggle(id) {
    setExpanded((e) => (e === id ? null : id));
  }

  return (
    <div className="relative">
      <button
        ref={bellRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="Notifications"
        aria-expanded={open}
        className={`relative grid h-9 w-9 place-items-center rounded-xl border bg-white transition ${
          open
            ? 'border-slate-900 text-slate-900'
            : `border-slate-200 ${unread ? 'text-slate-900' : 'text-slate-400 hover:text-slate-700'}`
        }`}
      >
        <BellIcon />
        {unread > 0 && (
          <span className="absolute -right-1 -top-1 grid h-4 min-w-4 place-items-center rounded-full bg-emerald-500 px-1 text-[10px] font-bold leading-none text-white ring-2 ring-white">
            {unread > 99 ? '99+' : unread}
          </span>
        )}
      </button>

      {open &&
        pos &&
        createPortal(
          <>
            <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
            <div
              className="fixed z-[45] flex max-h-[70vh] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl shadow-slate-900/15"
              style={{ top: pos.top, left: pos.left, width: pos.width }}
            >
              <div className="flex shrink-0 items-center justify-between gap-2 bg-slate-900 px-3 py-2.5 text-white">
                <div className="flex min-w-0 items-center gap-2">
                  <span className="grid h-6 w-6 shrink-0 place-items-center rounded-lg bg-white/10 text-emerald-300">
                    <BellIcon className="h-3.5 w-3.5" />
                  </span>
                  <span className="truncate text-[13px] font-semibold">Notifications</span>
                  {unread > 0 && (
                    <span className="shrink-0 rounded-full bg-emerald-500 px-1.5 py-0.5 text-[10px] font-bold leading-none tabular-nums text-white">
                      {unread}
                    </span>
                  )}
                </div>
                {unread > 0 && (
                  <button
                    type="button"
                    onClick={markAllRead}
                    className="shrink-0 rounded-lg px-2 py-1 text-[11px] font-semibold text-slate-200 transition hover:bg-white/10 hover:text-white"
                  >
                    Mark all read
                  </button>
                )}
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
                {!notifications.length && (
                  <p className="px-3 py-10 text-center text-xs text-slate-400">No notifications yet.</p>
                )}
                <Section label="New" tone="bg-emerald-500" count={fresh.length}>
                  {fresh.length
                    ? fresh.map((n) => (
                        <NotificationRow
                          key={n.id}
                          notification={n}
                          expanded={expanded === n.id}
                          onToggle={() => toggle(n.id)}
                          onMarkRead={() => markRead(n.id)}
                        />
                      ))
                    : null}
                </Section>
                <Section label="Earlier" tone="bg-slate-300" count={older.length}>
                  {older.length
                    ? older.map((n) => (
                        <NotificationRow
                          key={n.id}
                          notification={n}
                          expanded={expanded === n.id}
                          onToggle={() => toggle(n.id)}
                          onMarkRead={() => markRead(n.id)}
                        />
                      ))
                    : null}
                </Section>
              </div>
            </div>
          </>,
          document.body,
        )}
    </div>
  );
}
