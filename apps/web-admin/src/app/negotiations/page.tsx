'use client';

import type { Negotiation, NegotiationStatus } from '@flexshift/api-client';
import { currencySymbol, fmtRange, money, shiftHours, toNumber } from '@flexshift/api-client';
import {
  Button, Card, EmptyState, ErrorBlock, Field, Input, LoadingBlock, Modal, StatusBadge, td, th, useAction, useAsync,
} from '@flexshift/ui';
import clsx from 'clsx';
import { useState } from 'react';
import { Header } from '@/components/Header';
import { api, useScope } from '@/lib/auth';
import { useMarket } from '@/lib/market';

const TABS: { key: NegotiationStatus | 'ALL'; label: string }[] = [
  { key: 'PENDING', label: 'Needs response' },
  { key: 'COUNTERED', label: 'Countered' },
  { key: 'ACCEPTED', label: 'Accepted' },
  { key: 'REJECTED', label: 'Rejected' },
  { key: 'ALL', label: 'All' },
];

export default function NegotiationsPage() {
  const { branchId, branchIds, loading: scopeLoading } = useScope();
  const { currency } = useMarket();
  const curOf = (n: Negotiation | null | undefined) => n?.shift?.currency ?? currency;
  const [tab, setTab] = useState<NegotiationStatus | 'ALL'>('PENDING');
  const [active, setActive] = useState<Negotiation | null>(null);
  const [counter, setCounter] = useState('');
  const { run, busy } = useAction();

  const { data, error, loading, reload } = useAsync(
    () => api.negotiations.list({ branchId: branchId || undefined, status: tab === 'ALL' ? undefined : tab }),
    [branchId, tab, branchIds.length],
  );

  const close = () => { setActive(null); setCounter(''); };
  const act = async (fn: () => Promise<unknown>, msg: string) => {
    if ((await run(fn, msg)) !== undefined) { close(); reload(); }
  };

  const rate = (n: Negotiation) => toNumber(n.status === 'COUNTERED' && n.counterOfferRate ? n.counterOfferRate : n.proposedHourlyRate);
  const counterNum = Number(counter);
  const counterInvalid = !counter || !(counterNum >= 1 && counterNum <= 1000);

  return (
    <>
      <Header title="Rate Negotiations" subtitle="Worker counter-offers on your shifts: accept, counter or decline" />
      <main className="p-8 space-y-6">
        <div className="flex gap-1 bg-white border border-slate-200 rounded-lg p-1 w-fit flex-wrap">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={clsx('px-3 py-1.5 rounded-md text-sm font-medium', tab === t.key ? 'bg-emerald-600 text-white' : 'text-slate-600 hover:bg-slate-100')}
            >
              {t.label}
            </button>
          ))}
        </div>

        <Card className="overflow-x-auto">
          {scopeLoading || loading ? (
            <LoadingBlock />
          ) : error ? (
            <ErrorBlock error={error} retry={reload} />
          ) : !data?.length ? (
            <EmptyState title="No negotiations here" hint="When a worker proposes a different rate on one of your shifts it will show up in this list." />
          ) : (
            <table className="w-full">
              <thead>
                <tr>
                  {['Worker', 'Shift', 'When', 'Advertised', 'Proposed', 'Est. total', 'Status', ''].map((h) => <th key={h} className={th}>{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {data.map((n) => {
                  const hours = n.shift ? shiftHours(n.shift.startTime, n.shift.endTime) : 0;
                  return (
                    <tr key={n.id} className="hover:bg-slate-50">
                      <td className={td}>
                        <div className="font-semibold text-slate-900">{n.reliefWorker?.firstName} {n.reliefWorker?.lastName}</div>
                        <div className="text-xs text-slate-500">{n.reliefWorker?.registrationNumber}</div>
                      </td>
                      <td className={td}>
                        <div>{n.shift?.title}</div>
                        <div className="text-xs text-slate-500">{n.shift?.branch?.name}</div>
                      </td>
                      <td className={td}>{n.shift ? fmtRange(n.shift.startTime, n.shift.endTime) : ''}</td>
                      <td className={td}>{n.shift ? money(n.shift.hourlyRate, curOf(n)) : ''}/h</td>
                      <td className={td}>
                        <span className="font-semibold">{money(n.proposedHourlyRate, curOf(n))}/h</span>
                        {n.counterOfferRate && <div className="text-xs text-violet-700">Your counter: {money(n.counterOfferRate, curOf(n))}/h</div>}
                      </td>
                      <td className={td}>{money(hours * rate(n), curOf(n))}</td>
                      <td className={td}><StatusBadge status={n.status} /></td>
                      <td className={td}>
                        <Button size="sm" variant={n.status === 'PENDING' ? 'primary' : 'secondary'} onClick={() => setActive(n)}>
                          {n.status === 'PENDING' ? 'Respond' : 'View'}
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </Card>
      </main>

      <Modal
        open={!!active}
        onClose={close}
        title="Rate proposal"
        footer={
          active && (active.status === 'PENDING' || active.status === 'COUNTERED') ? (
            <>
              <Button variant="danger" loading={busy} onClick={() => act(() => api.negotiations.reject(active.id), 'Proposal declined')}>Decline</Button>
              {active.status === 'PENDING' && (
                <Button variant="secondary" loading={busy} disabled={counterInvalid} onClick={() => act(() => api.negotiations.counter(active.id, counterNum), 'Counter-offer sent')}>
                  Send counter
                </Button>
              )}
              {active.status === 'PENDING' && (
                <Button loading={busy} onClick={() => act(() => api.negotiations.accept(active.id), 'Accepted: shift booked')}>Accept &amp; book</Button>
              )}
            </>
          ) : (
            <Button variant="secondary" onClick={close}>Close</Button>
          )
        }
      >
        {active && (
          <>
            <div className="text-sm space-y-1">
              <div className="font-semibold text-slate-900">{active.reliefWorker?.firstName} {active.reliefWorker?.lastName} <StatusBadge status={active.status} /></div>
              <div className="text-slate-600">{active.shift?.title} · {active.shift?.branch?.name}</div>
              {active.shift && <div className="text-slate-500">{fmtRange(active.shift.startTime, active.shift.endTime)}</div>}
            </div>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className="bg-slate-50 rounded-lg p-3">
                <div className="text-xs text-slate-500">Advertised</div>
                <div className="font-bold">{active.shift ? money(active.shift.hourlyRate, curOf(active)) : ''}/h</div>
              </div>
              <div className="bg-emerald-50 rounded-lg p-3">
                <div className="text-xs text-emerald-700">Proposed</div>
                <div className="font-bold text-emerald-900">{money(active.proposedHourlyRate, curOf(active))}/h</div>
              </div>
            </div>
            {active.message && <p className="text-sm bg-slate-50 rounded-lg p-3 text-slate-700">“{active.message}”</p>}
            {active.status === 'PENDING' && (
              <Field label={`Counter-offer rate (${currencySymbol(curOf(active))}/hour)`} hint="Leave blank to accept or decline instead">
                <Input type="number" min={1} max={1000} step="0.5" value={counter} onChange={(e) => setCounter(e.target.value)} />
              </Field>
            )}
            {active.status === 'COUNTERED' && (
              <p className="text-sm text-violet-700">Your counter of {money(active.counterOfferRate, curOf(active))}/h is waiting for the worker to accept.</p>
            )}
          </>
        )}
      </Modal>
    </>
  );
}
