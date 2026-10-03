'use client';

import { Button, Field, Input, useAction } from '@flexshift/ui';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Logo } from '@/components/AppShell';
import { useAuth } from '@/lib/auth';

export default function LoginPage() {
  const { login } = useAuth();
  const router = useRouter();
  const { run, busy } = useAction();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const user = await run(() => login(email, password));
    if (user) router.replace(user.mustChangePassword ? '/change-password' : '/feed');
  }

  return (
    <main className="min-h-screen flex items-start sm:items-center justify-center p-4 pt-12">
      <form onSubmit={submit} className="w-full max-w-sm bg-white rounded-2xl border border-slate-200 shadow-sm p-6 sm:p-8 space-y-5">
        <Logo />
        <div>
          <h1 className="text-xl font-extrabold text-slate-900">Welcome back</h1>
          <p className="text-sm text-slate-500 mt-1">Sign in to find and book shifts.</p>
        </div>
        <Field label="Email"><Input type="email" required autoComplete="email" className="min-h-[44px] text-base" value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
        <Field label="Password"><Input type="password" required autoComplete="current-password" className="min-h-[44px] text-base" value={password} onChange={(e) => setPassword(e.target.value)} /></Field>
        <Button type="submit" loading={busy} className="w-full min-h-[44px] text-base">Sign in</Button>
        <p className="text-sm text-center text-slate-600">
          New here? <Link href="/register" className="font-semibold text-emerald-700">Create an account</Link>
        </p>
      </form>
    </main>
  );
}
