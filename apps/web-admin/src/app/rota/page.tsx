'use client';

import { fmtTime, type Shift } from '@flexshift/api-client';
import { Button, Card, EmptyState, ErrorBlock, LoadingBlock, StatusBadge, useAsync } from '@flexshift/ui';
import clsx from 'clsx';
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Header } from '@/components/Header';
import { ShiftDetailModal } from '@/components/ShiftDetailModal';
import { ShiftFormModal } from '@/components/ShiftFormModal';
import { api, useScope } from '@/lib/auth';

type View = 'day' | 'week' | 'month';
type RotaShift = Shift & { branchName: string };

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const startOfWeek = (d: Date) => addDays(startOfDay(d), -((d.getDay() + 6) % 7));
const dayKey = (d: Date) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
const sameDay = (a: Date, b: Date) => dayKey(a) === dayKey(b);

function windowFor(view: View, anchor: Date): { start: Date; end: Date } {
  if (view === 'day') { const s = startOfDay(anchor); return { start: s, end: addDays(s, 1) }; }
  if (view === 'week') { const s = startOfWeek(anchor); return { start: s, end: addDays(s, 7) }; }
  const s = startOfWeek(new Date(anchor.getFullYear(), anchor.getMonth(), 1));
  return { start: s, end: addDays(s, 42) };
}

const isOpenGap = (s: Shift) => s.status === 'OPEN' || s.status === 'IN_NEGOTIATION';

function chipStyle(s: Shift) {
  switch (s.status) {
    case 'BOOKED': case 'COMPLETED': case 'IN_PROGRESS': return 'bg-emerald-100 text-emerald-900 border-emerald-300 hover:bg-emerald-200';
    case 'OPEN': return s.isEmergency ? 'bg-rose-100 text-rose-900 border-rose-300 hover:bg-rose-200' : 'bg-amber-100 text-amber-900 border-amber-300 hover:bg-amber-200';
    case 'IN_NEGOTIATION': return 'bg-violet-100 text-violet-900 border-violet-300 hover:bg-violet-200';
    default: return 'bg-slate-100 text-slate-600 border-slate-300 hover:bg-slate-200';
  }
}

function Chip({ shift, onClick, showBranch }: { shift: RotaShift; onClick: () => void; showBranch?: boolean }) {
  const who = shift.assignedWorker ? `${shift.assignedWorker.firstName} ${shift.assignedWorker.lastName}` : '';
  return (
    <button
      type="button"
      onClick={onClick}
      title={`${shift.title} · ${shift.status}${who ? ` · ${who}` : ''}`}
      className={clsx('w-full text-left rounded-md border px-1.5 py-1 text-[11px] leading-tight transition-colors', chipStyle(shift), shift.status === 'CANCELLED' && 'line-through')}
    >
      <span className="font-bold">{fmtTime(shift.startTime)}-{fmtTime(shift.endTime)}</span>
      <span className="block truncate">{showBranch ? `${shift.branchName}: ` : ''}{who || shift.title}</span>
    </button>
  );
}

function Gap({ n }: { n: number }) {
  if (!n) return null;
  return <span className="inline-block rounded-full bg-rose-600 text-white text-[10px] font-bold px-1.5 py-0.5">{n} open</span>;
}

const LEGEND: [string, string][] = [
  ['bg-emerald-300', 'Booked'], ['bg-amber-300', 'Open'], ['bg-rose-300', 'Emergency'], ['bg-violet-300', 'In negotiation'], ['bg-slate-300', 'Cancelled / draft'],
];

export default function RotaPage() {
  const { branches, branchIds, loading: scopeLoading } = useScope();
  const [view, setView] = useState<View>('week');
  const [anchor, setAnchor] = useState(() => startOfDay(new Date()));
  const [selected, setSelected] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Shift | null>(null);

  const { start, end } = useMemo(() => windowFor(view, anchor), [view, anchor]);
  const { data, loading, error, reload } = useAsync(async () => {
    if (!branchIds.length) return undefined;
    const lists = await Promise.all(branchIds.map((id) => api.branches.rota(id, start.toISOString(), end.toISOString())));
    const names = new Map(branches.map((b) => [b.id, b.name]));
    return lists.flat().map((s): RotaShift => ({ ...s, branchName: s.branch?.name ?? names.get(s.branchId) ?? 'Branch' }))
      .sort((a, b) => +new Date(a.startTime) - +new Date(b.startTime));
  }, [branchIds.join(','), start.getTime(), end.getTime()]);

  const shifts = data ?? [];
  const byDay = useMemo(() => {
    const m = new Map<string, RotaShift[]>();
    for (const s of shifts) {
      const k = dayKey(new Date(s.startTime));
      m.set(k, [...(m.get(k) ?? []), s]);
    }
    return m;
  }, [shifts]);
  const forDay = (d: Date, branchId?: string) => (byDay.get(dayKey(d)) ?? []).filter((s) => !branchId || s.branchId === branchId);

  const step = (dir: -1 | 1) => {
    if (view === 'day') setAnchor(addDays(anchor, dir));
    else if (view === 'week') setAnchor(addDays(anchor, dir * 7));
    else setAnchor(new Date(anchor.getFullYear(), anchor.getMonth() + dir, 1));
  };

  const today = startOfDay(new Date());
  const title =
    view === 'day' ? anchor.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
    : view === 'week' ? `${start.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })} - ${addDays(end, -1).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}`
    : anchor.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });

  const visibleBranches = branches.filter((b) => branchIds.includes(b.id));
  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(start, i));
  const openFor = (list: Shift[]) => list.filter(isOpenGap).length;

  const openNew = () => { setEditing(null); setFormOpen(true); };

  return (
    <>
      <Header
        title="Multi-Branch Rota"
        subtitle="Coverage across your branches"
        actions={<Button onClick={openNew}><Plus className="w-4 h-4" /> New shift</Button>}
      />
      <main className="p-8 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Button variant="secondary" size="sm" aria-label="Previous" onClick={() => step(-1)}><ChevronLeft className="w-4 h-4" /></Button>
            <Button variant="secondary" size="sm" onClick={() => setAnchor(startOfDay(new Date()))}>Today</Button>
            <Button variant="secondary" size="sm" aria-label="Next" onClick={() => step(1)}><ChevronRight className="w-4 h-4" /></Button>
            <h2 className="ml-2 text-base font-bold text-slate-900">{title}</h2>
          </div>
          <div className="inline-flex rounded-lg border border-slate-300 bg-white p-0.5">
            {(['day', 'week', 'month'] as View[]).map((v) => (
              <button
                key={v}
                onClick={() => setView(v)}
                className={clsx('px-3 py-1 text-xs font-semibold rounded-md capitalize', view === v ? 'bg-emerald-600 text-white' : 'text-slate-600 hover:bg-slate-100')}
              >
                {v}
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap gap-4 text-[11px] text-slate-600">
          {LEGEND.map(([c, t]) => <span key={t} className="inline-flex items-center gap-1.5"><span className={clsx('w-3 h-3 rounded', c)} />{t}</span>)}
        </div>

        {scopeLoading || (loading && !data) ? <LoadingBlock /> : branchIds.length === 0 ? (
          <EmptyState title="No branches available" hint="Your account is not linked to any branch yet." />
        ) : error ? (
          <ErrorBlock error={error} retry={reload} />
        ) : (
          <Card className={clsx('overflow-x-auto', loading && 'opacity-60')}>
            {view === 'week' && (
              <table className="w-full min-w-[900px] table-fixed border-collapse">
                <thead>
                  <tr>
                    <th className="w-36 bg-slate-50 px-3 py-2 text-left text-[11px] font-bold uppercase text-slate-500">Branch</th>
                    {weekDays.map((d) => (
                      <th key={d.getTime()} className={clsx('px-2 py-2 text-left text-[11px] font-bold uppercase', sameDay(d, today) ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-50 text-slate-500')}>
                        <div className="flex items-center justify-between">
                          <span>{d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric' })}</span>
                          <Gap n={openFor(forDay(d))} />
                        </div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {visibleBranches.map((b) => (
                    <tr key={b.id}>
                      <td className="px-3 py-2 text-sm font-semibold text-slate-800 border-t border-slate-100 align-top">{b.name}</td>
                      {weekDays.map((d) => {
                        const list = forDay(d, b.id);
                        return (
                          <td key={d.getTime()} className={clsx('border-t border-l border-slate-100 p-1.5 align-top', sameDay(d, today) && 'bg-emerald-50/40')}>
                            <div className="space-y-1 min-h-[64px]">
                              {list.map((s) => <Chip key={s.id} shift={s} onClick={() => setSelected(s.id)} />)}
                            </div>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            {view === 'month' && (
              <div className="min-w-[760px]">
                <div className="grid grid-cols-7">
                  {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => (
                    <div key={d} className="bg-slate-50 px-2 py-2 text-[11px] font-bold uppercase text-slate-500">{d}</div>
                  ))}
                </div>
                <div className="grid grid-cols-7">
                  {Array.from({ length: 42 }, (_, i) => addDays(start, i)).map((d) => {
                    const list = forDay(d);
                    const inMonth = d.getMonth() === anchor.getMonth();
                    return (
                      <div key={d.getTime()} className={clsx('border-t border-l border-slate-100 p-1.5 min-h-[104px]', !inMonth && 'bg-slate-50/60', sameDay(d, today) && 'bg-emerald-50/50')}>
                        <div className="flex items-center justify-between mb-1">
                          <button
                            onClick={() => { setAnchor(d); setView('day'); }}
                            className={clsx('text-xs font-bold hover:underline', inMonth ? 'text-slate-800' : 'text-slate-400')}
                          >
                            {d.getDate()}
                          </button>
                          <Gap n={openFor(list)} />
                        </div>
                        <div className="space-y-1">
                          {list.slice(0, 3).map((s) => <Chip key={s.id} shift={s} showBranch={visibleBranches.length > 1} onClick={() => setSelected(s.id)} />)}
                          {list.length > 3 && (
                            <button onClick={() => { setAnchor(d); setView('day'); }} className="text-[11px] font-semibold text-emerald-700 hover:underline">
                              +{list.length - 3} more
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {view === 'day' && (
              <div className="divide-y divide-slate-100">
                {visibleBranches.map((b) => {
                  const list = forDay(anchor, b.id);
                  return (
                    <div key={b.id} className="p-4">
                      <div className="flex items-center gap-2 mb-2">
                        <h3 className="text-sm font-bold text-slate-900">{b.name}</h3>
                        <Gap n={openFor(list)} />
                      </div>
                      {list.length === 0 ? <p className="text-sm text-slate-500">No shifts scheduled.</p> : (
                        <ul className="space-y-2">
                          {list.map((s) => (
                            <li key={s.id}>
                              <button
                                onClick={() => setSelected(s.id)}
                                className={clsx('w-full flex items-center gap-4 text-left rounded-lg border px-3 py-2', chipStyle(s))}
                              >
                                <span className="w-28 shrink-0 text-sm font-bold">{fmtTime(s.startTime)}-{fmtTime(s.endTime)}</span>
                                <span className="flex-1 min-w-0">
                                  <span className="block text-sm font-semibold truncate">{s.title}</span>
                                  <span className="block text-xs truncate">
                                    {s.assignedWorker ? `${s.assignedWorker.firstName} ${s.assignedWorker.lastName}` : isOpenGap(s) ? 'Unfilled' : s.roleRequired}
                                  </span>
                                </span>
                                {s.isEmergency && <span className="text-[10px] font-bold uppercase text-rose-700">Emergency</span>}
                                <StatusBadge status={s.status} />
                              </button>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </Card>
        )}
        {!loading && !error && data && shifts.length === 0 && <p className="text-xs text-slate-500">No shifts in this period. Use New shift to create one.</p>}
      </main>

      <ShiftDetailModal
        shiftId={selected}
        onClose={() => setSelected(null)}
        onChanged={reload}
        onEdit={(s) => { setSelected(null); setEditing(s); setFormOpen(true); }}
      />
      <ShiftFormModal
        open={formOpen}
        shift={editing}
        onClose={() => setFormOpen(false)}
        onSaved={(s) => { reload(); const d = new Date(s.startTime); if (!editing) setAnchor(startOfDay(d)); }}
      />
    </>
  );
}
