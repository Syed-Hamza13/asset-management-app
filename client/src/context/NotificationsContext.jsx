import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { api } from '../api/client';
import { useAuth } from './AuthContext';

const NotificationsContext = createContext(null);

export function NotificationsProvider({ children }) {
  const { user } = useAuth();
  const [notifications, setNotifications] = useState([]);
  const [unread, setUnread] = useState(0);

  const refresh = useCallback(async () => {
    if (!user) {
      setNotifications([]);
      setUnread(0);
      return;
    }
    try {
      const [list, count] = await Promise.all([
        api.notifications.list(),
        api.notifications.unreadCount(),
      ]);
      setNotifications(list.data);
      setUnread(count.data.unread);
    } catch {
      /* ignore transient errors */
    }
  }, [user]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Light polling so new submissions surface without a manual reload.
  useEffect(() => {
    if (!user) return undefined;
    const id = setInterval(refresh, 60000);
    return () => clearInterval(id);
  }, [user, refresh]);

  const markRead = useCallback(async (id) => {
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, isRead: true } : n)));
    setUnread((u) => Math.max(0, u - 1));
    await api.notifications.markRead(id).catch(() => {});
  }, []);

  const markAllRead = useCallback(async () => {
    setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
    setUnread(0);
    await api.notifications.markAllRead().catch(() => {});
  }, []);

  return (
    <NotificationsContext.Provider value={{ notifications, unread, refresh, markRead, markAllRead }}>
      {children}
    </NotificationsContext.Provider>
  );
}

export function useNotifications() {
  const context = useContext(NotificationsContext);
  if (!context) throw new Error('useNotifications must be used inside NotificationsProvider');
  return context;
}
