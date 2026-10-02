'use client';

import { LoadingBlock } from '@flexshift/ui';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, type ReactNode } from 'react';
import { ScopeProvider, useAuth } from '@/lib/auth';
import { Sidebar } from '@/components/Sidebar';

const PUBLIC_PATHS = ['/login'];

export function AppShell({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const isPublic = PUBLIC_PATHS.includes(pathname);

  useEffect(() => {
    if (loading) return;
    if (!user && !isPublic) router.replace('/login');
    else if (user && isPublic) router.replace('/');
    else if (user?.mustChangePassword && pathname !== '/change-password') router.replace('/change-password');
  }, [loading, user, isPublic, pathname, router]);

  if (isPublic) return <>{children}</>;
  if (loading || !user || (user.mustChangePassword && pathname !== '/change-password')) return <LoadingBlock text="Loading your workspace…" />;
  if (pathname === '/change-password') return <>{children}</>;

  return (
    <ScopeProvider>
      <div className="flex min-h-screen">
        <Sidebar />
        <div className="flex-1 flex flex-col min-w-0 overflow-y-auto">{children}</div>
      </div>
    </ScopeProvider>
  );
}
