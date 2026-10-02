'use client';

import { Button, Field, Input, useAction } from '@flexshift/ui';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Logo } from '@/components/AppShell';
import { ACCREDITATIONS, Chips, SYSTEMS } from '@/components/common';
import { useAuth, type RegisterBody } from '@/lib/auth';

const num = (v: string) => (v.trim() === '' ? undefined : Number(v));

export default function RegisterPage() {
  const { register } = useAuth();
  const router = useRouter();
  const { run, busy } = useAction();
  const [step, setStep] = useState<1 | 2>(1);
  const [f, setF] = useState({
    email: '', password: '', firstName: '', lastName: '', phone: '',
    registrationNumber: '', profession: 'Pharmacist', hourlyRate: '', minimumShiftRate: '',
  });
  const [systems, setSystems] = useState<string[]>([]);
  const [accr, setAccr] = useState<string[]>([]);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value });

  const phoneOk = f.phone.trim().length >= 5 && f.phone.trim().length <= 25;
  const step1Ok = f.email.includes('@') && f.password.length >= 8 && f.firstName.trim() && f.lastName.trim() && phoneOk;
  const regLen = f.registrationNumber.trim().length;
  const rateBad = (v: string) => v !== '' && !(Number(v) >= 0 && Number(v) <= 1000);
  const step2Ok = regLen >= 3 && regLen <= 30 && !rateBad(f.hourlyRate) && !rateBad(f.minimumShiftRate);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (step === 1) { if (step1Ok) setStep(2); return; }
    if (!step2Ok) return;
    const body: RegisterBody = {
      email: f.email.trim(), password: f.password, firstName: f.firstName.trim(), lastName: f.lastName.trim(),
      phone: f.phone.trim(), registrationNumber: f.registrationNumber.trim(),
      ...(f.profession.trim() && { profession: f.profession.trim() }),
      ...(num(f.hourlyRate) !== undefined && { hourlyRate: num(f.hourlyRate) }),
      ...(num(f.minimumShiftRate) !== undefined && { minimumShiftRate: num(f.minimumShiftRate) }),
      systemTags: systems,
      accreditations: accr,
    };
    const user = await run(() => register(body), 'Account created');
    if (user) router.replace('/profile?welcome=1');
  }

  const big = 'min-h-[44px] text-base';
  return (
    <main className="min-h-screen flex items-start sm:items-center justify-center p-4 pt-8">
      <form onSubmit={submit} className="w-full max-w-md bg-white rounded-2xl border border-slate-200 shadow-sm p-6 sm:p-8 space-y-5">
        <Logo />
        <div>
          <p className="text-xs font-bold text-emerald-700 uppercase tracking-wide">Step {step} of 2</p>
          <h1 className="text-xl font-extrabold text-slate-900">{step === 1 ? 'Create your account' : 'Professional details'}</h1>
          <div className="mt-3 h-1.5 rounded-full bg-slate-100"><div className="h-full rounded-full bg-emerald-600 transition-all" style={{ width: step === 1 ? '50%' : '100%' }} /></div>
        </div>

        {step === 1 ? (
          <>
            <div className="grid grid-cols-2 gap-3">
              <Field label="First name"><Input required maxLength={60} className={big} value={f.firstName} onChange={set('firstName')} /></Field>
              <Field label="Last name"><Input required maxLength={60} className={big} value={f.lastName} onChange={set('lastName')} /></Field>
            </div>
            <Field label="Email"><Input type="email" required autoComplete="email" className={big} value={f.email} onChange={set('email')} /></Field>
            <Field label="Phone" hint="5 to 25 characters" error={f.phone && !phoneOk ? 'Enter a valid phone number' : undefined}>
              <Input type="tel" required autoComplete="tel" className={big} value={f.phone} onChange={set('phone')} />
            </Field>
            <Field label="Password" hint="At least 8 characters"><Input type="password" required minLength={8} maxLength={128} autoComplete="new-password" className={big} value={f.password} onChange={set('password')} /></Field>
            <Button type="submit" disabled={!step1Ok} className="w-full min-h-[44px] text-base">Continue</Button>
          </>
        ) : (
          <>
            <Field label="Registration number" hint="e.g. your GPhC number" error={f.registrationNumber && (regLen < 3 || regLen > 30) ? 'Must be 3 to 30 characters' : undefined}>
              <Input required className={big} value={f.registrationNumber} onChange={set('registrationNumber')} />
            </Field>
            <Field label="Profession"><Input maxLength={60} className={big} value={f.profession} onChange={set('profession')} /></Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Hourly rate (£)" error={rateBad(f.hourlyRate) ? '0 to 1000' : undefined}>
                <Input type="number" inputMode="decimal" min={0} max={1000} step="0.5" className={big} value={f.hourlyRate} onChange={set('hourlyRate')} />
              </Field>
              <Field label="Minimum shift rate (£)" error={rateBad(f.minimumShiftRate) ? '0 to 1000' : undefined}>
                <Input type="number" inputMode="decimal" min={0} max={1000} step="0.5" className={big} value={f.minimumShiftRate} onChange={set('minimumShiftRate')} />
              </Field>
            </div>
            <div><p className="text-xs font-semibold text-slate-700 mb-2">Systems you use</p><Chips options={SYSTEMS} value={systems} onChange={setSystems} /></div>
            <div><p className="text-xs font-semibold text-slate-700 mb-2">Accreditations</p><Chips options={ACCREDITATIONS} value={accr} onChange={setAccr} /></div>
            <div className="flex gap-3">
              <Button type="button" variant="secondary" className="min-h-[44px] text-base" onClick={() => setStep(1)}>Back</Button>
              <Button type="submit" loading={busy} disabled={!step2Ok} className="flex-1 min-h-[44px] text-base">Create account</Button>
            </div>
          </>
        )}
        <p className="text-sm text-center text-slate-600">
          Already registered? <Link href="/login" className="font-semibold text-emerald-700">Sign in</Link>
        </p>
      </form>
    </main>
  );
}
