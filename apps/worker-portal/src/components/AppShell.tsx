'use client';

import { LoadingBlock } from '@flexshift/ui';
import clsx from 'clsx';
import { NotificationBell } from '@/components/NotificationBell';
import { CalendarCheck, LogOut, Search, UserCircle, Wallet, Zap } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, type ReactNode } from 'react';
import { useAuth } from '@/lib/auth';

const PUBLIC_PATHS = ['/login', '/register'];
const TABS = [
  { href: '/feed', label: 'Feed', icon: Search },
  { href: '/my-shifts', label: 'My Shifts', icon: CalendarCheck },
  { href: '/finance', label: 'Finance', icon: Wallet },
  { href: '/profile', label: 'Profile', icon: UserCircle },
];

export function Logo() {
  return (
    <span className="inline-flex items-center gap-2 font-extrabold text-slate-900">
      <span className="w-8 h-8 rounded-lg bg-emerald-600 text-white flex items-center justify-center"><Zap className="w-4 h-4" /></span>
      FlexShift
    </span>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const { user, loading, logout } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const isPublic = PUBLIC_PATHS.includes(pathname);

  useEffect(() => {
    if (loading) return;
    if (!user && !isPublic) router.replace('/login');
    else if (user && isPublic) router.replace('/feed');
    else if (user?.mustChangePassword && pathname !== '/change-password') router.replace('/change-password');
  }, [loading, user, isPublic, pathname, router]);

  if (isPublic) return <>{children}</>;
  if (loading || !user || (user.mustChangePassword && pathname !== '/change-password')) return <LoadingBlock text="Loading…" />;
  if (pathname === '/change-password') return <>{children}</>;

  return (
    <div className="min-h-screen flex flex-col">
      <header className="sticky top-0 z-30 bg-white/95 backdrop-blur border-b border-slate-200">
        <div className="max-w-3xl mx-auto h-14 px-4 flex items-center justify-between">
          <Link href="/feed"><Logo /></Link>
          <nav className="hidden sm:flex items-center gap-1">
            {TABS.map((t) => (
              <Link key={t.href} href={t.href} className={clsx('px-3 py-2 rounded-lg text-sm font-semibold', pathname.startsWith(t.href) ? 'text-emerald-700 bg-emerald-50' : 'text-slate-600 hover:bg-slate-100')}>
                {t.label}
              </Link>
            ))}
          </nav>
          <NotificationBell />
          <button onClick={() => logout()} className="min-h-[44px] px-2 inline-flex items-center gap-1.5 text-sm font-semibold text-slate-600 hover:text-slate-900">
            <LogOut className="w-4 h-4" /> <span className="hidden xs:inline sm:inline">Sign out</span>
          </button>
        </div>
      </header>
      <main className="flex-1 w-full max-w-3xl mx-auto px-4 py-4 pb-28 sm:pb-8">{children}</main>
      <nav className="sm:hidden fixed bottom-0 inset-x-0 z-30 bg-white border-t border-slate-200 pb-[env(safe-area-inset-bottom)]">
        <div className="grid grid-cols-4">
          {TABS.map((t) => {
            const active = pathname.startsWith(t.href) || (t.href === '/feed' && pathname.startsWith('/shifts/'));
            return (
              <Link key={t.href} href={t.href} className={clsx('flex flex-col items-center justify-center gap-0.5 min-h-[56px] text-[11px] font-semibold', active ? 'text-emerald-700' : 'text-slate-500')}>
                <t.icon className="w-5 h-5" />
                {t.label}
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
