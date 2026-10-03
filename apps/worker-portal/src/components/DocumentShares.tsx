'use client';

import { Badge, Button, Card, ErrorBlock, Field, Input, useAction, useAsync, type Tone } from '@flexshift/ui';
import type { DocumentShare, DocumentShareStatus } from '@flexshift/api-client';
import { Building2, Send } from 'lucide-react';
import { useState } from 'react';
import { api } from '@/lib/auth';

const STATUS: Record<DocumentShareStatus, { label: string; tone: Tone }> = {
  PENDING: { label: 'Waiting for review', tone: 'amber' },
  ACCEPTED: { label: 'In their staff bank', tone: 'emerald' },
  DECLINED: { label: 'Declined', tone: 'rose' },
  WITHDRAWN: { label: 'Withdrawn', tone: 'slate' },
  EXPIRED: { label: 'No answer (lapsed after 30 days)', tone: 'slate' },
};

/** An accepted request whose staff-bank place was later removed reads differently, and may be sent again. */
const statusOf = (s: DocumentShare) => (s.status === 'ACCEPTED' && !s.inStaffBank ? { label: 'No longer in their staff bank', tone: 'slate' as Tone } : STATUS[s.status]);

/** Profile section: organizations the worker has asked to review their documents, plus "ask by code". */
export function DocumentSharesSection() {
  const { data: shares, loading, error, reload } = useAsync(() => api.documentShares.mine(), []);
  const { run, busy } = useAction();
  const [code, setCode] = useState('');
  const codeOk = /^[A-Za-z0-9-]{2,20}$/.test(code.trim());

  async function ask() {
    if (await run(() => api.documentShares.create({ organizationCode: code.trim() }), 'Request sent')) { setCode(''); reload(); }
  }

  return (
    <section>
      <h2 className="font-bold mb-1">Organizations reviewing you</h2>
      <p className="text-xs text-slate-500 mb-2">
        An organization you ask can see your profile and documents and verify them. You can withdraw while it is waiting. You can also ask from any shift page.
      </p>
      <Card className="p-4 space-y-3">
        {error ? <ErrorBlock error={error} retry={reload} /> : loading && !shares ? <p className="text-sm text-slate-500">Loading…</p> : (
          shares && shares.length > 0
            ? <ul className="space-y-2">{shares.map((s) => <ShareRow key={s.id} share={s} onChanged={reload} />)}</ul>
            : <p className="text-sm text-slate-500">You have not asked any organization yet.</p>
        )}
        <div className="flex gap-2 items-end">
          <div className="flex-1">
            <Field label="Organization code" hint="Ask the organization for its code">
              <Input className="min-h-[44px] text-base uppercase placeholder:normal-case" maxLength={20} value={code} onChange={(e) => setCode(e.target.value)} placeholder="e.g. KIWICARE" />
            </Field>
          </div>
          <Button className="min-h-[44px] mb-5" loading={busy} disabled={!codeOk} onClick={ask}><Send className="w-4 h-4" /> Ask</Button>
        </div>
      </Card>
    </section>
  );
}

function ShareRow({ share, onChanged }: { share: DocumentShare; onChanged: () => void }) {
  const { run, busy } = useAction();
  const s = statusOf(share);
  return (
    <li className="flex items-center gap-3 text-sm">
      <Building2 className="w-4 h-4 text-slate-400 shrink-0" />
      <span className="flex-1 min-w-0">
        <span className="block font-semibold break-words">{share.organization?.name ?? 'Organization'}</span>
        <Badge tone={s.tone} className="mt-0.5">{s.label}</Badge>
      </span>
      {share.status === 'PENDING' && (
        <Button variant="ghost" className="min-h-[44px] !px-2" loading={busy}
          onClick={async () => { if (await run(() => api.documentShares.withdraw(share.id), 'Request withdrawn')) onChanged(); }}>
          Withdraw
        </Button>
      )}
    </li>
  );
}

/** Shift page: lets an unverified worker ask the shift's organization to review their documents. */
export function AskOrganizationCard({ organizationId, organizationName }: { organizationId: string; organizationName: string }) {
  const { data: shares, error, reload } = useAsync(() => api.documentShares.mine(), []);
  const { run, busy } = useAction();
  const existing = shares?.find((s) => s.organizationId === organizationId);
  // Withdrawn and lapsed requests, declines more than 30 days old, and acceptances whose staff-bank place was removed can be
  // sent again (the server enforces the waiting times and says why if it is too soon).
  const declineOver = existing?.status === 'DECLINED' && Date.now() - new Date(existing.respondedAt ?? 0).getTime() > 30 * 86_400_000;
  const canAsk = shares !== undefined && (!existing || existing.status === 'WITHDRAWN' || existing.status === 'EXPIRED' || declineOver
    || (existing.status === 'ACCEPTED' && !existing.inStaffBank));

  if (error) return <Card className="p-4"><ErrorBlock error={error} retry={reload} /></Card>;

  return (
    <Card className="p-4 space-y-2 border-amber-200 bg-amber-50/50">
      <h3 className="text-sm font-bold">Not verified yet?</h3>
      <p className="text-sm text-slate-700">
        Ask {organizationName} to review your documents. They will see your profile and documents, and can add you to their staff bank.
      </p>
      {existing && !canAsk
        ? <Badge tone={statusOf(existing).tone}>{statusOf(existing).label}</Badge>
        : (
          <Button variant="secondary" className="w-full min-h-[48px] text-base" loading={busy} disabled={!canAsk}
            onClick={async () => { if (await run(() => api.documentShares.create({ organizationId }), `Request sent to ${organizationName}`)) reload(); }}>
            <Send className="w-4 h-4" /> Ask {organizationName} to review me
          </Button>
        )}
    </Card>
  );
}
