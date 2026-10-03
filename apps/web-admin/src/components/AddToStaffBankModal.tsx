'use client';

import { Badge, Button, Field, Input, Modal, Select, Textarea, useAction, useAsync } from '@flexshift/ui';
import { currencySymbol, money, type ReliefProfile, type StaffBankTier } from '@flexshift/api-client';
import { Search, ShieldCheck } from 'lucide-react';
import { useEffect, useState } from 'react';
import { api, useAuth, useScope } from '@/lib/auth';
import { useMarket } from '@/lib/market';

export type WorkerPick = Pick<ReliefProfile, 'id' | 'firstName' | 'lastName' | 'profession' | 'registrationNumber' | 'isVerified'> & { hourlyRate?: ReliefProfile['hourlyRate'] };

export const TIERS: { value: StaffBankTier; label: string }[] = [
  { value: 'TIER_1_PREFERRED', label: 'Tier 1 Preferred' },
  { value: 'TIER_2_REGULAR', label: 'Tier 2 Regular' },
  { value: 'TIER_3_RESERVE', label: 'Tier 3 Reserve' },
];

export function AddToStaffBankModal({
  open, onClose, onAdded, initialWorker,
}: { open: boolean; onClose: () => void; onAdded: () => void; initialWorker?: WorkerPick | null }) {
  const { user } = useAuth();
  const { currency, market } = useMarket();
  const { branches, branchId: scopeBranch } = useScope();
  const { run, busy } = useAction();
  const isManager = user?.role === 'FACILITY_MANAGER';

  const [mode, setMode] = useState<'search' | 'invite'>('search');
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [regNo, setRegNo] = useState('');
  const [lookupError, setLookupError] = useState('');
  const [looking, setLooking] = useState(false);
  const [picked, setPicked] = useState<WorkerPick | null>(null);
  const [tier, setTier] = useState<StaffBankTier>('TIER_2_REGULAR');
  const [branchId, setBranchId] = useState('');
  const [rate, setRate] = useState('');
  const [notes, setNotes] = useState('');

  useEffect(() => {
    if (!open) return;
    setMode('search'); setSearch(''); setDebounced(''); setRegNo(''); setLookupError('');
    setPicked(initialWorker ?? null); setTier('TIER_2_REGULAR'); setRate(''); setNotes('');
    setBranchId(scopeBranch || (branches.length === 1 ? branches[0].id : ''));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initialWorker]);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);

  const results = useAsync(
    () => (open && !picked && mode === 'search' && debounced.length >= 2 ? api.workers.list({ search: debounced }) : Promise.resolve([] as ReliefProfile[])),
    [open, picked, mode, debounced],
  );

  const doLookup = async () => {
    setLookupError('');
    if (regNo.trim().length < 3) { setLookupError('Enter at least 3 characters.'); return; }
    setLooking(true);
    try {
      setPicked(await api.workers.lookup(regNo.trim()));
    } catch (e) {
      setLookupError(e instanceof Error ? e.message : 'No relief worker found with that registration number.');
    } finally { setLooking(false); }
  };

  const rateNum = rate.trim() === '' ? undefined : Number(rate);
  const rateInvalid = rateNum !== undefined && (!Number.isFinite(rateNum) || rateNum <= 0);
  const branchMissing = isManager && !branchId;

  const submit = async () => {
    if (!picked) return;
    const out = await run(
      () => api.staffBank.add({
        reliefWorkerId: picked.id,
        tier,
        ...(branchId ? { branchId } : {}),
        ...(rateNum !== undefined ? { customHourlyRate: rateNum } : {}),
        ...(notes.trim() ? { notes: notes.trim() } : {}),
      }),
      `${picked.firstName} ${picked.lastName} added to the staff bank`,
    );
    if (out) { onAdded(); onClose(); }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Add to staff bank"
      footer={(
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} loading={busy} disabled={!picked || rateInvalid || branchMissing}>Add to staff bank</Button>
        </>
      )}
    >
      {!picked ? (
        <>
          <div className="flex gap-1 p-1 bg-slate-100 rounded-lg text-xs font-semibold">
            {(['search', 'invite'] as const).map((m) => (
              <button key={m} onClick={() => setMode(m)} className={`flex-1 rounded-md py-1.5 ${mode === m ? 'bg-white shadow-sm text-slate-900' : 'text-slate-500'}`}>
                {m === 'search' ? 'Search workers' : 'Invite by registration number'}
              </button>
            ))}
          </div>
          {mode === 'search' ? (
            <div className="space-y-2">
              <div className="relative">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                <Input className="pl-9" placeholder="Search by name or registration number" value={search} onChange={(e) => setSearch(e.target.value)} autoFocus />
              </div>
              {debounced.length < 2 ? (
                <p className="text-xs text-slate-500">Type at least 2 characters to search workers already linked to your organization.</p>
              ) : results.loading ? (
                <p className="text-xs text-slate-500">Searching…</p>
              ) : results.error ? (
                <p className="text-xs text-rose-600">{results.error instanceof Error ? results.error.message : 'Search failed'}</p>
              ) : !results.data?.length ? (
                <p className="text-xs text-slate-500">No matching workers. Try the &quot;Invite by registration number&quot; tab.</p>
              ) : (
                <ul className="divide-y divide-slate-100 border border-slate-200 rounded-lg max-h-56 overflow-y-auto">
                  {results.data.map((w) => (
                    <li key={w.id}>
                      <button onClick={() => setPicked(w)} className="w-full text-left px-3 py-2 hover:bg-slate-50 flex items-center justify-between gap-2">
                        <span>
                          <span className="block text-sm font-semibold text-slate-900">{w.firstName} {w.lastName}</span>
                          <span className="block text-xs text-slate-500">{w.profession} · {w.registrationNumber}</span>
                        </span>
                        {w.isVerified && <Badge tone="emerald">Verified</Badge>}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ) : (
            <div className="space-y-2">
              <Field label="Registration number" error={lookupError} hint={`Exact match on the worker's registration number (${market.registrationBody}).`}>
                <Input value={regNo} onChange={(e) => setRegNo(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && doLookup()} />
              </Field>
              <Button variant="secondary" onClick={doLookup} loading={looking}>Find worker</Button>
            </div>
          )}
        </>
      ) : (
        <>
          <div className="flex items-center justify-between gap-2 rounded-lg bg-slate-50 border border-slate-200 px-3 py-2">
            <div>
              <p className="text-sm font-semibold text-slate-900">{picked.firstName} {picked.lastName}</p>
              <p className="text-xs text-slate-500">{picked.profession} · {picked.registrationNumber}</p>
            </div>
            <div className="flex items-center gap-2">
              {picked.isVerified && <Badge tone="emerald"><ShieldCheck className="w-3 h-3 mr-1" />Verified</Badge>}
              {!initialWorker && <Button variant="ghost" size="sm" onClick={() => setPicked(null)}>Change</Button>}
            </div>
          </div>
          <Field label="Tier">
            <Select value={tier} onChange={(e) => setTier(e.target.value as StaffBankTier)}>
              {TIERS.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </Select>
          </Field>
          <Field
            label={isManager ? 'Branch (required)' : 'Branch'}
            hint={isManager ? undefined : 'Leave empty for an organization-wide member.'}
          >
            <Select value={branchId} onChange={(e) => setBranchId(e.target.value)} disabled={isManager && branches.length === 1}>
              {!isManager && <option value="">Organization-wide</option>}
              {isManager && !branchId && <option value="">Select a branch…</option>}
              {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </Select>
          </Field>
          <Field
            label={`Custom hourly rate (${currencySymbol(currency)})`}
            hint={picked.hourlyRate != null ? `Worker's standard rate: ${money(picked.hourlyRate, currency)}/hr. Leave empty to use it.` : 'Optional.'}
            error={rateInvalid ? 'Enter a positive number.' : undefined}
          >
            <Input type="number" min="0" step="0.01" value={rate} onChange={(e) => setRate(e.target.value)} />
          </Field>
          <Field label="Notes">
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={500} />
          </Field>
        </>
      )}
    </Modal>
  );
}
