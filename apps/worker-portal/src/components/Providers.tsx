'use client';

import { ToastProvider } from '@flexshift/ui';
import type { ReactNode } from 'react';
import { AuthProvider } from '@/lib/auth';
import { AppShell } from '@/components/AppShell';

export function Providers({ children }: { children: ReactNode }) {
  return (
    <ToastProvider>
      <AuthProvider>
        <AppShell>{children}</AppShell>
      </AuthProvider>
    </ToastProvider>
  );
}
