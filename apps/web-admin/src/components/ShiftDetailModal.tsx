'use client';

import { ApiError, fmtRange, gbp, shiftHours, titleCase, type ReliefProfile, type Shift } from '@flexshift/api-client';
import { Badge, Button, ErrorBlock, Field, Input, LoadingBlock, Modal, StatusBadge, Textarea, useAction, useAsync, useToast } from '@flexshift/ui';
import { AlertTriangle, Pencil } from 'lucide-react';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import { api, useAuth } from '@/lib/auth';

const workerName = (w?: { firstName: string; lastName: string } | null) => (w ? `${w.firstName} ${w.lastName}` : '');

/** Shift details + assignment + status actions, shared by the rota and shifts pages. */
export function ShiftDetailModal({
  shiftId, onClose, onChanged, onEdit,
}: {
  shiftId: string | null;
  onClose: () => void;
  /** Called after any mutation so the parent can reload. */
  onChanged: () => void;
  onEdit?: (shift: Shift) => void;
}) {
  const open = !!shiftId;
  const { user } = useAuth();
  const toast = useToast();
  const { run, busy } = useAction();
  const { data: shift, loading, error, reload } = useAsync(
    () => (shiftId ? api.shifts.get(shiftId) : Promise.resolve(undefined)),
    [shiftId],
  );
  const [search, setSearch] = useState('');
  const [problems, setProblems] = useState<string[]>([]);
  const [problemMsg, setProblemMsg] = useState('');
  const [override, setOverride] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [reason, setReason] = useState('');
  const canOverride = user?.role === 'ORG_ADMIN' || user?.role === 'SUPER_ADMIN';

  const assignable = shift?.status === 'OPEN' || shift?.status === 'IN_NEGOTIATION';
  const workers = useAsync(
    () => (assignable ? api.workers.list({ isVerified: true }) : Promise.resolve([] as ReliefProfile[])),
    [assignable, shiftId],
  );
  const candidates = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (workers.data ?? [])
      .filter((w) => !q || `${w.firstName} ${w.lastName} ${w.profession} ${w.registrationNumber}`.toLowerCase().includes(q))
      .slice(0, 8);
  }, [workers.data, search]);

  const changed = () => { reload(); onChanged(); };

  const [assigning, setAssigning] = useState(false);
  const assign = async (workerId: string) => {
    if (!shift || assigning) return;
    setAssigning(true);
    setProblems([]);
    setProblemMsg('');
    try {
      await api.shifts.assign(shift.id, workerId, override || undefined);
      toast.success('Worker assigned');
      setOverride(false);
      changed();
    } catch (e) {
      if (e instanceof ApiError) {
        const d = e.details as { problems?: string[] } | null | undefined;
        if (d?.problems?.length) {
          setProblems(d.problems);
          setProblemMsg(e.message);
          return;
        }
      }
      toast.error(e instanceof Error ? e.message : 'Could not assign worker');
    } finally {
      setAssigning(false);
    }
  };

  const setStatus = async (status: Shift['status'], msg: string, why?: string) => {
    if (!shift) return;
    const ok = await run(() => api.shifts.setStatus(shift.id, status, why), msg);
    if (ok) { setConfirmCancel(false); setReason(''); changed(); }
  };

  const close = () => { setSearch(''); setProblems([]); setConfirmCancel(false); setOverride(false); onClose(); };

  return (
    <Modal open={open} onClose={close} wide title={shift?.title ?? 'Shift details'}>
      {loading && !shift ? <LoadingBlock /> : error ? <ErrorBlock error={error} retry={reload} /> : shift && (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge status={shift.status} />
            {shift.isEmergency && <Badge tone="rose">Emergency</Badge>}
            {shift.isOvernight && <Badge tone="slate">Overnight</Badge>}
            {shift.instantBookEnabled && <Badge tone="sky">Instant book</Badge>}
            <Badge tone="slate">{titleCase(shift.visibility)}</Badge>
          </div>

          <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
            <div><dt className="text-xs text-slate-500">Branch</dt><dd className="font-semibold text-slate-900">{shift.branch?.name ?? '-'}</dd></div>
            <div><dt className="text-xs text-slate-500">Role</dt><dd className="font-semibold text-slate-900">{shift.roleRequired}</dd></div>
            <div className="col-span-2"><dt className="text-xs text-slate-500">When</dt><dd className="font-semibold text-slate-900">{fmtRange(shift.startTime, shift.endTime)} ({shiftHours(shift.startTime, shift.endTime).toFixed(1)}h)</dd></div>
            <div><dt className="text-xs text-slate-500">Rate</dt><dd className="font-semibold text-slate-900">{gbp(shift.hourlyRate)}/h</dd></div>
            <div><dt className="text-xs text-slate-500">Estimated pay</dt><dd className="font-semibold text-slate-900">{gbp(shift.totalEstimatedPay)}</dd></div>
            <div className="col-span-2">
              <dt className="text-xs text-slate-500 mb-1">Requirements</dt>
              <dd className="flex flex-wrap gap-1.5">
                {[...shift.requiredSystems, ...shift.requiredAccreditations].length === 0 && <span className="text-slate-500">None specified</span>}
                {shift.requiredSystems.map((s) => <Badge key={s} tone="sky">{s}</Badge>)}
                {shift.requiredAccreditations.map((s) => <Badge key={s} tone="violet">{s}</Badge>)}
              </dd>
            </div>
            {shift.notes && <div className="col-span-2"><dt className="text-xs text-slate-500">Notes</dt><dd className="text-slate-700">{shift.notes}</dd></div>}
            {shift.assignedWorker && (
              <div className="col-span-2"><dt className="text-xs text-slate-500">Assigned worker</dt><dd className="font-semibold text-slate-900">{workerName(shift.assignedWorker)}</dd></div>
            )}
          </dl>

          <div className="flex flex-wrap gap-2">
            {onEdit && shift.status !== 'COMPLETED' && shift.status !== 'CANCELLED' && (
              <Button size="sm" variant="secondary" onClick={() => onEdit(shift)}><Pencil className="w-3 h-3" /> Edit</Button>
            )}
            {shift.status === 'DRAFT' && <Button size="sm" loading={busy} onClick={() => setStatus('OPEN', 'Shift published')}>Publish</Button>}
            {shift.status === 'BOOKED' && (
              <Button size="sm" variant="secondary" loading={busy} onClick={() => setStatus('OPEN', 'Worker released, shift reopened')}>Release worker</Button>
            )}
            {['DRAFT', 'OPEN', 'IN_NEGOTIATION', 'BOOKED'].includes(shift.status) && (
              <Button size="sm" variant="danger" onClick={() => setConfirmCancel(true)}>Cancel shift</Button>
            )}
          </div>

          {confirmCancel && (
            <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 space-y-2">
              <Field label="Reason for cancelling (optional)">
                <Textarea value={reason} maxLength={500} onChange={(e) => setReason(e.target.value)} />
              </Field>
              <div className="flex gap-2">
                <Button size="sm" variant="danger" loading={busy} onClick={() => setStatus('CANCELLED', 'Shift cancelled', reason.trim() || undefined)}>Confirm cancel</Button>
                <Button size="sm" variant="ghost" onClick={() => setConfirmCancel(false)}>Keep shift</Button>
              </div>
            </div>
          )}

          {assignable && (
            <section className="space-y-2 border-t border-slate-100 pt-4">
              <h4 className="text-sm font-bold text-slate-900">Assign worker</h4>
              {(shift.applications?.length ?? 0) > 0 && (
                <p className="text-xs text-slate-500">{shift.applications!.length} applicant(s) are listed below; you can also pick any verified worker.</p>
              )}
              <Input placeholder="Search verified workers by name, profession or registration" value={search} onChange={(e) => setSearch(e.target.value)} />
              {problems.length > 0 && (
                <div role="alert" className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm">
                  <p className="font-semibold text-rose-800 flex items-center gap-1.5"><AlertTriangle className="w-4 h-4" /> {problemMsg || 'This worker cannot be assigned'}</p>
                  <ul className="list-disc pl-5 mt-1 text-rose-700 text-xs space-y-0.5">{problems.map((p) => <li key={p}>{p}</li>)}</ul>
                  {canOverride && (
                    <label className="mt-2 inline-flex items-center gap-2 text-xs text-slate-700">
                      <input type="checkbox" checked={override} onChange={(e) => setOverride(e.target.checked)} className="rounded border-slate-300" />
                      Override missing systems/accreditations (documents are never skipped), then pick the worker again
                    </label>
                  )}
                </div>
              )}
              {workers.loading ? <LoadingBlock text="Loading workers…" /> : workers.error ? <ErrorBlock error={workers.error} retry={workers.reload} /> : candidates.length === 0 ? (
                <p className="text-sm text-slate-500 py-3">No verified workers match.</p>
              ) : (
                <ul className="divide-y divide-slate-100 border border-slate-200 rounded-lg">
                  {candidates.map((w) => (
                    <li key={w.id} className="flex items-center justify-between gap-3 px-3 py-2">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-slate-900 truncate">{workerName(w)}</p>
                        <p className="text-xs text-slate-500 truncate">{w.profession} · {[...w.systemTags, ...w.accreditations].join(', ') || 'No tags'}</p>
                      </div>
                      <Button size="sm" disabled={busy} onClick={() => assign(w.id)}>Assign</Button>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}

          <section className="space-y-2 border-t border-slate-100 pt-4">
            <h4 className="text-sm font-bold text-slate-900">Applications ({shift.applications?.length ?? 0})</h4>
            {(shift.applications?.length ?? 0) === 0 ? <p className="text-sm text-slate-500">No applications yet.</p> : (
              <ul className="divide-y divide-slate-100 border border-slate-200 rounded-lg">
                {shift.applications!.map((a) => (
                  <li key={a.id} className="flex items-center justify-between gap-3 px-3 py-2">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-slate-900">{workerName(a.reliefWorker) || 'Worker'}</p>
                      <p className="text-xs text-slate-500 truncate">{a.notes || a.reliefWorker?.profession}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <StatusBadge status={a.status} />
                      {assignable && a.status !== 'REJECTED' && a.status !== 'WITHDRAWN' && (
                        <Button size="sm" disabled={busy} onClick={() => assign(a.reliefWorkerId)}>Assign</Button>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="space-y-2 border-t border-slate-100 pt-4">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-bold text-slate-900">Negotiations ({shift.negotiations?.length ?? 0})</h4>
              {(shift.negotiations?.length ?? 0) > 0 && <Link href="/negotiations" className="text-xs font-semibold text-emerald-700 hover:underline">Manage in Rate Negotiations</Link>}
            </div>
            {(shift.negotiations?.length ?? 0) === 0 ? <p className="text-sm text-slate-500">No rate offers.</p> : (
              <ul className="divide-y divide-slate-100 border border-slate-200 rounded-lg">
                {shift.negotiations!.map((n) => (
                  <li key={n.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                    <span className="font-semibold text-slate-900">{workerName(n.reliefWorker) || 'Worker'}</span>
                    <span className="text-slate-600">
                      {gbp(n.proposedHourlyRate)}/h{n.counterOfferRate ? ` (counter ${gbp(n.counterOfferRate)})` : ''}
                    </span>
                    <StatusBadge status={n.status} />
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </Modal>
  );
}
