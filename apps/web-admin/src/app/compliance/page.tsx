'use client';

import { type ComplianceDocument, type DocStatus } from '@flexshift/api-client';
import {
  Badge, Button, Card, EmptyState, ErrorBlock, Field, LoadingBlock, Modal, StatusBadge, Textarea, th, td, useAction, useAsync,
} from '@flexshift/ui';
import { CheckCircle2, ExternalLink, XCircle } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { ExpiryCell, MandatoryChecklist, expiryState, fmtLong } from '@/components/DocHelpers';
import { Header } from '@/components/Header';
import { api } from '@/lib/auth';
import { useMarket } from '@/lib/market';

const TABS: { key: DocStatus; label: string }[] = [
  { key: 'PENDING', label: 'Pending' },
  { key: 'VERIFIED', label: 'Verified' },
  { key: 'REJECTED', label: 'Rejected' },
];

function Preview({ docId }: { docId: string }) {
  const [state, setState] = useState<{ url?: string; type?: string; missing?: boolean; loading: boolean }>({ loading: true });
  useEffect(() => {
    let url: string | undefined;
    let cancelled = false;
    setState({ loading: true });
    api.workers.documentBlob(docId).then(
      (blob) => { if (cancelled) return; url = URL.createObjectURL(blob); setState({ url, type: blob.type, loading: false }); },
      () => !cancelled && setState({ missing: true, loading: false }),
    );
    return () => { cancelled = true; if (url) URL.revokeObjectURL(url); };
  }, [docId]);

  if (state.loading) return <p className="text-xs text-slate-500">Loading preview…</p>;
  if (state.missing || !state.url) return <div className="rounded-lg border border-dashed border-slate-300 py-8 text-center text-sm text-slate-500">No file available</div>;
  return (
    <div className="space-y-2">
      {state.type?.startsWith('image/')
        ? <img src={state.url} alt="Document" className="max-h-80 mx-auto rounded-lg border border-slate-200" />
        : <iframe src={state.url} title="Document preview" className="w-full h-80 rounded-lg border border-slate-200" />}
      <a href={state.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 hover:underline">
        <ExternalLink className="w-3 h-3" />Open in new tab
      </a>
    </div>
  );
}

function ReviewModal({ doc, onClose, onDone }: { doc: ComplianceDocument | null; onClose: () => void; onDone: () => void }) {
  const { run, busy } = useAction();
  const { docLabel } = useMarket();
  const [notes, setNotes] = useState('');
  useEffect(() => setNotes(doc?.verificationNotes ?? ''), [doc]);
  const worker = useAsync(() => (doc ? api.workers.get(doc.reliefWorkerId) : Promise.resolve(undefined)), [doc?.id]);

  const act = async (status: 'VERIFIED' | 'REJECTED') => {
    if (!doc) return;
    const out = await run(() => api.workers.verifyDocument(doc.id, status, notes.trim() || undefined), status === 'VERIFIED' ? 'Document verified' : 'Document rejected');
    if (out) { onClose(); onDone(); }
  };
  const expired = expiryState(doc?.expiresAt) === 'expired';
  const w = doc?.reliefWorker;

  return (
    <Modal
      open={!!doc}
      onClose={onClose}
      wide
      title={doc ? `${docLabel(doc.type)} review` : 'Review'}
      footer={doc && (
        <>
          <Button variant="secondary" onClick={onClose}>Close</Button>
          <Button variant="danger" onClick={() => act('REJECTED')} loading={busy} disabled={!notes.trim()}><XCircle className="w-4 h-4" />Reject</Button>
          <Button onClick={() => act('VERIFIED')} loading={busy} disabled={expired} title={expired ? 'Expired documents cannot be verified' : undefined}><CheckCircle2 className="w-4 h-4" />Verify</Button>
        </>
      )}
    >
      {doc && (
        <>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div><p className="text-xs text-slate-500">Worker</p>
              <Link href="/workers" className="font-semibold text-emerald-700 hover:underline">{w ? `${w.firstName} ${w.lastName}` : 'Worker'}</Link>
              <p className="text-xs text-slate-500">{w?.profession} · {w?.registrationNumber}</p></div>
            <div><p className="text-xs text-slate-500">Status</p><StatusBadge status={doc.status} /></div>
            <div><p className="text-xs text-slate-500">Reference</p>{doc.documentReference || '-'}</div>
            <div><p className="text-xs text-slate-500">Uploaded</p>{fmtLong(doc.createdAt)}</div>
            <div><p className="text-xs text-slate-500">Issued</p>{fmtLong(doc.issueDate)}</div>
            <div><p className="text-xs text-slate-500">Expires</p><ExpiryCell iso={doc.expiresAt} /></div>
          </div>
          {expired && <p className="text-xs text-rose-600">This document has already expired, so it cannot be verified. Reject it with a note instead.</p>}
          <Preview docId={doc.id} />
          <div>
            <p className="text-xs font-semibold text-slate-700 mb-2">Mandatory credentials for this worker</p>
            {worker.loading ? <p className="text-xs text-slate-500">Loading…</p> : worker.error ? <p className="text-xs text-rose-600">Could not load worker documents.</p>
              : <MandatoryChecklist documents={worker.data?.documents ?? []} />}
          </div>
          <Field label="Review notes" hint="Required when rejecting.">
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={500} />
          </Field>
        </>
      )}
    </Modal>
  );
}

export default function CompliancePage() {
  const [tab, setTab] = useState<DocStatus>('PENDING');
  const [reviewing, setReviewing] = useState<ComplianceDocument | null>(null);
  const { docLabel } = useMarket();
  const { data, error, loading, reload } = useAsync(() => api.workers.documentQueue(tab), [tab]);

  return (
    <>
      <Header title="Compliance" subtitle="Review credentials before workers become bookable" hideBranchPicker />
      <main className="p-8 space-y-6">
        <div className="flex gap-1 p-1 bg-slate-100 rounded-lg w-fit text-sm font-semibold">
          {TABS.map((t) => (
            <button key={t.key} onClick={() => setTab(t.key)} className={`px-4 py-1.5 rounded-md ${tab === t.key ? 'bg-white shadow-sm text-slate-900' : 'text-slate-500'}`}>{t.label}</button>
          ))}
        </div>
        <Card>
          {loading ? <LoadingBlock /> : error ? <ErrorBlock error={error} retry={reload} /> : !data?.length ? (
            <EmptyState title={`No ${tab.toLowerCase()} documents`} hint={tab === 'PENDING' ? 'The review queue is clear.' : undefined} />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead><tr>
                  <th className={th}>Worker</th><th className={th}>Document</th><th className={th}>Reference</th><th className={th}>Issued</th>
                  <th className={th}>Expires</th><th className={th}>Uploaded</th><th className={th} />
                </tr></thead>
                <tbody>
                  {data.map((d) => (
                    <tr key={d.id}>
                      <td className={td}>
                        <p className="font-semibold text-slate-900">{d.reliefWorker ? `${d.reliefWorker.firstName} ${d.reliefWorker.lastName}` : '-'}</p>
                        <p className="text-xs text-slate-500">{d.reliefWorker?.profession}</p>
                      </td>
                      <td className={td}>{docLabel(d.type)}</td>
                      <td className={td}>{d.documentReference || '-'}</td>
                      <td className={td}>{fmtLong(d.issueDate)}</td>
                      <td className={td}><ExpiryCell iso={d.expiresAt} /></td>
                      <td className={td}>{fmtLong(d.createdAt)}</td>
                      <td className={td}><Button size="sm" variant={tab === 'PENDING' ? 'primary' : 'secondary'} onClick={() => setReviewing(d)}>{tab === 'PENDING' ? 'Review' : 'View'}</Button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
        {tab === 'REJECTED' && <Badge tone="slate">Rejected documents can be re-reviewed if the worker re-uploads.</Badge>}
      </main>
      <ReviewModal doc={reviewing} onClose={() => setReviewing(null)} onDone={reload} />
    </>
  );
}
