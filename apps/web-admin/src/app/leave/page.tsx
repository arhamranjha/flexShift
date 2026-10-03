'use client';

import { fmtDate, type LeaveRequest, type LeaveType } from '@flexshift/api-client';
import { Badge, Button, Card, CardHeader, EmptyState, ErrorBlock, Field, Input, LoadingBlock, Modal, Select, StatusBadge, Textarea, td, th, label, useAction, useAsync } from '@flexshift/ui';
import { Plus } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { Header } from '@/components/Header';
import { api, useScope } from '@/lib/auth';
import { useMarket } from '@/lib/market';

const TYPES: LeaveType[] = ['ANNUAL', 'SICK', 'EMERGENCY', 'STUDY', 'UNPAID'];
type Row = LeaveRequest & { branchName: string };
// Local calendar date (toISOString would give the UTC date, wrong just after midnight in BST).
const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

export default function LeavePage() {
  const { market } = useMarket();
  const { branches, branchIds, branchId, loading: scopeLoading } = useScope();
  const { run, busy } = useAction();
  const [recording, setRecording] = useState(false);
  const [approving, setApproving] = useState<Row | null>(null);
  const [backfill, setBackfill] = useState(true);
  const [rate, setRate] = useState('30');
  const [form, setForm] = useState({ branchId: '', staffName: '', staffRole: '', startDate: today(), endDate: today(), leaveType: 'ANNUAL' as LeaveType, reason: '' });

  const { data, error, loading, reload } = useAsync(async () => {
    if (!branchIds.length) return [] as Row[];
    const lists = await Promise.all(branchIds.map((id) => api.leave.byBranch(id)));
    return lists.flatMap((l, i) => l.map((r) => ({ ...r, branchName: branches.find((b) => b.id === branchIds[i])?.name ?? '' })))
      .sort((a, b) => a.startDate.localeCompare(b.startDate));
  }, [branchIds.join(',')]);

  const rows = data ?? [];
  const pending = rows.filter((r) => r.status === 'PENDING');
  const rest = rows.filter((r) => r.status !== 'PENDING').reverse();

  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm((f) => ({ ...f, [k]: v }));
  const formError = form.endDate < form.startDate ? 'End date must not be before the start date' : undefined;
  const formValid = form.branchId && form.staffName.trim() && form.staffRole.trim() && form.startDate && form.endDate && !formError;

  function openRecord() {
    setForm((f) => ({ ...f, branchId: branchId || branches[0]?.id || '' }));
    setRecording(true);
  }

  async function submit() {
    const res = await run(() => api.leave.submit({
      branchId: form.branchId, staffName: form.staffName.trim(), staffRole: form.staffRole.trim(),
      startDate: form.startDate, endDate: form.endDate, leaveType: form.leaveType,
      ...(form.reason.trim() ? { reason: form.reason.trim() } : {}),
    }), 'Leave recorded');
    if (res) { setRecording(false); setForm((f) => ({ ...f, staffName: '', staffRole: '', reason: '' })); reload(); }
  }

  async function approve() {
    if (!approving) return;
    const n = Number(rate);
    const res = await run(() => api.leave.review(approving.id, 'APPROVED', backfill, backfill ? n : undefined),
      backfill ? 'Leave approved, vacancies created on the rota' : 'Leave approved');
    if (res) { setApproving(null); reload(); }
  }

  async function reject(r: Row) {
    if (await run(() => api.leave.review(r.id, 'REJECTED', false), 'Leave rejected')) reload();
  }

  const table = (list: Row[], actions: boolean) => (
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead><tr>{['Staff member', 'Role', 'Branch', 'Dates', 'Type', 'Reason', 'Status', ''].map((h) => <th key={h} className={th}>{h}</th>)}</tr></thead>
        <tbody>
          {list.map((r) => (
            <tr key={r.id}>
              <td className={td + ' font-semibold'}>{r.staffName}</td>
              <td className={td}>{r.staffRole}</td>
              <td className={td}>{r.branchName}</td>
              <td className={td + ' whitespace-nowrap'}>{fmtDate(r.startDate)} to {fmtDate(r.endDate)}</td>
              <td className={td}><Badge>{label(r.leaveType)}</Badge></td>
              <td className={td}>{r.reason ?? '-'}</td>
              <td className={td}><StatusBadge status={r.status} /></td>
              <td className={td + ' whitespace-nowrap space-x-2'}>
                {actions && <>
                  <Button size="sm" onClick={() => { setApproving(r); setBackfill(true); setRate('30'); }}>Approve</Button>
                  <Button size="sm" variant="secondary" disabled={busy} onClick={() => reject(r)}>Reject</Button>
                </>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  const rateNum = Number(rate);
  const rateValid = !backfill || (rateNum >= 1 && rateNum <= 1000);

  return (
    <>
      <Header title="Leave" subtitle="Staff absence and cover" actions={<Button onClick={openRecord}><Plus className="w-4 h-4" />Record leave</Button>} />
      <main className="p-8 space-y-6">
        {scopeLoading || loading ? <Card><LoadingBlock /></Card> : error ? <Card><ErrorBlock error={error} retry={reload} /></Card> : rows.length === 0 ? (
          <Card><EmptyState title="No leave recorded" hint="Record staff leave to plan cover." /></Card>
        ) : (
          <>
            <Card>
              <CardHeader title={`Pending (${pending.length})`} subtitle="Awaiting your decision" />
              {pending.length ? table(pending, true) : <EmptyState title="No pending requests" />}
            </Card>
            {rest.length > 0 && <Card><CardHeader title="Reviewed" />{table(rest, false)}</Card>}
          </>
        )}
      </main>

      <Modal open={recording} onClose={() => setRecording(false)} title="Record leave"
        footer={<><Button variant="secondary" onClick={() => setRecording(false)}>Cancel</Button><Button loading={busy} disabled={!formValid} onClick={submit}>Record</Button></>}>
        <Field label="Branch">
          <Select value={form.branchId} onChange={(e) => set('branchId', e.target.value)}>
            {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </Select>
        </Field>
        <Field label="Staff name"><Input value={form.staffName} onChange={(e) => set('staffName', e.target.value)} /></Field>
        <Field label="Role"><Input value={form.staffRole} onChange={(e) => set('staffRole', e.target.value)} placeholder={market.professions[0] ? `e.g. ${market.professions[0]}` : undefined} /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Start date"><Input type="date" value={form.startDate} onChange={(e) => set('startDate', e.target.value)} /></Field>
          <Field label="End date" error={formError}><Input type="date" value={form.endDate} onChange={(e) => set('endDate', e.target.value)} /></Field>
        </div>
        <Field label="Type">
          <Select value={form.leaveType} onChange={(e) => set('leaveType', e.target.value as LeaveType)}>
            {TYPES.map((t) => <option key={t} value={t}>{label(t)}</option>)}
          </Select>
        </Field>
        <Field label="Reason (optional)"><Textarea value={form.reason} onChange={(e) => set('reason', e.target.value)} /></Field>
      </Modal>

      <Modal open={!!approving} onClose={() => setApproving(null)} title="Approve leave"
        footer={<><Button variant="secondary" onClick={() => setApproving(null)}>Cancel</Button><Button loading={busy} disabled={!rateValid} onClick={approve}>Approve</Button></>}>
        {approving && (
          <>
            <p className="text-sm text-slate-700"><span className="font-semibold">{approving.staffName}</span> · {fmtDate(approving.startDate)} to {fmtDate(approving.endDate)}</p>
            <label className="flex items-center gap-2 text-sm font-semibold text-slate-800">
              <input type="checkbox" checked={backfill} onChange={(e) => setBackfill(e.target.checked)} />
              Create relief vacancies to cover this leave
            </label>
            {backfill && (
              <>
                <Field label={`Hourly rate for vacancies (${market.currency})`}>
                  <Input type="number" min={1} max={1000} step="0.5" value={rate} onChange={(e) => setRate(e.target.value)} />
                </Field>
                <p className="text-xs text-slate-500">
                  One vacancy (09:00 to 17:30) is created per day of leave, skipping days already past. Short single-shift leave creates one vacancy.
                  Vacancies appear on the <Link href="/rota" className="text-emerald-700 font-semibold hover:underline">rota</Link>.
                </p>
              </>
            )}
          </>
        )}
      </Modal>
    </>
  );
}
