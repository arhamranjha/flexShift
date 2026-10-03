'use client';

import { fmtRange, money, titleCase, type Shift, type ShiftStatus, type ShiftVisibility } from '@flexshift/api-client';
import { Badge, Button, Card, EmptyState, ErrorBlock, Field, Input, LoadingBlock, Modal, Select, StatusBadge, td, Textarea, th, useAction, useAsync } from '@flexshift/ui';
import { Plus } from 'lucide-react';
import { useState } from 'react';
import { Header } from '@/components/Header';
import { ShiftDetailModal } from '@/components/ShiftDetailModal';
import { ShiftFormModal } from '@/components/ShiftFormModal';
import { api, useScope } from '@/lib/auth';
import { useMarket } from '@/lib/market';

const STATUSES: ShiftStatus[] = ['DRAFT', 'OPEN', 'IN_NEGOTIATION', 'BOOKED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'];
const VISIBILITIES: ShiftVisibility[] = ['STAFF_BANK_ONLY', 'PUBLIC_MARKETPLACE', 'EMERGENCY_BROADCAST'];

export default function ShiftsPage() {
  const { branchId, branchIds, loading: scopeLoading } = useScope();
  const { currency } = useMarket();
  const { run, busy } = useAction();
  const [status, setStatus] = useState<ShiftStatus | ''>('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [detailId, setDetailId] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Shift | null>(null);
  const [cancelling, setCancelling] = useState<Shift | null>(null);
  const [reason, setReason] = useState('');

  const { data, loading, error, reload } = useAsync(
    () =>
      branchIds.length
        ? api.shifts.list({
            branchId: branchId || undefined,
            status: status || undefined,
            startDate: from ? new Date(`${from}T00:00:00`).toISOString() : undefined,
            endDate: to ? new Date(`${to}T23:59:59`).toISOString() : undefined,
          })
        : Promise.resolve(undefined),
    [branchId, branchIds.join(','), status, from, to],
  );

  const openForm = (s: Shift | null) => { setEditing(s); setFormOpen(true); };
  const publish = (s: Shift) => run(() => api.shifts.setStatus(s.id, 'OPEN'), 'Shift published').then((r) => r && reload());
  const setVisibility = (s: Shift, v: ShiftVisibility) =>
    run(() => api.shifts.update(s.id, { visibility: v }), `Visibility set to ${titleCase(v)}`).then(() => reload());
  const confirmCancel = async () => {
    if (!cancelling) return;
    const ok = await run(() => api.shifts.setStatus(cancelling.id, 'CANCELLED', reason.trim() || undefined), 'Shift cancelled');
    if (ok) { setCancelling(null); setReason(''); reload(); }
  };

  const shifts = data ?? [];

  return (
    <>
      <Header title="Shifts" subtitle="Create, publish and manage vacancies" actions={<Button onClick={() => openForm(null)}><Plus className="w-4 h-4" /> New shift</Button>} />
      <main className="p-8 space-y-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="w-44">
            <Field label="Status">
              <Select value={status} onChange={(e) => setStatus(e.target.value as ShiftStatus | '')}>
                <option value="">All statuses</option>
                {STATUSES.map((s) => <option key={s} value={s}>{titleCase(s)}</option>)}
              </Select>
            </Field>
          </div>
          <div className="w-40"><Field label="From"><Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></Field></div>
          <div className="w-40"><Field label="To"><Input type="date" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} /></Field></div>
          {(status || from || to) && <Button variant="ghost" size="sm" onClick={() => { setStatus(''); setFrom(''); setTo(''); }}>Clear filters</Button>}
        </div>

        <Card className="overflow-x-auto">
          {scopeLoading || (loading && !data) ? <LoadingBlock /> : error ? <ErrorBlock error={error} retry={reload} /> : branchIds.length === 0 ? (
            <EmptyState title="No branches available" hint="Your account is not linked to any branch yet." />
          ) : shifts.length === 0 ? (
            <EmptyState
              title="No shifts found"
              hint={status || from || to ? 'Try widening your filters.' : 'Create your first shift to start filling vacancies.'}
              action={<Button size="sm" onClick={() => openForm(null)}>New shift</Button>}
            />
          ) : (
            <table className="w-full min-w-[1000px]">
              <thead>
                <tr>
                  {['Shift', 'Branch', 'When', 'Rate', 'Visibility', 'Status', 'Applicants', 'Worker', 'Actions'].map((h) => <th key={h} className={th}>{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {shifts.map((s) => {
                  const editable = !['COMPLETED', 'CANCELLED'].includes(s.status);
                  const widen = editable && s.visibility === 'STAFF_BANK_ONLY' && s.status !== 'BOOKED' && s.status !== 'IN_PROGRESS';
                  return (
                    <tr key={s.id} className="hover:bg-slate-50/60">
                      <td className={td}>
                        <button onClick={() => setDetailId(s.id)} className="text-left font-semibold text-slate-900 hover:text-emerald-700 hover:underline">{s.title}</button>
                        <div className="flex gap-1 mt-0.5">{s.isEmergency && <Badge tone="rose">Emergency</Badge>}{s.isOvernight && <Badge>Overnight</Badge>}</div>
                      </td>
                      <td className={`${td} max-w-[9rem]`}>{s.branch?.name}</td>
                      <td className={`${td} whitespace-nowrap`}>{fmtRange(s.startTime, s.endTime)}</td>
                      <td className={td}>{money(s.hourlyRate, s.currency ?? currency)}/h</td>
                      <td className={td}>
                        {editable && s.status !== 'BOOKED' && s.status !== 'IN_PROGRESS' ? (
                          <Select
                            aria-label="Visibility"
                            value={s.visibility}
                            disabled={busy}
                            onChange={(e) => setVisibility(s, e.target.value as ShiftVisibility)}
                            className="!py-1 !text-xs !w-44"
                          >
                            {VISIBILITIES.map((v) => <option key={v} value={v}>{titleCase(v)}</option>)}
                          </Select>
                        ) : <span className="text-xs">{titleCase(s.visibility)}</span>}
                      </td>
                      <td className={td}><StatusBadge status={s.status} /></td>
                      <td className={td}>
                        <button onClick={() => setDetailId(s.id)} className="text-emerald-700 font-semibold hover:underline">
                          {s._count?.applications ?? 0}{(s._count?.negotiations ?? 0) > 0 ? ` + ${s._count!.negotiations} offers` : ''}
                        </button>
                      </td>
                      <td className={td}>{s.assignedWorker ? `${s.assignedWorker.firstName} ${s.assignedWorker.lastName}` : <span className="text-slate-400">-</span>}</td>
                      <td className={`${td} whitespace-nowrap`}>
                        <div className="flex flex-wrap gap-1.5">
                          {s.status === 'DRAFT' && <Button size="sm" disabled={busy} onClick={() => publish(s)}>Publish</Button>}
                          {widen && s.status !== 'DRAFT' && (
                            <Button size="sm" variant="secondary" disabled={busy} onClick={() => setVisibility(s, 'PUBLIC_MARKETPLACE')}>Make public</Button>
                          )}
                          {editable && <Button size="sm" variant="secondary" onClick={() => openForm(s)}>Edit</Button>}
                          {['DRAFT', 'OPEN', 'IN_NEGOTIATION', 'BOOKED'].includes(s.status) && (
                            <Button size="sm" variant="ghost" className="!text-rose-600" onClick={() => { setCancelling(s); setReason(''); }}>Cancel</Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </Card>
        {shifts.length >= 500 && <p className="text-xs text-slate-500">Showing the first 500 shifts. Narrow the date range to see more.</p>}
      </main>

      <ShiftDetailModal
        shiftId={detailId}
        onClose={() => setDetailId(null)}
        onChanged={reload}
        onEdit={(s) => { setDetailId(null); openForm(s); }}
      />
      <ShiftFormModal open={formOpen} shift={editing} onClose={() => setFormOpen(false)} onSaved={() => reload()} />

      <Modal
        open={!!cancelling}
        onClose={() => setCancelling(null)}
        title="Cancel shift"
        footer={
          <>
            <Button variant="secondary" onClick={() => setCancelling(null)}>Keep shift</Button>
            <Button variant="danger" loading={busy} onClick={confirmCancel}>Cancel shift</Button>
          </>
        }
      >
        <p className="text-sm text-slate-700">
          Cancel <strong>{cancelling?.title}</strong>
          {cancelling?.assignedWorker ? `? ${cancelling.assignedWorker.firstName} ${cancelling.assignedWorker.lastName} will lose this booking.` : '?'}
        </p>
        <Field label="Reason (optional)"><Textarea value={reason} maxLength={500} onChange={(e) => setReason(e.target.value)} /></Field>
      </Modal>
    </>
  );
}
