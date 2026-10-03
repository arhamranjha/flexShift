'use client';

import { type ComplianceDocument } from '@flexshift/api-client';
import { Badge } from '@flexshift/ui';
import { CheckCircle2, Circle } from 'lucide-react';
import { useMarket } from '@/lib/market';

export const fmtLong = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '-';

export type Expiry = 'none' | 'ok' | 'soon' | 'expired';
export function expiryState(iso?: string | null): Expiry {
  if (!iso) return 'none';
  const ms = new Date(iso).getTime() - Date.now();
  return ms < 0 ? 'expired' : ms < 30 * 86_400_000 ? 'soon' : 'ok';
}

export function ExpiryCell({ iso }: { iso?: string | null }) {
  const s = expiryState(iso);
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
      <span className={s === 'expired' || s === 'soon' ? 'text-rose-700 font-semibold' : ''}>{fmtLong(iso)}</span>
      {s === 'expired' && <Badge tone="rose">Expired</Badge>}
      {s === 'soon' && <Badge tone="rose">Expires soon</Badge>}
    </span>
  );
}

export const isValidDoc = (d: ComplianceDocument) => d.status === 'VERIFIED' && expiryState(d.expiresAt) !== 'expired';

export function MandatoryChecklist({ documents }: { documents: ComplianceDocument[] }) {
  const { mandatory, docLabel } = useMarket();
  return (
    <ul className="grid grid-cols-2 gap-2">
      {mandatory.map((t) => {
        const ok = documents.some((d) => d.type === t && isValidDoc(d));
        return (
          <li key={t} className={`flex items-center gap-2 text-xs rounded-lg border px-3 py-2 ${ok ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-slate-200 text-slate-600'}`}>
            {ok ? <CheckCircle2 className="w-4 h-4 text-emerald-600" /> : <Circle className="w-4 h-4 text-slate-300" />}
            {docLabel(t)}
          </li>
        );
      })}
    </ul>
  );
}
