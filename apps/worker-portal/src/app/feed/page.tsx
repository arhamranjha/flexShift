'use client';

import { Button, EmptyState, ErrorBlock, Field, Input, LoadingBlock, Modal, useAsync, useToast } from '@flexshift/ui';
import { useMarket } from '@/lib/market';
import { api } from '@/lib/auth';
import type { Shift } from '@flexshift/api-client';
import clsx from 'clsx';
import { SlidersHorizontal } from 'lucide-react';
import { useEffect, useState } from 'react';
import { PageTitle } from '@/components/common';
import { ShiftCard } from '@/components/ShiftCard';

const TABS = [
  { id: 'for_you', label: 'For You' },
  { id: 'watching', label: 'Watching' },
  { id: 'favourites', label: 'Favourites' },
  { id: 'emergencies', label: 'Emergencies' },
] as const;

export default function FeedPage() {
  const toast = useToast();
  const { symbol } = useMarket();
  const [tab, setTab] = useState<(typeof TABS)[number]['id']>('for_you');
  const [filters, setFilters] = useState({ minRate: '', from: '', to: '' });
  const [draft, setDraft] = useState(filters);
  const [sheet, setSheet] = useState(false);

  const { data, loading, error, reload } = useAsync(
    () => api.shifts.feed({
      tab,
      minRate: filters.minRate ? Number(filters.minRate) : undefined,
      // The backend only applies the date range when both bounds are present.
      ...(filters.from && filters.to && {
        startDate: new Date(`${filters.from}T00:00:00`).toISOString(),
        endDate: new Date(`${filters.to}T23:59:59`).toISOString(),
      }),
    }),
    [tab, filters],
  );

  const [shifts, setShifts] = useState<Shift[]>([]);
  useEffect(() => { if (data) setShifts(data); }, [data]);

  const patch = (id: string, p: Partial<Shift>) => setShifts((l) => l.map((s) => (s.id === id ? { ...s, ...p } : s)));

  async function toggleWatch(s: Shift) {
    patch(s.id, { isWatched: !s.isWatched });
    try {
      const r = await api.workers.toggleWatch(s.id);
      patch(s.id, { isWatched: r.watched });
      if (tab === 'watching' && !r.watched) setShifts((l) => l.filter((x) => x.id !== s.id));
    } catch (e) {
      patch(s.id, { isWatched: s.isWatched });
      toast.error(e instanceof Error ? e.message : 'Could not update watch');
    }
  }

  async function toggleFavourite(s: Shift) {
    const next = !s.isFavouriteBranch;
    const apply = (v: boolean) => setShifts((l) => l.map((x) => (x.branchId === s.branchId ? { ...x, isFavouriteBranch: v } : x)));
    apply(next);
    try {
      const r = await api.workers.toggleFavourite(s.branchId);
      apply(r.favourited);
    } catch (e) {
      apply(!next);
      toast.error(e instanceof Error ? e.message : 'Could not update favourite');
    }
  }

  const active = [filters.minRate, filters.from && filters.to].filter(Boolean).length;
  const rangeBad = (draft.from !== '') !== (draft.to !== '') || (draft.from && draft.to && draft.to < draft.from);

  return (
    <>
      <PageTitle right={
        <Button variant="secondary" className="min-h-[44px]" onClick={() => { setDraft(filters); setSheet(true); }}>
          <SlidersHorizontal className="w-4 h-4" /> Filters{active > 0 && ` (${active})`}
        </Button>
      }>Find shifts</PageTitle>

      <div className="flex gap-2 overflow-x-auto -mx-4 px-4 pb-3">
        {TABS.map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)} className={clsx('min-h-[44px] px-4 rounded-full text-sm font-semibold whitespace-nowrap border', tab === t.id ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-white text-slate-700 border-slate-300')}>
            {t.label}
          </button>
        ))}
      </div>

      {loading && !data ? <LoadingBlock text="Finding shifts…" /> : error ? <ErrorBlock error={error} retry={reload} /> : shifts.length === 0 ? (
        <EmptyState
          title="No shifts match right now"
          hint={tab === 'favourites' ? 'Tap "Favourite branch" on a shift to follow a branch.' : tab === 'watching' ? 'Watch shifts to keep an eye on them here.' : 'Try lowering your minimum rate or widening the dates.'}
        />
      ) : (
        <div className="space-y-3">
          {shifts.map((s) => <ShiftCard key={s.id} shift={s} onToggleWatch={() => toggleWatch(s)} onToggleFavourite={() => toggleFavourite(s)} />)}
        </div>
      )}

      <Modal
        open={sheet} onClose={() => setSheet(false)} title="Filters"
        footer={<>
          <Button variant="ghost" className="min-h-[44px]" onClick={() => { const c = { minRate: '', from: '', to: '' }; setFilters(c); setSheet(false); }}>Clear</Button>
          <Button className="min-h-[44px]" disabled={!!rangeBad} onClick={() => { setFilters(draft); setSheet(false); }}>Apply</Button>
        </>}
      >
        <Field label={`Minimum hourly rate (${symbol})`} hint="Defaults to your profile minimum when empty">
          <Input type="number" inputMode="decimal" min={0} className="min-h-[44px] text-base" value={draft.minRate} onChange={(e) => setDraft({ ...draft, minRate: e.target.value })} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="From"><Input type="date" className="min-h-[44px] text-base" value={draft.from} onChange={(e) => setDraft({ ...draft, from: e.target.value })} /></Field>
          <Field label="To" error={rangeBad ? 'Pick both dates, end after start' : undefined}><Input type="date" className="min-h-[44px] text-base" value={draft.to} onChange={(e) => setDraft({ ...draft, to: e.target.value })} /></Field>
        </div>
      </Modal>
    </>
  );
}
