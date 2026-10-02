'use client';

import { Badge, Button, EmptyState, ErrorBlock, Field, Input, LoadingBlock, Modal, StatusBadge, Textarea, useAction, useAsync } from '@flexshift/ui';
import { fmtRange, gbp, type Shift } from '@flexshift/api-client';
import clsx from 'clsx';
import { CalendarDays, ChevronLeft, ChevronRight, List } from 'lucide-react';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import { PageTitle } from '@/components/common';
import { ShiftCard } from '@/components/ShiftCard';
import { api } from '@/lib/auth';

const SEGMENTS = [
  { id: 'watching', label: 'Watching' },
  { id: 'negotiating', label: 'In negotiation' },
  { id: 'applied', label: 'Applied' },
  { id: 'booked', label: 'Booked' },
  { id: 'completed', label: 'Completed' },
] as const;
type Segment = (typeof SEGMENTS)[number]['id'];

/** Date to the value format datetime-local expects, in local time. */
const toLocalInput = (d: Date) => {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
};
const dayKey = (d: Date) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;

export default function MyShiftsPage() {
  const { data, loading, error, reload } = useAsync(() => api.shifts.mine(), []);
  const [seg, setSeg] = useState<Segment>('booked');
  const [view, setView] = useState<'list' | 'calendar'>('list');
  const [tsShift, setTsShift] = useState<Shift | null>(null);

  const now = Date.now();
  const booked = useMemo(() => (data?.booked ?? []).filter((s) => s.status !== 'CANCELLED'), [data]);
  const upcoming = booked.filter((s) => new Date(s.endTime).getTime() > now && s.status !== 'COMPLETED');
  const completed = booked.filter((s) => !upcoming.includes(s));
  const needsTs = (s: Shift) => !s.timesheet && s.status !== 'COMPLETED';
  const awaitingTs = completed.filter(needsTs).length;
  const counts: Record<Segment, number> = {
    watching: data?.watching.length ?? 0,
    negotiating: data?.negotiations.filter((n) => n.status === 'PENDING' || n.status === 'COUNTERED').length ?? 0,
    applied: data?.applications.length ?? 0,
    booked: upcoming.length,
    completed: completed.length,
  };

  return (
    <>
      <PageTitle right={
        <div className="flex rounded-lg border border-slate-300 bg-white overflow-hidden">
          {([['list', List], ['calendar', CalendarDays]] as const).map(([v, Icon]) => (
            <button key={v} onClick={() => setView(v)} aria-label={`${v} view`} aria-pressed={view === v} className={clsx('w-11 h-11 flex items-center justify-center', view === v ? 'bg-emerald-600 text-white' : 'text-slate-600')}>
              <Icon className="w-4 h-4" />
            </button>
          ))}
        </div>
      }>My shifts</PageTitle>

      {loading && !data ? <LoadingBlock /> : error ? <ErrorBlock error={error} retry={reload} /> : data && (
        view === 'calendar' ? <CalendarView booked={booked} onSubmit={setTsShift} needsTs={needsTs} /> : (
          <>
            <div className="flex gap-2 overflow-x-auto -mx-4 px-4 pb-3">
              {SEGMENTS.map((s) => (
                <button key={s.id} onClick={() => setSeg(s.id)} className={clsx('min-h-[44px] px-4 rounded-full text-sm font-semibold whitespace-nowrap border', seg === s.id ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-white text-slate-700 border-slate-300')}>
                  {s.label} <span className="opacity-70">{counts[s.id]}</span>
                </button>
              ))}
            </div>
            {awaitingTs > 0 && seg !== 'completed' && (
              <button onClick={() => setSeg('completed')} className="w-full mb-3 text-left rounded-lg bg-amber-50 border border-amber-200 p-3 text-sm text-amber-900 font-semibold">
                {awaitingTs} finished shift{awaitingTs > 1 ? 's need' : ' needs'} a timesheet. Tap to submit.
              </button>
            )}
            <div className="space-y-3">
              {seg === 'watching' && (data.watching.length ? data.watching.map((s) => <ShiftCard key={s.id} shift={s} />) : <EmptyState title="Nothing watched" hint="Watch shifts from the feed to track them here." />)}
              {seg === 'negotiating' && (data.negotiations.length ? data.negotiations.map((n) => (
                <Row key={n.id} shift={n.shift} badge={<StatusBadge status={n.status} />}
                  extra={<>Your offer {gbp(n.proposedHourlyRate)}/hr{n.status === 'COUNTERED' && n.counterOfferRate != null && <b className="text-violet-700"> · Counter {gbp(n.counterOfferRate)}/hr. Tap to respond</b>}</>} />
              )) : <EmptyState title="No negotiations" hint="Propose a different rate on any shift." />)}
              {seg === 'applied' && (data.applications.length ? data.applications.map((a) => (
                <Row key={a.id} shift={a.shift} badge={<StatusBadge status={a.status} />} extra={a.notes ?? undefined} />
              )) : <EmptyState title="No applications" hint="Apply for shifts from the feed." />)}
              {seg === 'booked' && (upcoming.length ? upcoming.map((s) => <BookedRow key={s.id} s={s} onSubmit={setTsShift} needsTs={needsTs(s)} />) : <EmptyState title="No upcoming shifts" hint="Browse the feed to book your next shift." action={<Link href="/feed" className="text-emerald-700 font-semibold text-sm">Find shifts</Link>} />)}
              {seg === 'completed' && (completed.length ? completed.map((s) => <BookedRow key={s.id} s={s} onSubmit={setTsShift} needsTs={needsTs(s)} />) : <EmptyState title="No completed shifts yet" />)}
            </div>
          </>
        )
      )}

      {tsShift && <TimesheetModal shift={tsShift} onClose={() => setTsShift(null)} onDone={() => { setTsShift(null); reload(); }} />}
    </>
  );
}

function Row({ shift, badge, extra }: { shift?: Shift; badge: React.ReactNode; extra?: React.ReactNode }) {
  if (!shift) return null;
  return (
    <Link href={`/shifts/${shift.id}`} className="block bg-white rounded-xl border border-slate-200 shadow-sm p-4">
      <div className="flex justify-between gap-2 items-start">
        <div className="min-w-0"><p className="font-bold truncate">{shift.branch?.name ?? shift.title}</p><p className="text-sm text-slate-600">{fmtRange(shift.startTime, shift.endTime)}</p></div>
        {badge}
      </div>
      {extra && <p className="text-xs text-slate-500 mt-1.5">{extra}</p>}
    </Link>
  );
}

function BookedRow({ s, needsTs, onSubmit }: { s: Shift; needsTs: boolean; onSubmit: (s: Shift) => void }) {
  const ended = new Date(s.endTime).getTime() <= Date.now();
  const canSubmit = ended && (needsTs || s.timesheet?.status === 'DISPUTED');
  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm">
      <Row shift={s} badge={s.timesheet ? <div className="flex flex-col items-end gap-1"><Badge tone="slate">Timesheet</Badge><StatusBadge status={s.timesheet.status} /></div> : <StatusBadge status={s.status} />} />
      {canSubmit && (
        <div className="px-4 pb-4"><Button className="w-full min-h-[44px] text-base" onClick={() => onSubmit(s)}>{s.timesheet ? 'Resubmit timesheet' : 'Submit timesheet'}</Button></div>
      )}
    </div>
  );
}

function CalendarView({ booked, onSubmit, needsTs }: { booked: Shift[]; onSubmit: (s: Shift) => void; needsTs: (s: Shift) => boolean }) {
  const [cursor, setCursor] = useState(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1); });
  const [picked, setPicked] = useState<string>(dayKey(new Date()));
  const byDay = useMemo(() => {
    const m = new Map<string, Shift[]>();
    for (const s of booked) { const k = dayKey(new Date(s.startTime)); m.set(k, [...(m.get(k) ?? []), s]); }
    return m;
  }, [booked]);
  const offset = (cursor.getDay() + 6) % 7; // Monday first
  const days = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0).getDate();
  const cells = [...Array(offset).fill(null), ...Array.from({ length: days }, (_, i) => new Date(cursor.getFullYear(), cursor.getMonth(), i + 1))];
  const today = dayKey(new Date());
  const list = byDay.get(picked) ?? [];

  return (
    <div className="space-y-3">
      <div className="bg-white rounded-xl border border-slate-200 p-3">
        <div className="flex items-center justify-between mb-2">
          <button aria-label="Previous month" className="w-11 h-11 flex items-center justify-center" onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))}><ChevronLeft className="w-5 h-5" /></button>
          <b>{cursor.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })}</b>
          <button aria-label="Next month" className="w-11 h-11 flex items-center justify-center" onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))}><ChevronRight className="w-5 h-5" /></button>
        </div>
        <div className="grid grid-cols-7 text-center text-[11px] font-bold text-slate-500 mb-1">{['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d, i) => <div key={i}>{d}</div>)}</div>
        <div className="grid grid-cols-7 gap-y-1">
          {cells.map((d, i) => d ? (
            <button key={i} onClick={() => setPicked(dayKey(d))} className={clsx('h-11 flex flex-col items-center justify-center rounded-lg text-sm', picked === dayKey(d) ? 'bg-emerald-600 text-white' : dayKey(d) === today ? 'bg-emerald-50 text-emerald-800 font-bold' : 'text-slate-800')}>
              {d.getDate()}
              <span className={clsx('w-1.5 h-1.5 rounded-full mt-0.5', byDay.has(dayKey(d)) ? (picked === dayKey(d) ? 'bg-white' : 'bg-emerald-600') : 'bg-transparent')} />
            </button>
          ) : <div key={i} />)}
        </div>
      </div>
      {list.length ? list.map((s) => <BookedRow key={s.id} s={s} onSubmit={onSubmit} needsTs={needsTs(s)} />) : <p className="text-center text-sm text-slate-500 py-4">No booked shifts on this day.</p>}
    </div>
  );
}

function TimesheetModal({ shift, onClose, onDone }: { shift: Shift; onClose: () => void; onDone: () => void }) {
  const { run, busy } = useAction();
  const [inT, setIn] = useState(toLocalInput(new Date(shift.startTime)));
  const [outT, setOut] = useState(toLocalInput(new Date(Math.min(new Date(shift.endTime).getTime(), Date.now()))));
  const [brk, setBrk] = useState('0');
  const [notes, setNotes] = useState('');
  const [err, setErr] = useState<string>();

  const clockIn = new Date(inT);
  const clockOut = new Date(outT);
  const brkNum = Number(brk);
  const problem =
    !inT || !outT ? 'Enter both clock times' :
    clockOut <= clockIn ? 'Clock-out must be after clock-in' :
    clockOut.getTime() > Date.now() ? 'Clock-out cannot be in the future' :
    !Number.isInteger(brkNum) || brkNum < 0 || brkNum > 480 ? 'Break must be a whole number from 0 to 480 minutes' : undefined;

  async function submit() {
    setErr(undefined);
    const res = await run(async () => {
      try {
        return await api.timesheets.submit({
          shiftId: shift.id, clockInTime: clockIn.toISOString(), clockOutTime: clockOut.toISOString(), breakMinutes: brkNum,
          ...(notes.trim() && { notes: notes.trim() }),
        });
      } catch (e) { setErr(e instanceof Error ? e.message : 'Could not submit'); throw e; }
    }, 'Timesheet submitted');
    if (res) onDone();
  }

  return (
    <Modal open onClose={onClose} title="Submit timesheet"
      footer={<><Button variant="ghost" className="min-h-[44px]" onClick={onClose}>Cancel</Button><Button className="min-h-[44px]" loading={busy} disabled={!!problem} onClick={submit}>Submit</Button></>}>
      <p className="text-sm text-slate-600">{shift.branch?.name} · {fmtRange(shift.startTime, shift.endTime)}</p>
      <Field label="Clock in"><Input type="datetime-local" className="min-h-[44px] text-base" value={inT} onChange={(e) => setIn(e.target.value)} /></Field>
      <Field label="Clock out"><Input type="datetime-local" className="min-h-[44px] text-base" max={toLocalInput(new Date())} value={outT} onChange={(e) => setOut(e.target.value)} /></Field>
      <Field label="Break (minutes)"><Input type="number" inputMode="numeric" min={0} max={480} className="min-h-[44px] text-base" value={brk} onChange={(e) => setBrk(e.target.value)} /></Field>
      <Field label="Notes (optional)"><Textarea maxLength={500} value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>
      {(problem || err) && <p className="text-sm text-rose-600">{err ?? problem}</p>}
    </Modal>
  );
}
