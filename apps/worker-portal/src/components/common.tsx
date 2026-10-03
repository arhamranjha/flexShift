'use client';

import { Badge, Button } from '@flexshift/ui';
import { ALL_DOC_TYPES, money, shiftHours, toNumber, type DocType, type Shift } from '@flexshift/api-client';
import clsx from 'clsx';
import { ChevronLeft } from 'lucide-react';
import { useRouter } from 'next/navigation';
import type { ReactNode } from 'react';
import { useMarket } from '@/lib/market';

export const tap = 'min-h-[44px]';
export const bigBtn = 'min-h-[44px] text-base';

export function PageTitle({ children, back, right }: { children: ReactNode; back?: boolean; right?: ReactNode }) {
  const router = useRouter();
  return (
    <div className="flex items-center justify-between gap-2 mb-4">
      <div className="flex items-center gap-1 min-w-0">
        {back && (
          <button onClick={() => router.back()} aria-label="Back" className="w-11 h-11 -ml-2 flex items-center justify-center rounded-lg hover:bg-slate-100">
            <ChevronLeft className="w-5 h-5" />
          </button>
        )}
        <h1 className="text-xl font-extrabold text-slate-900 truncate">{children}</h1>
      </div>
      {right}
    </div>
  );
}

export function Chips({ options, value, onChange }: { options: readonly string[]; value: string[]; onChange: (v: string[]) => void }) {
  const toggle = (o: string) => onChange(value.includes(o) ? value.filter((x) => x !== o) : [...value, o]);
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((o) => (
        <button
          type="button"
          key={o}
          onClick={() => toggle(o)}
          aria-pressed={value.includes(o)}
          className={clsx('min-h-[40px] px-3 rounded-full border text-sm font-semibold', value.includes(o) ? 'bg-emerald-600 border-emerald-600 text-white' : 'bg-white border-slate-300 text-slate-700')}
        >
          {o}
        </button>
      ))}
    </div>
  );
}


/** Rate x hours, the amount the worker receives. */
export const grossPayout = (s: Pick<Shift, 'hourlyRate' | 'startTime' | 'endTime'>) => toNumber(s.hourlyRate) * shiftHours(s.startTime, s.endTime);

export function ShiftBadges({ shift }: { shift: Shift }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {shift.isEmergency && <Badge tone="rose">Emergency</Badge>}
      {shift.isOvernight && <Badge tone="violet">Overnight</Badge>}
      {shift.instantBookEnabled && <Badge tone="emerald">Instant Book</Badge>}
      {shift.requiredSystems.map((s) => <Badge key={s} tone="sky">{s}</Badge>)}
    </div>
  );
}

export function Payout({ shift }: { shift: Shift }) {
  const { currency } = useMarket();
  const hours = shiftHours(shift.startTime, shift.endTime);
  const cur = shift.currency ?? currency;
  return (
    <div className="text-right shrink-0">
      <div className="text-lg font-extrabold text-emerald-700 leading-tight">{money(grossPayout(shift), cur)}</div>
      <div className="text-[11px] text-slate-500">{money(shift.hourlyRate, cur)}/hr · {hours.toFixed(1)}h</div>
      <div className="text-[11px] font-semibold text-emerald-700">You keep 100%</div>
    </div>
  );
}

const DOC_TOKEN = new RegExp(`\\b(${ALL_DOC_TYPES.join('|')})\\b`, 'g');

export function ProblemList({ problems }: { problems: string[] }) {
  const { docLabel } = useMarket();
  const text = (p: string) => p.replace(DOC_TOKEN, (t) => docLabel(t as DocType));
  return (
    <div className="rounded-lg bg-rose-50 border border-rose-200 p-3 text-sm space-y-2">
      <p className="font-bold text-rose-800">You are not eligible for this shift yet</p>
      <ul className="space-y-1 text-rose-800">
        {problems.map((p) => <li key={p} className="flex gap-2"><span aria-hidden>✗</span><span>{text(p)}</span></li>)}
      </ul>
      <a href="/profile"><Button variant="secondary" className="w-full min-h-[44px] mt-1">Fix in my profile</Button></a>
    </div>
  );
}

/** Pulls the eligibility checklist out of a 403 ApiError. */
export function eligibilityProblems(e: unknown): string[] | undefined {
  const details = (e as { details?: { problems?: unknown } } | null)?.details;
  return Array.isArray(details?.problems) ? (details.problems as string[]) : undefined;
}
