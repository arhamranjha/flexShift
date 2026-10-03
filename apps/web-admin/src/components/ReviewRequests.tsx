'use client';

import { Badge, Button, Card, Field, Modal, Select, th, td, useAction, useAsync } from '@flexshift/ui';
import type { DocumentShare, StaffBankTier } from '@flexshift/api-client';
import { Inbox } from 'lucide-react';
import { useState } from 'react';
import { fmtLong } from '@/components/DocHelpers';
import { TIERS } from '@/components/AddToStaffBankModal';
import { api, useAuth, useScope } from '@/lib/auth';

/**
 * Workers who asked this organization to review their documents (the worker-initiated verification path).
 * While a request waits, the worker's documents appear in the queue below; accepting adds them to the staff bank.
 */
export function ReviewRequests({ onAnswered }: { onAnswered: () => void }) {
  const { user } = useAuth();
  const { data, error, reload } = useAsync(() => api.documentShares.list({ status: 'PENDING' }), []);
  const [accepting, setAccepting] = useState<DocumentShare | null>(null);
  const { run, busy } = useAction();
  const done = () => { reload(); onAnswered(); };

  if (error) return <p className="text-sm text-rose-600">Could not load review requests.</p>;
  if (!data?.length) return null;

  return (
    <Card>
      <div className="px-4 py-3 border-b border-slate-100 flex items-center gap-2">
        <Inbox className="w-4 h-4 text-emerald-700" />
        <h2 className="font-bold text-slate-900">Review requests</h2>
        <Badge tone="amber">{data.length}</Badge>
        <p className="text-xs text-slate-500 ml-2">These workers asked you to review their documents. Their uploads are in the queue below.</p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead><tr>
            <th className={th}>Worker</th>
            {user?.role === 'SUPER_ADMIN' && <th className={th}>Organization</th>}
            <th className={th}>Documents</th><th className={th}>Asked</th><th className={th} />
          </tr></thead>
          <tbody>
            {data.map((s) => {
              const w = s.reliefWorker;
              const docs = w?.documents ?? [];
              const verified = docs.filter((d) => d.status === 'VERIFIED').length;
              const pending = docs.filter((d) => d.status === 'PENDING').length;
              return (
                <tr key={s.id}>
                  <td className={td}>
                    <p className="font-semibold text-slate-900">{w ? `${w.firstName} ${w.lastName}` : '-'}</p>
                    <p className="text-xs text-slate-500">{w?.profession} · {w?.registrationNumber}{w?.country ? ` · ${w.country}` : ''}</p>
                  </td>
                  {user?.role === 'SUPER_ADMIN' && <td className={td}>{s.organization?.name}</td>}
                  <td className={td}>
                    <span className="text-sm">{verified} verified, {pending} waiting</span>
                    {w?.isVerified && <Badge tone="emerald" className="ml-2">Verified</Badge>}
                  </td>
                  <td className={td}>{fmtLong(s.createdAt)}</td>
                  <td className={`${td} whitespace-nowrap text-right`}>
                    <Button size="sm" variant="secondary" disabled={busy}
                      onClick={async () => { if (await run(() => api.documentShares.decline(s.id), 'Request declined')) done(); }}>
                      Decline
                    </Button>
                    <Button size="sm" className="ml-2" onClick={() => setAccepting(s)}>Add to staff bank</Button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <AcceptModal share={accepting} onClose={() => setAccepting(null)} onDone={done} />
    </Card>
  );
}

function AcceptModal({ share, onClose, onDone }: { share: DocumentShare | null; onClose: () => void; onDone: () => void }) {
  const { user } = useAuth();
  const { branches } = useScope();
  const { run, busy } = useAction();
  const isManager = user?.role === 'FACILITY_MANAGER';
  const [tier, setTier] = useState<StaffBankTier>('TIER_2_REGULAR');
  const [branchId, setBranchId] = useState('');
  const w = share?.reliefWorker;

  async function accept() {
    if (!share) return;
    // Managers always add to their own branch (the server enforces it); super admins add organization-wide.
    const body = { tier, ...(!isManager && user?.role !== 'SUPER_ADMIN' && branchId ? { branchId } : {}) };
    if (await run(() => api.documentShares.accept(share.id, body), `${w?.firstName} ${w?.lastName} added to the staff bank`)) {
      setTier('TIER_2_REGULAR'); setBranchId(''); onClose(); onDone();
    }
  }

  return (
    <Modal open={!!share} onClose={onClose} title="Add to staff bank"
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button loading={busy} onClick={accept}>Add to staff bank</Button></>}>
      {w && <p className="text-sm">Add <b>{w.firstName} {w.lastName}</b> to your staff bank. {!w.isVerified && 'Their documents are not all verified yet; they cannot book shifts until they are.'}</p>}
      <Field label="Tier">
        <Select value={tier} onChange={(e) => setTier(e.target.value as StaffBankTier)}>
          {TIERS.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
        </Select>
      </Field>
      {user?.role === 'ORG_ADMIN' && (
        <Field label="Branch" hint="Leave empty for an organization-wide member.">
          <Select value={branchId} onChange={(e) => setBranchId(e.target.value)}>
            <option value="">Organization-wide</option>
            {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </Select>
        </Field>
      )}
      {isManager && <p className="text-xs text-slate-500">They will be added to your branch.</p>}
    </Modal>
  );
}
