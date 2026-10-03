'use client';

import { Button, Field, Input, useAction } from '@flexshift/ui';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useAuth } from '@/lib/auth';

export default function ChangePasswordPage() {
  const { changePassword, user } = useAuth();
  const router = useRouter();
  const { run, busy } = useAction();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const mismatch = confirm.length > 0 && next !== confirm;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (mismatch) return;
    const ok = await run(() => changePassword(current, next).then(() => true), 'Password updated');
    if (ok) router.replace('/feed');
  }

  return (
    <main className="min-h-screen flex items-start sm:items-center justify-center bg-slate-50 p-4">
      <form onSubmit={submit} className="w-full max-w-sm bg-white rounded-2xl border border-slate-200 shadow-sm p-6 sm:p-8 space-y-5">
        <div>
          <h1 className="text-lg font-bold text-slate-900">Set a new password</h1>
          <p className="text-xs text-slate-500 mt-1">
            {user?.mustChangePassword ? 'You are using a temporary password. Choose your own to continue.' : 'Choose a new password.'}
          </p>
        </div>
        <Field label="Current password">
          <Input type="password" required autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} />
        </Field>
        <Field label="New password" hint="At least 8 characters">
          <Input type="password" required minLength={8} autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} />
        </Field>
        <Field label="Confirm new password" error={mismatch ? 'Passwords do not match' : undefined}>
          <Input type="password" required autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
        </Field>
        <Button type="submit" loading={busy} disabled={mismatch} className="w-full min-h-[44px] text-base">Update password</Button>
      </form>
    </main>
  );
}
