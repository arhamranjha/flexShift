'use client';

import { type StaffBankMember, type StaffBankTier, gbp } from '@flexshift/api-client';
import {
  Badge, Button, Card, CardHeader, EmptyState, ErrorBlock, Field, Input, LoadingBlock, Modal, Select, Textarea,
  th, td, useAction, useAsync,
} from '@flexshift/ui';
import { Pencil, Power, Trash2, UserPlus } from 'lucide-react';
import { useState } from 'react';
import { AddToStaffBankModal, TIERS } from '@/components/AddToStaffBankModal';
import { Header } from '@/components/Header';
import { api, useAuth, useScope } from '@/lib/auth';

const SECTION_HINT: Record<StaffBankTier, string> = {
  TIER_1_PREFERRED: 'First call for shifts',
  TIER_2_REGULAR: 'Regular, reliable cover',
  TIER_3_RESERVE: 'Backup when others are unavailable',
};

export default function StaffBankPage() {
  const { user } = useAuth();
  const { orgId, branchId } = useScope();
  const { run, busy } = useAction();
  const isAdmin = user?.role === 'ORG_ADMIN' || user?.role === 'SUPER_ADMIN';

  const [tierFilter, setTierFilter] = useState<'' | StaffBankTier>('');
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<StaffBankMember | null>(null);
  const [removing, setRemoving] = useState<StaffBankMember | null>(null);
  const [rate, setRate] = useState('');
  const [notes, setNotes] = useState('');

  const { data, error, loading, reload } = useAsync(
    () => (orgId ? api.staffBank.list(orgId, branchId || undefined) : Promise.resolve(undefined)),
    [orgId, branchId],
  );

  const members = (data ?? []).filter((m) => !tierFilter || m.tier === tierFilter);

  const openEdit = (m: StaffBankMember) => {
    setEditing(m);
    setRate(m.customHourlyRate != null ? String(Number(m.customHourlyRate)) : '');
    setNotes(m.notes ?? '');
  };
  const rateNum = rate.trim() === '' ? undefined : Number(rate);
  const rateInvalid = rateNum !== undefined && (!Number.isFinite(rateNum) || rateNum <= 0);

  const update = async (m: StaffBankMember, body: Parameters<typeof api.staffBank.update>[1], msg: string) => {
    const out = await run(() => api.staffBank.update(m.id, body), msg);
    if (out) reload();
    return out;
  };

  const saveEdit = async () => {
    if (!editing) return;
    const body: Parameters<typeof api.staffBank.update>[1] = { notes: notes.trim() };
    // Blank clears a previously agreed rate; a number sets it.
    if (rateNum !== undefined) body.customHourlyRate = rateNum;
    else if (editing.customHourlyRate != null) body.customHourlyRate = null;
    if (await update(editing, body, 'Staff bank member updated')) setEditing(null);
  };

  const confirmRemove = async () => {
    if (!removing) return;
    const out = await run(() => api.staffBank.remove(removing.id), 'Removed from staff bank');
    if (out) { setRemoving(null); reload(); }
  };

  return (
    <>
      <Header
        title="Staff bank"
        subtitle="Your pool of trusted relief workers, ranked by tier"
        actions={<Button onClick={() => setAdding(true)}><UserPlus className="w-4 h-4" />Add to staff bank</Button>}
      />
      <main className="p-8 space-y-6">
        <div className="flex items-center gap-3">
          <div className="w-52">
            <Select value={tierFilter} onChange={(e) => setTierFilter(e.target.value as '' | StaffBankTier)} aria-label="Filter by tier">
              <option value="">All tiers</option>
              {TIERS.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </Select>
          </div>
          <span className="text-xs text-slate-500">{members.length} member{members.length === 1 ? '' : 's'}</span>
        </div>

        {!orgId || loading ? <LoadingBlock /> : error ? <ErrorBlock error={error} retry={reload} /> : !data?.length ? (
          <Card><EmptyState title="No staff bank members yet" hint="Add trusted relief workers so they get first access to your shifts." action={<Button onClick={() => setAdding(true)}>Add to staff bank</Button>} /></Card>
        ) : !members.length ? (
          <Card><EmptyState title="No members in this tier" /></Card>
        ) : (
          TIERS.filter((t) => !tierFilter || t.value === tierFilter).map((t) => {
            const rows = members.filter((m) => m.tier === t.value);
            return (
              <Card key={t.value}>
                <CardHeader title={`${t.label} (${rows.length})`} subtitle={SECTION_HINT[t.value]} />
                {!rows.length ? <p className="px-5 py-6 text-sm text-slate-400">No workers in this tier.</p> : (
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr>
                          <th className={th}>Worker</th><th className={th}>Registration</th><th className={th}>Branch</th>
                          <th className={th}>Rate</th><th className={th}>Shifts</th><th className={th}>Tier</th>
                          <th className={th}>Notes</th><th className={th} />
                        </tr>
                      </thead>
                      <tbody>
                        {rows.map((m) => {
                          const w = m.reliefWorker;
                          return (
                            <tr key={m.id} className={m.isActive ? '' : 'opacity-60'}>
                              <td className={td}>
                                <p className="font-semibold text-slate-900">{w ? `${w.firstName} ${w.lastName}` : 'Unknown'}</p>
                                <p className="text-xs text-slate-500 flex items-center gap-1.5">
                                  {w?.profession}
                                  {w?.isVerified ? <Badge tone="emerald">Verified</Badge> : <Badge tone="amber">Unverified</Badge>}
                                  {!m.isActive && <Badge>Inactive</Badge>}
                                </p>
                              </td>
                              <td className={td}>{w?.registrationNumber ?? '-'}</td>
                              <td className={td}>{m.branch?.name ?? <span className="text-slate-400">Organization-wide</span>}</td>
                              <td className={td}>
                                {m.customHourlyRate != null ? (
                                  <>
                                    <span className="font-semibold">{gbp(m.customHourlyRate)}</span>
                                    {w?.hourlyRate != null && <span className="block text-xs text-slate-400">standard {gbp(w.hourlyRate)}</span>}
                                  </>
                                ) : w?.hourlyRate != null ? <span>{gbp(w.hourlyRate)} <span className="text-xs text-slate-400">standard</span></span> : '-'}
                              </td>
                              <td className={td}>{w?._count?.assignedShifts ?? '-'}</td>
                              <td className={td}>
                                <Select
                                  className="!py-1 !text-xs w-36"
                                  value={m.tier}
                                  disabled={busy}
                                  onChange={(e) => update(m, { tier: e.target.value as StaffBankTier }, 'Tier updated')}
                                  aria-label="Change tier"
                                >
                                  {TIERS.map((x) => <option key={x.value} value={x.value}>{x.label}</option>)}
                                </Select>
                              </td>
                              <td className={`${td} max-w-[200px] truncate`} title={m.notes ?? ''}>{m.notes || <span className="text-slate-300">-</span>}</td>
                              <td className={`${td} whitespace-nowrap`}>
                                <div className="flex gap-1 justify-end">
                                  <Button variant="ghost" size="sm" onClick={() => openEdit(m)} aria-label="Edit"><Pencil className="w-3.5 h-3.5" /></Button>
                                  <Button variant="ghost" size="sm" disabled={busy} onClick={() => update(m, { isActive: !m.isActive }, m.isActive ? 'Member deactivated' : 'Member activated')}>
                                    <Power className="w-3.5 h-3.5" />{m.isActive ? 'Deactivate' : 'Activate'}
                                  </Button>
                                  {isAdmin && <Button variant="ghost" size="sm" onClick={() => setRemoving(m)} aria-label="Remove"><Trash2 className="w-3.5 h-3.5 text-rose-600" /></Button>}
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </Card>
            );
          })
        )}
      </main>

      <AddToStaffBankModal open={adding} onClose={() => setAdding(false)} onAdded={reload} />

      <Modal
        open={!!editing}
        onClose={() => setEditing(null)}
        title={editing?.reliefWorker ? `Edit ${editing.reliefWorker.firstName} ${editing.reliefWorker.lastName}` : 'Edit member'}
        footer={(<><Button variant="secondary" onClick={() => setEditing(null)}>Cancel</Button><Button onClick={saveEdit} loading={busy} disabled={rateInvalid}>Save</Button></>)}
      >
        <Field label="Custom hourly rate (£)" error={rateInvalid ? 'Enter a positive number.' : undefined} hint={editing?.reliefWorker?.hourlyRate != null ? `Standard rate ${gbp(editing.reliefWorker.hourlyRate)}/hr` : undefined}>
          <Input type="number" min="0" step="0.01" value={rate} onChange={(e) => setRate(e.target.value)} />
        </Field>
        <Field label="Notes"><Textarea value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={500} /></Field>
      </Modal>

      <Modal
        open={!!removing}
        onClose={() => setRemoving(null)}
        title="Remove from staff bank"
        footer={(<><Button variant="secondary" onClick={() => setRemoving(null)}>Cancel</Button><Button variant="danger" onClick={confirmRemove} loading={busy}>Remove</Button></>)}
      >
        <p className="text-sm text-slate-700">
          Remove <strong>{removing?.reliefWorker?.firstName} {removing?.reliefWorker?.lastName}</strong> from the staff bank
          {removing?.branch ? ` (${removing.branch.name})` : ''}? Consider deactivating instead if you may want them back.
        </p>
      </Modal>
    </>
  );
}
