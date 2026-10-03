'use client';

import { DOCUMENT_ACCEPT, documentFileProblem, normalizeDocumentFile, type ReliefProfile, type Shift, fmtRange, gbp } from '@flexshift/api-client';
import {
  Badge, Button, Card, EmptyState, ErrorBlock, Field, Input, LoadingBlock, Modal, Select, StatusBadge, th, td, useAction, useAsync,
} from '@flexshift/ui';
import { Copy, Search, ShieldCheck, Upload, UserPlus } from 'lucide-react';
import { useEffect, useState } from 'react';
import { AddToStaffBankModal } from '@/components/AddToStaffBankModal';
import { DOC_TYPES, ExpiryCell, MANDATORY_DOCS, MandatoryChecklist, docTypeLabel, expiryState, isValidDoc } from '@/components/DocHelpers';
import { Header } from '@/components/Header';
import { useToast } from '@flexshift/ui';
import { api } from '@/lib/auth';

type WorkerDetail = ReliefProfile & { assignedShifts?: Shift[] };

function docSummary(w: ReliefProfile) {
  const docs = w.documents;
  if (!docs) return <span className="text-slate-400">-</span>;
  const valid = MANDATORY_DOCS.filter((t) => docs.some((d) => d.type === t && isValidDoc(d))).length;
  const pending = docs.filter((d) => d.status === 'PENDING').length;
  const expiring = docs.filter((d) => d.status === 'VERIFIED' && expiryState(d.expiresAt) === 'soon').length;
  return (
    <div className="flex flex-wrap gap-1">
      <Badge tone={valid === MANDATORY_DOCS.length ? 'emerald' : 'amber'}>{valid}/{MANDATORY_DOCS.length} mandatory</Badge>
      {pending > 0 && <Badge tone="sky">{pending} pending</Badge>}
      {expiring > 0 && <Badge tone="rose">{expiring} expiring</Badge>}
    </div>
  );
}

/* ---------- Concierge onboarding ---------- */
const emptyForm = {
  email: '', firstName: '', lastName: '', phone: '', registrationNumber: '', profession: '', hourlyRate: '', minimumShiftRate: '',
  systemTags: '', accreditations: '', university: '', graduationYear: '', yearsCommunityExperience: '', yearsHospitalExperience: '',
};
type Form = typeof emptyForm;
const csv = (s: string) => s.split(',').map((x) => x.trim()).filter(Boolean);

function OnboardModal({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone: () => void }) {
  const { run, busy } = useAction();
  const toast = useToast();
  const [f, setF] = useState<Form>(emptyForm);
  const [errs, setErrs] = useState<Partial<Record<keyof Form, string>>>({});
  const [password, setPassword] = useState<{ name: string; value: string } | null>(null);
  useEffect(() => { if (open) { setF(emptyForm); setErrs({}); } }, [open]);
  const set = (k: keyof Form) => (e: { target: { value: string } }) => setF((x) => ({ ...x, [k]: e.target.value }));

  const num = (v: string) => (v.trim() === '' ? undefined : Number(v));
  const validate = () => {
    const e: Partial<Record<keyof Form, string>> = {};
    if (!/^\S+@\S+\.\S+$/.test(f.email.trim())) e.email = 'Enter a valid email.';
    if (!f.firstName.trim()) e.firstName = 'Required.';
    if (!f.lastName.trim()) e.lastName = 'Required.';
    if (f.phone.trim().length < 5 || f.phone.trim().length > 25) e.phone = '5 to 25 characters.';
    if (f.registrationNumber.trim().length < 3 || f.registrationNumber.trim().length > 30) e.registrationNumber = '3 to 30 characters.';
    for (const k of ['hourlyRate', 'minimumShiftRate', 'graduationYear', 'yearsCommunityExperience', 'yearsHospitalExperience'] as const) {
      const n = num(f[k]);
      if (n !== undefined && (!Number.isFinite(n) || n < 0)) e[k] = 'Enter a valid number.';
    }
    setErrs(e);
    return Object.keys(e).length === 0;
  };

  const submit = async () => {
    if (!validate()) { toast.error('Please fix the highlighted fields.'); return; }
    const body: Record<string, unknown> = {
      email: f.email.trim(), firstName: f.firstName.trim(), lastName: f.lastName.trim(),
      phone: f.phone.trim(), registrationNumber: f.registrationNumber.trim(),
    };
    if (f.profession.trim()) body.profession = f.profession.trim();
    if (f.university.trim()) body.university = f.university.trim();
    for (const k of ['hourlyRate', 'minimumShiftRate', 'graduationYear', 'yearsCommunityExperience', 'yearsHospitalExperience'] as const) {
      const n = num(f[k]);
      if (n !== undefined) body[k] = n;
    }
    if (csv(f.systemTags).length) body.systemTags = csv(f.systemTags);
    if (csv(f.accreditations).length) body.accreditations = csv(f.accreditations);
    const out = await run(() => api.workers.concierge(body), 'Relief worker onboarded');
    if (out) {
      setPassword({ name: `${out.firstName} ${out.lastName}`, value: out.temporaryPassword });
      onClose();
      onDone();
    }
  };

  const copy = async () => {
    try { await navigator.clipboard.writeText(password?.value ?? ''); toast.success('Password copied'); } catch { toast.error('Could not copy; select the text manually.'); }
  };

  const text = (k: keyof Form, lbl: string, extra: { type?: string; hint?: string; placeholder?: string } = {}) => (
    <Field label={lbl} error={errs[k]} hint={extra.hint}>
      <Input type={extra.type ?? 'text'} value={f[k]} onChange={set(k)} placeholder={extra.placeholder} />
    </Field>
  );

  return (
    <>
      <Modal
        open={open}
        onClose={onClose}
        wide
        title="Onboard relief worker"
        footer={(<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button onClick={submit} loading={busy}>Create worker</Button></>)}
      >
        <div className="grid sm:grid-cols-2 gap-3">
          {text('firstName', 'First name')}
          {text('lastName', 'Last name')}
          {text('email', 'Email', { type: 'email' })}
          {text('phone', 'Phone')}
          {text('registrationNumber', 'Registration number')}
          {text('profession', 'Profession', { hint: 'Optional' })}
          {text('hourlyRate', 'Hourly rate (£)', { type: 'number' })}
          {text('minimumShiftRate', 'Minimum shift rate (£)', { type: 'number' })}
          {text('university', 'University')}
          {text('graduationYear', 'Graduation year', { type: 'number' })}
          {text('yearsCommunityExperience', 'Years community experience', { type: 'number' })}
          {text('yearsHospitalExperience', 'Years hospital experience', { type: 'number' })}
        </div>
        {text('systemTags', 'Systems', { hint: 'Comma separated' })}
        {text('accreditations', 'Accreditations', { hint: 'Comma separated' })}
      </Modal>
      <Modal
        open={!!password}
        onClose={() => setPassword(null)}
        title="Temporary password"
        footer={<Button onClick={() => setPassword(null)}>I have saved it</Button>}
      >
        <p className="text-sm text-slate-700">{password?.name} has been created. Share this temporary password with them securely.</p>
        <div className="flex items-center gap-2">
          <code className="flex-1 rounded-lg bg-slate-100 px-3 py-2 font-mono text-sm select-all">{password?.value}</code>
          <Button variant="secondary" onClick={copy}><Copy className="w-4 h-4" />Copy</Button>
        </div>
        <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
          This password will not be shown again. The worker must change it at first login.
        </p>
      </Modal>
    </>
  );
}

/* ---------- Upload ---------- */
function UploadModal({ worker, onClose, onDone }: { worker: ReliefProfile | null; onClose: () => void; onDone: () => void }) {
  const { run, busy } = useAction();
  const [type, setType] = useState('IDENTITY');
  const [ref, setRef] = useState('');
  const [issue, setIssue] = useState('');
  const [exp, setExp] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [err, setErr] = useState('');
  useEffect(() => { if (worker) { setType('IDENTITY'); setRef(''); setIssue(''); setExp(''); setFile(null); setErr(''); } }, [worker]);

  const submit = async () => {
    if (!worker) return;
    if (!file) return setErr('Choose a file.');
    const problem = documentFileProblem(file);
    if (problem) return setErr(`${problem}.`);
    if (!ref.trim() || !issue || !exp) return setErr('Reference, issue date and expiry date are required.');
    if (exp <= issue) return setErr('Expiry must be after the issue date.');
    setErr('');
    const form = new FormData();
    form.append('type', type);
    form.append('documentReference', ref.trim());
    form.append('issueDate', issue);
    form.append('expiresAt', exp);
    form.append('file', normalizeDocumentFile(file));
    const out = await run(() => api.workers.uploadDocument(worker.id, form), 'Document uploaded for review');
    if (out) { onClose(); onDone(); }
  };

  return (
    <Modal
      open={!!worker}
      onClose={onClose}
      title={worker ? `Upload document for ${worker.firstName} ${worker.lastName}` : 'Upload document'}
      footer={(<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button onClick={submit} loading={busy}>Upload</Button></>)}
    >
      <Field label="Document type">
        <Select value={type} onChange={(e) => setType(e.target.value)}>{DOC_TYPES.map((t) => <option key={t} value={t}>{docTypeLabel(t)}</option>)}</Select>
      </Field>
      <Field label="Reference"><Input value={ref} onChange={(e) => setRef(e.target.value)} /></Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Issue date"><Input type="date" value={issue} onChange={(e) => setIssue(e.target.value)} /></Field>
        <Field label="Expiry date"><Input type="date" value={exp} onChange={(e) => setExp(e.target.value)} /></Field>
      </div>
      <Field label="File" hint="PDF, PNG or JPEG, up to 10MB.">
        <Input type="file" accept={DOCUMENT_ACCEPT} onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
      </Field>
      {err && <p className="text-xs text-rose-600">{err}</p>}
    </Modal>
  );
}

/* ---------- Detail ---------- */
function DetailModal({
  workerId, onClose, onUpload, onAdd,
}: { workerId: string | null; onClose: () => void; onUpload: (w: ReliefProfile) => void; onAdd: (w: ReliefProfile) => void }) {
  const { data, error, loading, reload } = useAsync(() => (workerId ? api.workers.get(workerId) as Promise<WorkerDetail> : Promise.resolve(undefined)), [workerId]);
  // Re-fetch after the parent finishes an upload (parent bumps nothing; reload on focus of modal open is enough).
  useEffect(() => { const h = () => reload(); window.addEventListener('worker-docs-changed', h); return () => window.removeEventListener('worker-docs-changed', h); }, [reload]);
  const w = data;
  return (
    <Modal
      open={!!workerId}
      onClose={onClose}
      wide
      title={w ? `${w.firstName} ${w.lastName}` : 'Relief worker'}
      footer={w && (
        <>
          <Button variant="secondary" onClick={() => onUpload(w)}><Upload className="w-4 h-4" />Upload document</Button>
          <Button onClick={() => onAdd(w)}><UserPlus className="w-4 h-4" />Add to staff bank</Button>
        </>
      )}
    >
      {loading ? <LoadingBlock /> : error ? <ErrorBlock error={error} retry={reload} /> : w && (
        <>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div><p className="text-xs text-slate-500">Profession</p>{w.profession}</div>
            <div><p className="text-xs text-slate-500">Registration</p>{w.registrationNumber}</div>
            <div><p className="text-xs text-slate-500">Email</p>{w.user?.email ?? '-'}</div>
            <div><p className="text-xs text-slate-500">Phone</p>{w.phone ?? '-'}</div>
            <div><p className="text-xs text-slate-500">Standard rate</p>{w.hourlyRate != null ? `${gbp(w.hourlyRate)}/hr` : '-'}</div>
            <div><p className="text-xs text-slate-500">Verification</p>{w.isVerified ? <Badge tone="emerald">Verified</Badge> : <Badge tone="amber">Not verified</Badge>}</div>
          </div>
          <div className="flex flex-wrap gap-1">
            {[...w.systemTags, ...w.accreditations].map((t) => <Badge key={t}>{t}</Badge>)}
          </div>
          <div>
            <p className="text-xs font-semibold text-slate-700 mb-2">Mandatory credentials</p>
            <MandatoryChecklist documents={w.documents ?? []} />
          </div>
          <div>
            <p className="text-xs font-semibold text-slate-700 mb-2">Documents</p>
            {!w.documents?.length ? <p className="text-sm text-slate-400">No documents uploaded.</p> : (
              <div className="overflow-x-auto border border-slate-200 rounded-lg">
                <table className="w-full">
                  <thead><tr><th className={th}>Type</th><th className={th}>Reference</th><th className={th}>Status</th><th className={th}>Expires</th></tr></thead>
                  <tbody>
                    {w.documents.map((d) => (
                      <tr key={d.id}>
                        <td className={td}>{docTypeLabel(d.type)}</td>
                        <td className={td}>{d.documentReference || '-'}</td>
                        <td className={td}><StatusBadge status={d.status} /></td>
                        <td className={td}><ExpiryCell iso={d.expiresAt} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
          <div>
            <p className="text-xs font-semibold text-slate-700 mb-2">Staff bank membership</p>
            {!w.staffBankMemberships?.length ? <p className="text-sm text-slate-400">Not in your staff bank.</p> : (
              <div className="flex flex-wrap gap-1">
                {w.staffBankMemberships.map((m) => (
                  <Badge key={m.id} tone={m.isActive ? 'emerald' : 'slate'}>{m.tier.replace('TIER_', 'Tier ').replace('_', ' ').toLowerCase().replace(/^\w/, (c) => c.toUpperCase())} · {m.branch?.name ?? 'Organization-wide'}</Badge>
                ))}
              </div>
            )}
          </div>
          <div>
            <p className="text-xs font-semibold text-slate-700 mb-2">Recent shifts</p>
            {!w.assignedShifts?.length ? <p className="text-sm text-slate-400">No shifts yet.</p> : (
              <ul className="divide-y divide-slate-100 border border-slate-200 rounded-lg">
                {w.assignedShifts.slice(0, 8).map((s) => (
                  <li key={s.id} className="px-3 py-2 flex items-center justify-between gap-2 text-sm">
                    <span><span className="font-semibold text-slate-900">{s.title}</span><span className="block text-xs text-slate-500">{s.branch?.name} · {fmtRange(s.startTime, s.endTime)}</span></span>
                    <StatusBadge status={s.status} />
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}
    </Modal>
  );
}

/* ---------- Page ---------- */
export default function WorkersPage() {
  const [search, setSearch] = useState('');
  const [q, setQ] = useState('');
  const [verified, setVerified] = useState('');
  const [profession, setProfession] = useState('');
  const [onboard, setOnboard] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [uploadFor, setUploadFor] = useState<ReliefProfile | null>(null);
  const [addFor, setAddFor] = useState<ReliefProfile | null>(null);

  useEffect(() => { const t = setTimeout(() => setQ(search.trim()), 300); return () => clearTimeout(t); }, [search]);

  const { data, error, loading, reload } = useAsync(
    () => api.workers.list({ search: q || undefined, isVerified: verified === '' ? undefined : verified === 'true', profession: profession || undefined }),
    [q, verified, profession],
  );
  const [professions, setProfessions] = useState<string[]>([]);
  useEffect(() => {
    if (data && !profession && !q && verified === '') setProfessions(Array.from(new Set(data.map((w) => w.profession))).sort());
  }, [data, profession, q, verified]);

  const changed = () => { reload(); window.dispatchEvent(new Event('worker-docs-changed')); };

  return (
    <>
      <Header
        title="Relief workers"
        subtitle="Workers linked to your organization"
        hideBranchPicker
        actions={<Button onClick={() => setOnboard(true)}><UserPlus className="w-4 h-4" />Onboard relief worker</Button>}
      />
      <main className="p-8 space-y-6">
        <div className="flex flex-wrap gap-3">
          <div className="relative w-72">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
            <Input className="pl-9" placeholder="Search name or registration number" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <div className="w-44">
            <Select value={verified} onChange={(e) => setVerified(e.target.value)} aria-label="Verification filter">
              <option value="">All verification</option><option value="true">Verified</option><option value="false">Not verified</option>
            </Select>
          </div>
          <div className="w-52">
            <Select value={profession} onChange={(e) => setProfession(e.target.value)} aria-label="Profession filter">
              <option value="">All professions</option>
              {professions.map((p) => <option key={p} value={p}>{p}</option>)}
            </Select>
          </div>
        </div>

        <Card>
          {loading ? <LoadingBlock /> : error ? <ErrorBlock error={error} retry={reload} /> : !data?.length ? (
            <EmptyState title="No relief workers found" hint="Adjust the filters, or onboard a new worker." action={<Button onClick={() => setOnboard(true)}>Onboard relief worker</Button>} />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead><tr>
                  <th className={th}>Name</th><th className={th}>Profession</th><th className={th}>Reg no.</th><th className={th}>Systems / accreditations</th>
                  <th className={th}>Verified</th><th className={th}>Documents</th><th className={th}>Staff bank</th>
                </tr></thead>
                <tbody>
                  {data.map((w) => {
                    const tags = [...(w.systemTags ?? []), ...(w.accreditations ?? [])];
                    const mems = w.staffBankMemberships ?? [];
                    return (
                      <tr key={w.id} onClick={() => setDetailId(w.id)} className="cursor-pointer hover:bg-slate-50">
                        <td className={`${td} font-semibold text-slate-900`}>{w.firstName} {w.lastName}</td>
                        <td className={td}>{w.profession}</td>
                        <td className={td}>{w.registrationNumber}</td>
                        <td className={td}>
                          <div className="flex flex-wrap gap-1 max-w-xs">
                            {tags.slice(0, 4).map((t) => <Badge key={t}>{t}</Badge>)}
                            {tags.length > 4 && <Badge>+{tags.length - 4}</Badge>}
                            {!tags.length && <span className="text-slate-300">-</span>}
                          </div>
                        </td>
                        <td className={td}>{w.isVerified ? <Badge tone="emerald"><ShieldCheck className="w-3 h-3 mr-1" />Verified</Badge> : <Badge tone="amber">Unverified</Badge>}</td>
                        <td className={td}>{docSummary(w)}</td>
                        <td className={td}>{mems.length ? <Badge tone="emerald">{mems.length} membership{mems.length > 1 ? 's' : ''}</Badge> : <span className="text-slate-400">No</span>}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </main>

      <DetailModal workerId={detailId} onClose={() => setDetailId(null)} onUpload={setUploadFor} onAdd={setAddFor} />
      <OnboardModal open={onboard} onClose={() => setOnboard(false)} onDone={reload} />
      <UploadModal worker={uploadFor} onClose={() => setUploadFor(null)} onDone={changed} />
      <AddToStaffBankModal open={!!addFor} onClose={() => setAddFor(null)} onAdded={changed} initialWorker={addFor} />
    </>
  );
}
