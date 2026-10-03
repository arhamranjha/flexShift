'use client';

import { ToastProvider } from '@flexshift/ui';
import type { ReactNode } from 'react';
import { AuthProvider } from '@/lib/auth';
import { MarketProvider } from '@/lib/market';
import { AppShell } from '@/components/AppShell';

export function Providers({ children }: { children: ReactNode }) {
  return (
    <ToastProvider>
      <AuthProvider>
        <MarketProvider><AppShell>{children}</AppShell></MarketProvider>
      </AuthProvider>
    </ToastProvider>
  );
}
