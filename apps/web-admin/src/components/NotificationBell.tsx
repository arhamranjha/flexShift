'use client';

import { Bell } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { NotificationFeed } from '@flexshift/api-client';
import { api } from '@/lib/auth';

const POLL_MS = 30_000;

export function NotificationBell() {
  const router = useRouter();
  const [feed, setFeed] = useState<NotificationFeed>({ unread: 0, items: [], emailEnabled: null });
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  const load = useCallback(() => api.notifications.list().then(setFeed, () => {}), []);

  useEffect(() => {
    load();
    const t = setInterval(load, POLL_MS);
    return () => clearInterval(t);
  }, [load]);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => box.current && !box.current.contains(e.target as Node) && setOpen(false);
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [open]);

  async function openItem(id: string, link?: string | null) {
    await api.notifications.markRead(id).catch(() => {});
    setOpen(false);
    load();
    if (link) router.push(link);
  }

  return (
    <div className="relative" ref={box}>
      <button
        aria-label={`Notifications${feed.unread ? ` (${feed.unread} unread)` : ''}`}
        onClick={() => { setOpen((o) => !o); load(); }}
        className="relative p-2 rounded-lg text-slate-500 hover:text-slate-700 hover:bg-slate-100"
      >
        <Bell className="w-4 h-4" />
        {feed.unread > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 rounded-full bg-rose-500 text-white text-[10px] font-bold flex items-center justify-center">
            {feed.unread > 9 ? '9+' : feed.unread}
          </span>
        )}
      </button>
      {open && (
        <div className="absolute right-0 mt-2 w-80 bg-white border border-slate-200 rounded-xl shadow-xl z-40 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-2.5 border-b border-slate-100">
            <span className="text-sm font-bold text-slate-900">Notifications</span>
            {feed.unread > 0 && (
              <button className="text-xs font-semibold text-emerald-700 hover:underline" onClick={() => api.notifications.markAllRead().then(load, () => {})}>
                Mark all read
              </button>
            )}
          </div>
          <ul className="max-h-96 overflow-y-auto divide-y divide-slate-100">
            {feed.items.length === 0 && <li className="px-4 py-8 text-center text-sm text-slate-500">You are all caught up</li>}
            {feed.items.map((n) => (
              <li key={n.id}>
                <button onClick={() => openItem(n.id, n.link)} className={`w-full text-left px-4 py-3 hover:bg-slate-50 ${n.readAt ? '' : 'bg-emerald-50/50'}`}>
                  <div className="text-sm font-semibold text-slate-900">{n.title}</div>
                  {n.body && <div className="text-xs text-slate-600 mt-0.5">{n.body}</div>}
                  <div className="text-[10px] text-slate-400 mt-1">{new Date(n.createdAt).toLocaleString('en-GB')}</div>
                </button>
              </li>
            ))}
          </ul>
          {feed.emailEnabled !== null && (
            <label className="flex items-center gap-2 px-4 py-2.5 border-t border-slate-100 text-xs text-slate-600">
              <input
                type="checkbox"
                className="rounded border-slate-300 text-emerald-600"
                checked={feed.emailEnabled}
                onChange={(e) => {
                  const next = e.target.checked;
                  setFeed((f) => ({ ...f, emailEnabled: next }));
                  // Roll back to the previous value if saving fails (a poll in between cannot hide the failure).
                  api.notifications.setEmailEnabled(next).catch(() => setFeed((f) => ({ ...f, emailEnabled: !next })));
                }}
              />
              Email me about important updates
            </label>
          )}
        </div>
      )}
    </div>
  );
}
