'use client';

import { Badge, Button, Card, ErrorBlock, Field, Input, LoadingBlock, Modal, StatusBadge, Textarea, useAction, useAsync } from '@flexshift/ui';
import { fmtRange, gbp, shiftHours, toNumber } from '@flexshift/api-client';
import { Check, Heart, MapPin, Phone, X } from 'lucide-react';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import { PageTitle, Payout, ProblemList, ShiftBadges, eligibilityProblems } from '@/components/common';
import { api, useAuth } from '@/lib/auth';

type Dialog = null | 'instant' | 'apply' | 'negotiate';

function Req({ name, ok }: { name: string; ok: boolean }) {
  return (
    <li className="flex items-center gap-2 text-sm">
      {ok ? <Check className="w-4 h-4 text-emerald-600" /> : <X className="w-4 h-4 text-rose-600" />}
      <span className={ok ? 'text-slate-800' : 'text-rose-700 font-medium'}>{name}</span>
    </li>
  );
}

export default function ShiftDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const profile = user?.reliefProfile;
  const { data: shift, loading, error, reload } = useAsync(() => api.shifts.get(id), [id]);
  const { run, busy } = useAction();
  const [dialog, setDialog] = useState<Dialog>(null);
  const [problems, setProblems] = useState<string[]>();
  const [note, setNote] = useState('');
  const [rate, setRate] = useState('');
  const [message, setMessage] = useState('');
  const [watched, setWatched] = useState<boolean>();

  if (loading && !shift) return <LoadingBlock text="Loading shift…" />;
  if (error || !shift) return <><PageTitle back>Shift</PageTitle><ErrorBlock error={error ?? new Error('Shift not found')} retry={reload} /></>;

  const have = (list: string[] | undefined) => new Set((list ?? []).map((s) => s.trim().toLowerCase()));
  const mySystems = have(profile?.systemTags);
  const myAccr = have(profile?.accreditations);
  const hours = shiftHours(shift.startTime, shift.endTime);
  const biddable = shift.status === 'OPEN' || shift.status === 'IN_NEGOTIATION';
  const isMine = !!profile && shift.assignedWorkerId === profile.id;
  const activeNeg = shift.negotiations?.find((n) => n.status === 'PENDING' || n.status === 'COUNTERED');
  const application = shift.applications?.find((a) => a.status !== 'REJECTED' && a.status !== 'WITHDRAWN');
  const isWatched = watched ?? !!shift.isWatched;

  /** Runs a booking-type mutation, capturing the eligibility checklist from a 403. */
  async function act(fn: () => Promise<unknown>, success: string) {
    setProblems(undefined);
    const ok = await run(async () => {
      try { await fn(); return true; } catch (e) {
        const p = eligibilityProblems(e);
        if (p) setProblems(p);
        throw e;
      }
    }, success);
    if (ok) { setDialog(null); setNote(''); setRate(''); setMessage(''); reload(); }
  }

  const rateNum = Number(rate);
  const rateErr = rate !== '' && !(rateNum >= 1 && rateNum <= 1000) ? 'Enter a rate between £1 and £1000' : undefined;

  async function toggleWatch() {
    const prev = isWatched;
    setWatched(!prev);
    try { setWatched((await api.workers.toggleWatch(id)).watched); } catch { setWatched(prev); }
  }

  const open = (d: Dialog) => { setProblems(undefined); setDialog(d); };

  return (
    <>
      <PageTitle back right={
        <button onClick={toggleWatch} aria-label="Watch shift" aria-pressed={isWatched} className="w-11 h-11 flex items-center justify-center rounded-lg hover:bg-slate-100">
          <Heart className={isWatched ? 'w-5 h-5 text-rose-600 fill-current' : 'w-5 h-5 text-slate-500'} />
        </button>
      }>Shift details</PageTitle>

      <div className="space-y-4">
        <Card className="p-4 space-y-3">
          <div className="flex justify-between gap-3">
            <div className="min-w-0">
              <h2 className="font-extrabold text-lg text-slate-900">{shift.branch?.name}</h2>
              <p className="text-sm text-slate-500">{shift.branch?.organization?.name}</p>
              {shift.branch?.city && <p className="text-sm text-slate-500 flex items-center gap-1 mt-0.5"><MapPin className="w-3.5 h-3.5" />{shift.branch.city}{shift.branch.postcode && `, ${shift.branch.postcode}`}</p>}
            </div>
            <Payout shift={shift} />
          </div>
          <div className="rounded-lg bg-slate-50 p-3 text-sm">
            <p className="font-semibold text-slate-900">{fmtRange(shift.startTime, shift.endTime)}</p>
            <p className="text-slate-600">{shift.roleRequired} · {hours.toFixed(1)} hours at {gbp(shift.hourlyRate)}/hr</p>
          </div>
          <div className="flex items-center gap-2 flex-wrap"><StatusBadge status={shift.status} /><ShiftBadges shift={shift} /></div>
          {isMine && <Badge tone="emerald" className="!text-sm !px-3 !py-1">You are booked on this shift</Badge>}
        </Card>

        {(shift.requiredSystems.length > 0 || shift.requiredAccreditations.length > 0) && (
          <Card className="p-4">
            <h3 className="text-sm font-bold mb-2">Requirements</h3>
            <ul className="space-y-1.5">
              {shift.requiredSystems.map((s) => <Req key={s} name={`${s} (system)`} ok={mySystems.has(s.trim().toLowerCase())} />)}
              {shift.requiredAccreditations.map((a) => <Req key={a} name={a} ok={myAccr.has(a.trim().toLowerCase())} />)}
            </ul>
          </Card>
        )}

        {shift.notes && <Card className="p-4"><h3 className="text-sm font-bold mb-1">Notes</h3><p className="text-sm text-slate-700 whitespace-pre-wrap">{shift.notes}</p></Card>}

        {shift.branch?.phone && (
          <Card className="p-4">
            <h3 className="text-sm font-bold mb-1">Branch contact</h3>
            <a href={`tel:${shift.branch.phone}`} className="inline-flex items-center gap-2 min-h-[44px] text-emerald-700 font-semibold"><Phone className="w-4 h-4" />{shift.branch.phone}</a>
          </Card>
        )}

        {problems && !dialog && <ProblemList problems={problems} />}

        {activeNeg && (
          <Card className="p-4 space-y-3">
            <div className="flex items-center justify-between"><h3 className="text-sm font-bold">Your rate negotiation</h3><StatusBadge status={activeNeg.status} /></div>
            <p className="text-sm text-slate-600">You proposed <b>{gbp(activeNeg.proposedHourlyRate)}/hr</b>.</p>
            {activeNeg.status === 'COUNTERED' && activeNeg.counterOfferRate != null ? (
              <>
                <div className="rounded-lg bg-violet-50 border border-violet-200 p-3 text-sm">
                  The manager countered with <b>{gbp(activeNeg.counterOfferRate)}/hr</b>, a payout of <b>{gbp(toNumber(activeNeg.counterOfferRate) * hours)}</b>.
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <Button variant="danger" className="min-h-[44px] text-base" disabled={busy} onClick={() => act(() => api.negotiations.reject(activeNeg.id), 'Counter offer declined')}>Decline</Button>
                  <Button className="min-h-[44px] text-base" loading={busy} onClick={() => act(() => api.negotiations.accept(activeNeg.id), 'Shift booked')}>Accept and book</Button>
                </div>
              </>
            ) : <p className="text-xs text-slate-500">Waiting for the manager to respond.</p>}
          </Card>
        )}

        {application && !isMine && <Card className="p-4 flex items-center justify-between"><span className="text-sm font-semibold">Your application</span><StatusBadge status={application.status} /></Card>}

        {biddable && !isMine && (
          <div className="space-y-2">
            {shift.instantBookEnabled && shift.status === 'OPEN' && (
              <Button className="w-full min-h-[48px] text-base" onClick={() => open('instant')}>Instant Book · {gbp(toNumber(shift.hourlyRate) * hours)}</Button>
            )}
            {!application && <Button variant="secondary" className="w-full min-h-[48px] text-base" onClick={() => open('apply')}>Apply for this shift</Button>}
            {!activeNeg && <Button variant="secondary" className="w-full min-h-[48px] text-base" onClick={() => open('negotiate')}>Negotiate rate</Button>}
          </div>
        )}
      </div>

      <Modal
        open={dialog === 'instant'} onClose={() => setDialog(null)} title="Confirm Instant Book"
        footer={<><Button variant="ghost" className="min-h-[44px]" onClick={() => setDialog(null)}>Cancel</Button><Button className="min-h-[44px]" loading={busy} onClick={() => act(() => api.shifts.instantBook(id), 'Shift booked')}>Book now</Button></>}
      >
        <p className="text-sm">Book <b>{shift.branch?.name}</b> on {fmtRange(shift.startTime, shift.endTime)} for {gbp(toNumber(shift.hourlyRate) * hours)}? You will be confirmed immediately.</p>
        {problems && <ProblemList problems={problems} />}
      </Modal>

      <Modal
        open={dialog === 'apply'} onClose={() => setDialog(null)} title="Apply for shift"
        footer={<><Button variant="ghost" className="min-h-[44px]" onClick={() => setDialog(null)}>Cancel</Button><Button className="min-h-[44px]" loading={busy} onClick={() => act(() => api.shifts.apply(id, note.trim() || undefined), 'Application sent')}>Send application</Button></>}
      >
        <Field label="Note to the manager (optional)"><Textarea maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} /></Field>
        {problems && <ProblemList problems={problems} />}
      </Modal>

      <Modal
        open={dialog === 'negotiate'} onClose={() => setDialog(null)} title="Negotiate rate"
        footer={<><Button variant="ghost" className="min-h-[44px]" onClick={() => setDialog(null)}>Cancel</Button><Button className="min-h-[44px]" loading={busy} disabled={!rate || !!rateErr} onClick={() => act(() => api.negotiations.create({ shiftId: id, proposedHourlyRate: rateNum, ...(message.trim() && { message: message.trim() }) }), 'Offer sent')}>Send offer</Button></>}
      >
        <p className="text-sm text-slate-600">Advertised rate is {gbp(shift.hourlyRate)}/hr.</p>
        <Field label="Your proposed hourly rate (£)" error={rateErr} hint={rate && !rateErr ? `Payout: ${gbp(rateNum * hours)}` : undefined}>
          <Input type="number" inputMode="decimal" min={1} max={1000} step="0.5" className="min-h-[44px] text-base" value={rate} onChange={(e) => setRate(e.target.value)} />
        </Field>
        <Field label="Message (optional)"><Textarea maxLength={500} value={message} onChange={(e) => setMessage(e.target.value)} /></Field>
        {problems && <ProblemList problems={problems} />}
      </Modal>
    </>
  );
}
