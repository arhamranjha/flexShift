'use client';

import { fmtRange, money, moneyTotals } from '@flexshift/api-client';
import { Badge, Card, CardHeader, EmptyState, ErrorBlock, LoadingBlock, StatusBadge, useAsync } from '@flexshift/ui';
import {
  AlertOctagon, CalendarCheck, CalendarClock, ChevronRight, Clock, FileCheck2, Handshake, Palmtree, Banknote, Target, Users,
} from 'lucide-react';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { Header } from '@/components/Header';
import { api, useScope } from '@/lib/auth';
import { useMarket } from '@/lib/market';

function Stat({ label, value, icon, tone = 'emerald', href, hint }: {
  label: string; value: ReactNode; icon: ReactNode; tone?: 'emerald' | 'rose' | 'amber' | 'sky' | 'violet'; href?: string; hint?: string;
}) {
  const toneCls = {
    emerald: 'bg-emerald-50 text-emerald-600', rose: 'bg-rose-50 text-rose-600', amber: 'bg-amber-50 text-amber-600',
    sky: 'bg-sky-50 text-sky-600', violet: 'bg-violet-50 text-violet-600',
  }[tone];
  const body = (
    <Card className={href ? 'p-5 hover:border-emerald-300 transition-colors h-full' : 'p-5 h-full'}>
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-semibold text-slate-500">{label}</p>
          <p className="text-2xl font-bold text-slate-900 mt-1">{value}</p>
          {hint && <p className="text-[11px] text-slate-500 mt-1">{hint}</p>}
        </div>
        <span className={`p-2 rounded-lg ${toneCls}`}>{icon}</span>
      </div>
    </Card>
  );
  return href ? <Link href={href}>{body}</Link> : body;
}

export default function OverviewPage() {
  const { branchId, branchIds, loading: scopeLoading } = useScope();
  const { currency } = useMarket();
  const { data, loading, error, reload } = useAsync(
    () => (branchIds.length ? api.analytics.overview(branchId || undefined) : Promise.resolve(undefined)),
    [branchId, branchIds.join(',')],
  );

  return (
    <>
      <Header title="Executive Overview" subtitle="Workforce coverage, spend and items needing attention" />
      <main className="p-8 space-y-6">
        {scopeLoading || branchIds.length === 0 || (loading && !data) ? (
          scopeLoading || loading ? <LoadingBlock /> : <EmptyState title="No branches available" hint="Your account is not linked to any branch yet." />
        ) : error ? (
          <ErrorBlock error={error} retry={reload} />
        ) : data && (
          <>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <Stat label="Open vacancies" value={data.openShifts} icon={<CalendarClock className="w-5 h-5" />} tone="amber" href="/shifts" />
              <Stat label="Emergency vacancies" value={data.emergencyOpen} icon={<AlertOctagon className="w-5 h-5" />} tone="rose" href="/rota" />
              <Stat label="Upcoming booked" value={data.upcomingBooked} icon={<CalendarCheck className="w-5 h-5" />} href="/rota" />
              <Stat
                label="30-day fill rate"
                value={data.fillRate === null ? 'n/a' : `${data.fillRate}%`}
                icon={<Target className="w-5 h-5" />}
                tone="sky"
                hint={data.fillRate === null ? 'No shifts in the last 30 days' : undefined}
              />
              <Stat label="Staff bank headcount" value={data.staffBankHeadcount} icon={<Users className="w-5 h-5" />} tone="violet" href="/staff-bank" />
              <Stat label="Spend this month" value={data.monthSpendByCurrency?.length ? moneyTotals(data.monthSpendByCurrency.map((m) => ({ amount: m.total, currency: m.currency })), currency) : money(data.monthSpend ?? 0, data.currency ?? currency)} icon={<Banknote className="w-5 h-5" />} />
              <Stat label="Pending timesheets" value={data.pendingTimesheets} icon={<Clock className="w-5 h-5" />} tone="amber" href="/timesheets" />
              <Stat label="Pending leave" value={data.pendingLeave} icon={<Palmtree className="w-5 h-5" />} tone="amber" href="/leave" />
              <Stat label="Pending negotiations" value={data.pendingNegotiations} icon={<Handshake className="w-5 h-5" />} tone="violet" href="/negotiations" />
              <Stat label="Documents to verify" value={data.pendingDocuments} icon={<FileCheck2 className="w-5 h-5" />} tone="sky" href="/compliance" />
            </div>

            <Card>
              <CardHeader title="Urgent vacancies (next 72h)" subtitle="Unfilled shifts starting soon" action={<Link href="/rota" className="text-xs font-semibold text-emerald-700 hover:underline">Open rota</Link>} />
              {data.urgentShifts.length === 0 ? (
                <EmptyState title="Nothing urgent" hint="All shifts starting in the next 72 hours are covered." />
              ) : (
                <ul className="divide-y divide-slate-100">
                  {data.urgentShifts.map((s) => (
                    <li key={s.id}>
                      <Link href="/rota" className="flex items-center justify-between gap-4 px-5 py-3 hover:bg-slate-50">
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-slate-900 truncate">{s.title}</p>
                          <p className="text-xs text-slate-500">{s.branch?.name} · {fmtRange(s.startTime, s.endTime)}</p>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          {s.isEmergency && <Badge tone="rose">Emergency</Badge>}
                          <span className="text-sm font-semibold text-slate-700">{money(s.hourlyRate, s.currency ?? currency)}/h</span>
                          <StatusBadge status={s.status} />
                          <ChevronRight className="w-4 h-4 text-slate-400" />
                        </div>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </>
        )}
      </main>
    </>
  );
}
