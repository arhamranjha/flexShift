'use client';

import { Badge, Button, Card, ErrorBlock, Field, Input, LoadingBlock, Modal, Select, StatusBadge, Textarea, useAction, useAsync } from '@flexshift/ui';
import { DOCUMENT_ACCEPT, ALL_DOC_TYPES, DOCUMENT_TYPES_LABEL, currencySymbol, documentFileProblem, findMarket, normalizeDocumentFile, type ComplianceDocument, type DocType, type ReliefProfile } from '@flexshift/api-client';
import { AlertTriangle, BadgeCheck, CheckCircle2, Circle, LogOut, Upload } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Chips, PageTitle } from '@/components/common';
import { api, useAuth } from '@/lib/auth';
import { useMarket } from '@/lib/market';

const DAY = 86_400_000;

export default function ProfilePage() {
  const { user, logout, refresh } = useAuth();
  const { mandatory: MANDATORY, docLabel } = useMarket();
  const OPTIONAL = ALL_DOC_TYPES.filter((t) => !MANDATORY.includes(t));
  const profileId = user?.reliefProfile?.id;
  const { data: profile, loading, error, reload } = useAsync(() => api.workers.get(profileId as string), [profileId]);
  const [upload, setUpload] = useState<DocType | null>(null);
  const [welcome, setWelcome] = useState(false);
  useEffect(() => { setWelcome(new URLSearchParams(window.location.search).get('welcome') === '1'); }, []);

  if (!profileId) return <><PageTitle>Profile</PageTitle><ErrorBlock error={new Error('No relief worker profile is linked to this account.')} /></>;
  if (loading && !profile) return <LoadingBlock text="Loading profile…" />;
  if (error || !profile) return <ErrorBlock error={error} retry={reload} />;

  const docs = profile.documents ?? [];
  // Prefer a document that is still valid (verified and unexpired); otherwise show the newest upload.
  const latest = (t: DocType) => {
    const ofType = docs.filter((d) => d.type === t).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    const valid = ofType.find((d) => d.status === 'VERIFIED' && (!d.expiresAt || new Date(d.expiresAt) > new Date()));
    return valid ?? ofType[0];
  };
  const missing = MANDATORY.filter((t) => latest(t)?.status !== 'VERIFIED');

  return (
    <div className="space-y-5">
      <PageTitle>Profile</PageTitle>

      {(welcome || docs.length === 0) && (
        <div className="rounded-xl bg-emerald-50 border border-emerald-200 p-4 text-sm text-emerald-900">
          <p className="font-bold">Upload your compliance documents to start booking</p>
          <p className="mt-0.5">Shifts need these verified documents: {MANDATORY.map((t) => docLabel(t).toLowerCase()).join(', ')}. The FlexShift team, or an organization that has invited you, reviews each upload and you are notified when it is verified.</p>
        </div>
      )}

      <Card className="p-4 flex items-center gap-3">
        <div className="w-14 h-14 rounded-full bg-emerald-600 text-white flex items-center justify-center text-xl font-extrabold shrink-0">{profile.firstName[0]}{profile.lastName[0]}</div>
        <div className="min-w-0">
          <p className="font-extrabold text-lg truncate">{profile.firstName} {profile.lastName}</p>
          <p className="text-sm text-slate-500 truncate">{profile.profession} · {profile.registrationNumber}</p>
          <p className="text-xs text-slate-500 truncate">{user?.email}</p>
        </div>
        <div className="ml-auto shrink-0">{profile.isVerified ? <Badge tone="emerald"><BadgeCheck className="w-3.5 h-3.5 mr-1" />Verified</Badge> : <Badge tone="amber">Not verified</Badge>}</div>
      </Card>

      <section>
        <div className="flex items-center justify-between mb-2">
          <h2 className="font-bold">Compliance Passport</h2>
          <span className="text-xs text-slate-500">{MANDATORY.length - missing.length}/{MANDATORY.length} mandatory verified</span>
        </div>
        <div className="space-y-2">
          {[...MANDATORY, ...OPTIONAL].map((t) => <DocRow key={t} type={t} name={docLabel(t)} doc={latest(t)} mandatory={MANDATORY.includes(t)} onUpload={() => setUpload(t)} />)}
        </div>
      </section>

      <Preferences key={profile.id + String(profile.hourlyRate) + String(profile.minimumShiftRate)} profile={profile} onSaved={() => { reload(); refresh(); }} />

      <Button variant="secondary" className="w-full min-h-[48px] text-base" onClick={() => logout()}><LogOut className="w-4 h-4" /> Sign out</Button>

      {upload && <UploadModal docTypes={ALL_DOC_TYPES} profileId={profileId} initialType={upload} onClose={() => setUpload(null)} onDone={() => { setUpload(null); reload(); }} />}
    </div>
  );
}

function DocRow({ name, doc, mandatory, onUpload }: { name: string; type: DocType; doc?: ComplianceDocument; mandatory: boolean; onUpload: () => void }) {
  const exp = doc?.expiresAt ? new Date(doc.expiresAt).getTime() : undefined;
  const expired = exp !== undefined && exp < Date.now();
  const soon = exp !== undefined && !expired && exp - Date.now() < 30 * DAY;
  const ok = doc?.status === 'VERIFIED' && !expired;
  return (
    <Card className="p-3.5">
      <div className="flex items-center gap-3">
        {ok ? <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" /> : <Circle className="w-5 h-5 text-slate-300 shrink-0" />}
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-sm">{name}{!mandatory && <span className="text-xs text-slate-400 font-normal"> · optional</span>}</p>
          <p className="text-xs text-slate-500">{doc ? (doc.expiresAt ? `Expires ${new Date(doc.expiresAt).toLocaleDateString('en-GB')}` : 'No expiry date') : 'Not uploaded'}</p>
        </div>
        {doc ? <StatusBadge status={expired ? 'EXPIRED' : doc.status} /> : mandatory ? <Badge tone="rose">Missing</Badge> : null}
      </div>
      {(expired || soon) && <p className="mt-2 text-xs text-amber-800 bg-amber-50 rounded-md px-2 py-1.5 flex gap-1.5"><AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-px" />{expired ? 'This document has expired. Upload a new one.' : 'Expires within 30 days. Upload a renewal.'}</p>}
      {doc?.status === 'REJECTED' && doc.verificationNotes && <p className="mt-2 text-xs text-rose-700 bg-rose-50 rounded-md px-2 py-1.5">Rejected: {doc.verificationNotes}</p>}
      {(!doc || !ok || soon) && <Button variant={doc ? 'secondary' : 'primary'} className="w-full min-h-[44px] mt-2.5" onClick={onUpload}><Upload className="w-4 h-4" /> {doc ? 'Upload replacement' : 'Upload'}</Button>}
    </Card>
  );
}

function UploadModal({ docTypes, profileId, initialType, onClose, onDone }: { docTypes: DocType[]; profileId: string; initialType: DocType; onClose: () => void; onDone: () => void }) {
  const { run, busy } = useAction();
  const { docLabel } = useMarket();
  const [type, setType] = useState<DocType>(initialType);
  const [ref, setRef] = useState('');
  const [issue, setIssue] = useState('');
  const [expires, setExpires] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const fileErr = file ? documentFileProblem(file) : undefined;
  const dateErr = issue && expires && expires < issue ? 'Expiry must be after the issue date' : undefined;

  async function submit() {
    if (!file) return;
    const fd = new FormData();
    fd.append('type', type);
    if (ref.trim()) fd.append('documentReference', ref.trim());
    if (issue) fd.append('issueDate', issue);
    if (expires) fd.append('expiresAt', expires);
    fd.append('file', normalizeDocumentFile(file));
    if (await run(() => api.workers.uploadDocument(profileId, fd), 'Document uploaded for review')) onDone();
  }

  return (
    <Modal open onClose={onClose} title="Upload document"
      footer={<><Button variant="ghost" className="min-h-[44px]" onClick={onClose}>Cancel</Button><Button className="min-h-[44px]" loading={busy} disabled={!file || !!fileErr || !!dateErr} onClick={submit}>Upload</Button></>}>
      <Field label="Document type"><Select className="min-h-[44px] text-base" value={type} onChange={(e) => setType(e.target.value as DocType)}>{docTypes.map((t) => <option key={t} value={t}>{docLabel(t)}</option>)}</Select></Field>
      <Field label="Reference (optional)"><Input maxLength={100} className="min-h-[44px] text-base" value={ref} onChange={(e) => setRef(e.target.value)} /></Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Issue date"><Input type="date" className="min-h-[44px] text-base" value={issue} onChange={(e) => setIssue(e.target.value)} /></Field>
        <Field label="Expiry date" error={dateErr}><Input type="date" className="min-h-[44px] text-base" value={expires} onChange={(e) => setExpires(e.target.value)} /></Field>
      </div>
      <Field label="File" hint={`${DOCUMENT_TYPES_LABEL}, up to 10MB`} error={fileErr}>
        <input type="file" accept={DOCUMENT_ACCEPT} onChange={(e) => setFile(e.target.files?.[0] ?? null)} className="block w-full text-sm file:mr-3 file:min-h-[44px] file:px-4 file:rounded-lg file:border-0 file:bg-emerald-50 file:text-emerald-700 file:font-semibold" />
      </Field>
    </Modal>
  );
}

function Preferences({ profile, onSaved }: { profile: ReliefProfile; onSaved: () => void }) {
  const { run, busy } = useAction();
  const { markets, market: current } = useMarket();
  const [country, setCountry] = useState(profile.country ?? current.code);
  const market = findMarket(markets, country) ?? current;
  const symbol = currencySymbol(market.currency);
  const [minRate, setMinRate] = useState(profile.minimumShiftRate != null ? String(Number(profile.minimumShiftRate)) : '');
  const [rate, setRate] = useState(profile.hourlyRate != null ? String(Number(profile.hourlyRate)) : '');
  const [bio, setBio] = useState(profile.bio ?? '');
  const [systems, setSystems] = useState(profile.systemTags);
  const [accr, setAccr] = useState(profile.accreditations);
  const bad = (v: string) => v !== '' && !(Number(v) >= 0 && Number(v) <= 1000);
  const invalid = bad(minRate) || bad(rate) || bio.length > 1000;
  // Show previously saved custom tags too, not only the suggestions.
  const sysOptions = Array.from(new Set([...market.systems, ...profile.systemTags]));
  const accrOptions = Array.from(new Set([...market.accreditations, ...profile.accreditations]));

  async function save() {
    const body = {
      // Blank clears the value (null); a number sets it.
      minimumShiftRate: minRate !== '' ? Number(minRate) : null,
      hourlyRate: rate !== '' ? Number(rate) : null,
      country: market.code,
      bio, systemTags: systems, accreditations: accr,
    };
    if (await run(() => api.workers.updatePreferences(body), 'Preferences saved')) onSaved();
  }

  return (
    <section>
      <h2 className="font-bold mb-2">Preferences</h2>
      <Card className="p-4 space-y-4">
        <Field label="Country / market">
          <Select className="min-h-[44px] text-base" value={market.code} onChange={(e) => setCountry(e.target.value)}>
            {(markets?.markets ?? [market]).map((m) => <option key={m.code} value={m.code}>{m.name}</option>)}
          </Select>
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label={`Standard rate (${symbol}/hr)`} error={bad(rate) ? '0 to 1000' : undefined}><Input type="number" inputMode="decimal" min={0} max={1000} step="0.5" className="min-h-[44px] text-base" value={rate} onChange={(e) => setRate(e.target.value)} /></Field>
          <Field label={`Minimum shift rate (${symbol}/hr)`} error={bad(minRate) ? '0 to 1000' : undefined} hint="Hides shifts below this"><Input type="number" inputMode="decimal" min={0} max={1000} step="0.5" className="min-h-[44px] text-base" value={minRate} onChange={(e) => setMinRate(e.target.value)} /></Field>
        </div>
        <Field label="Bio" hint={`${bio.length}/1000`}><Textarea maxLength={1000} value={bio} onChange={(e) => setBio(e.target.value)} /></Field>
        <div><p className="text-xs font-semibold text-slate-700 mb-2">Systems</p><Chips options={sysOptions} value={systems} onChange={setSystems} /></div>
        <div><p className="text-xs font-semibold text-slate-700 mb-2">Accreditations</p><Chips options={accrOptions} value={accr} onChange={setAccr} /></div>
        <Button className="w-full min-h-[48px] text-base" loading={busy} disabled={invalid} onClick={save}>Save preferences</Button>
      </Card>
    </section>
  );
}

