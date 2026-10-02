'use client';

import { gbp, shiftHours, type MarketRates, type Shift, type ShiftVisibility } from '@flexshift/api-client';
import { Button, Field, Input, Modal, Select, Textarea, useAction } from '@flexshift/ui';
import { X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { api, useScope } from '@/lib/auth';

const SYSTEM_SUGGESTIONS = ['ProScript', 'Columbus', 'Nexphase'];
const ACCREDITATION_SUGGESTIONS = ['CPCS', 'Flu Vaccination', 'Safeguarding Level 3', 'NMS', 'Independent Prescriber'];

/** Convert an ISO string to the `datetime-local` input format in local time. */
const toLocalInput = (iso: string) => {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

function TagsInput({
  value, onChange, suggestions, placeholder, disabled,
}: { value: string[]; onChange: (v: string[]) => void; suggestions: string[]; placeholder: string; disabled?: boolean }) {
  const [draft, setDraft] = useState('');
  const add = (raw: string) => {
    const tags = raw.split(',').map((t) => t.trim()).filter(Boolean);
    const next = [...value];
    for (const t of tags) if (!next.some((n) => n.toLowerCase() === t.toLowerCase())) next.push(t);
    onChange(next);
    setDraft('');
  };
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5">
        {value.map((t) => (
          <span key={t} className="inline-flex items-center gap-1 rounded-full bg-emerald-100 text-emerald-800 text-xs font-semibold pl-2.5 pr-1.5 py-0.5">
            {t}
            {!disabled && (
              <button type="button" aria-label={`Remove ${t}`} onClick={() => onChange(value.filter((v) => v !== t))}>
                <X className="w-3 h-3" />
              </button>
            )}
          </span>
        ))}
      </div>
      <Input
        value={draft}
        disabled={disabled}
        placeholder={placeholder}
        onChange={(e) => (e.target.value.includes(',') ? add(e.target.value) : setDraft(e.target.value))}
        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); if (draft.trim()) add(draft); } }}
        onBlur={() => draft.trim() && add(draft)}
      />
      <div className="flex flex-wrap gap-1.5">
        {suggestions.filter((s) => !value.includes(s)).map((s) => (
          <button
            key={s}
            type="button"
            disabled={disabled}
            onClick={() => add(s)}
            className="text-[11px] rounded-full border border-slate-300 px-2 py-0.5 text-slate-600 hover:bg-slate-50 disabled:opacity-50"
          >
            + {s}
          </button>
        ))}
      </div>
    </div>
  );
}

interface Props {
  open: boolean;
  onClose: () => void;
  onSaved: (shift: Shift) => void;
  /** Provide to edit an existing shift. */
  shift?: Shift | null;
  /** Pre-select a branch when creating. */
  defaultBranchId?: string;
}

export function ShiftFormModal({ open, onClose, onSaved, shift, defaultBranchId }: Props) {
  const { branches, branchId: scopeBranch } = useScope();
  const { run, busy } = useAction();
  const editing = !!shift;
  const locked = shift?.status === 'BOOKED' || shift?.status === 'IN_PROGRESS';

  const [branchId, setBranchId] = useState('');
  const [title, setTitle] = useState('');
  const [role, setRole] = useState('Pharmacist');
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [rate, setRate] = useState('');
  const [systems, setSystems] = useState<string[]>([]);
  const [accreds, setAccreds] = useState<string[]>([]);
  const [visibility, setVisibility] = useState<ShiftVisibility>('STAFF_BANK_ONLY');
  const [instant, setInstant] = useState(false);
  const [overnight, setOvernight] = useState(false);
  const [emergency, setEmergency] = useState(false);
  const [notes, setNotes] = useState('');
  const [cascade, setCascade] = useState(true);
  const [market, setMarket] = useState<MarketRates | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    setError('');
    if (shift) {
      setBranchId(shift.branchId);
      setTitle(shift.title);
      setRole(shift.roleRequired);
      setStart(toLocalInput(shift.startTime));
      setEnd(toLocalInput(shift.endTime));
      setRate(String(Number(shift.hourlyRate)));
      setSystems(shift.requiredSystems);
      setAccreds(shift.requiredAccreditations);
      setVisibility(shift.visibility);
      setInstant(shift.instantBookEnabled);
      setOvernight(shift.isOvernight);
      setEmergency(shift.isEmergency);
      setNotes(shift.notes ?? '');
    } else {
      setBranchId(defaultBranchId || scopeBranch || branches[0]?.id || '');
      setTitle('');
      setRole('Pharmacist');
      setStart('');
      setEnd('');
      setRate('');
      setSystems([]);
      setAccreds([]);
      setVisibility('STAFF_BANK_ONLY');
      setInstant(false);
      setOvernight(false);
      setEmergency(false);
      setNotes('');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, shift]);

  // Anonymised platform benchmark for the chosen role, shown as a hint under the rate field.
  useEffect(() => {
    if (!open || !role.trim()) return;
    let cancelled = false;
    const t = setTimeout(() => {
      api.analytics.marketRates(role.trim()).then((m) => !cancelled && setMarket(m), () => !cancelled && setMarket(null));
    }, 300);
    return () => { cancelled = true; clearTimeout(t); };
  }, [open, role]);

  const startD = start ? new Date(start) : null;
  const endD = end ? new Date(end) : null;
  const rateN = Number(rate);
  const hours = startD && endD && endD > startD ? shiftHours(startD.toISOString(), endD.toISOString()) : 0;
  const total = hours * (rateN > 0 ? rateN : 0);

  const validate = () => {
    if (!title.trim()) return 'Give the shift a title.';
    if (!editing && !branchId) return 'Choose a branch.';
    if (!locked) {
      if (!start || !end) return 'Start and end times are required.';
      if (endD! <= startD!) return 'End time must be after the start time.';
      if (!editing && startD! <= new Date()) return 'Start time must be in the future.';
      if (!(rateN > 0)) return 'Hourly rate must be greater than zero.';
      if (rateN < 1 || rateN > 1000) return 'Hourly rate must be between £1 and £1,000.';
      if (!role.trim()) return 'Role required cannot be empty.';
    }
    return '';
  };

  const submit = async () => {
    const problem = validate();
    setError(problem);
    if (problem) return;
    const body: Record<string, unknown> = locked
      ? { title: title.trim(), notes }
      : {
          title: title.trim(),
          roleRequired: role.trim(),
          startTime: startD!.toISOString(),
          endTime: endD!.toISOString(),
          hourlyRate: rateN,
          requiredSystems: systems,
          requiredAccreditations: accreds,
          visibility,
          instantBookEnabled: instant,
          isOvernight: overnight,
          isEmergency: emergency,
          notes,
          // Staff-bank shifts widen Tier 1 -> 2 -> 3 -> marketplace on a timer unless this is off.
          ...(!editing && visibility === 'STAFF_BANK_ONLY' ? { cascade } : {}),
        };
    const saved = await run(
      () => (editing ? api.shifts.update(shift!.id, body) : api.shifts.create({ ...body, branchId })),
      editing ? 'Shift updated' : 'Shift created and published',
    );
    if (saved) {
      onSaved(saved);
      onClose();
    }
  };

  const fixedBranch = editing || branches.length <= 1;
  const dis = locked;

  return (
    <Modal
      open={open}
      onClose={onClose}
      wide
      title={editing ? 'Edit shift' : 'New shift'}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} loading={busy}>{editing ? 'Save changes' : 'Create shift'}</Button>
        </>
      }
    >
      {locked && (
        <p className="text-xs rounded-lg bg-amber-50 text-amber-800 px-3 py-2">
          This shift is booked, so only the title and notes can be changed. Release the worker first to edit anything else.
        </p>
      )}
      {error && <p role="alert" className="text-xs rounded-lg bg-rose-50 text-rose-700 px-3 py-2">{error}</p>}

      <div className="grid sm:grid-cols-2 gap-4">
        <Field label="Branch">
          <Select value={branchId} disabled={fixedBranch} onChange={(e) => setBranchId(e.target.value)}>
            {!branchId && <option value="">Select branch…</option>}
            {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </Select>
        </Field>
        <Field label="Role required">
          <Input value={role} disabled={dis} onChange={(e) => setRole(e.target.value)} maxLength={60} />
        </Field>
      </div>

      <Field label="Title">
        <Input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} placeholder="e.g. Saturday relief cover" />
      </Field>

      <div className="grid sm:grid-cols-3 gap-4">
        <Field label="Start">
          <Input type="datetime-local" value={start} disabled={dis} onChange={(e) => setStart(e.target.value)} />
        </Field>
        <Field label="End">
          <Input type="datetime-local" value={end} disabled={dis} onChange={(e) => setEnd(e.target.value)} />
        </Field>
        <Field
        label="Hourly rate (£)"
        hint={market && market.median != null ? `Market rate for ${market.profession}s (last 90 days): median ${gbp(market.median)}, middle half ${gbp(market.p25)}–${gbp(market.p75)}` : undefined}
      >
          <Input type="number" min={1} max={1000} step="0.5" value={rate} disabled={dis} onChange={(e) => setRate(e.target.value)} />
        </Field>
      </div>

      <div className="rounded-lg bg-slate-50 border border-slate-200 px-3 py-2 text-sm flex justify-between">
        <span className="text-slate-600">{hours > 0 ? `${hours.toFixed(1)} hours` : 'Enter times to calculate'}</span>
        <span className="font-bold text-slate-900">Estimated pay {gbp(total)}</span>
      </div>

      <Field label="Required systems" hint="Type and press Enter or comma, or pick a suggestion.">
        <TagsInput value={systems} onChange={setSystems} suggestions={SYSTEM_SUGGESTIONS} placeholder="Add a system" disabled={dis} />
      </Field>
      <Field label="Required accreditations">
        <TagsInput value={accreds} onChange={setAccreds} suggestions={ACCREDITATION_SUGGESTIONS} placeholder="Add an accreditation" disabled={dis} />
      </Field>

      <Field label="Visibility">
        <Select value={visibility} disabled={dis} onChange={(e) => setVisibility(e.target.value as ShiftVisibility)}>
          <option value="STAFF_BANK_ONLY">Staff bank only</option>
          <option value="PUBLIC_MARKETPLACE">Public marketplace</option>
          <option value="EMERGENCY_BROADCAST">Emergency broadcast</option>
        </Select>
      </Field>

      {!editing && visibility === 'STAFF_BANK_ONLY' && (
        <label className="flex items-start gap-2 text-sm text-slate-700">
          <input type="checkbox" checked={cascade} onChange={(e) => setCascade(e.target.checked)} className="mt-0.5 rounded border-slate-300 text-emerald-600" />
          <span>
            Release in tiers
            <span className="block text-xs text-slate-500">Tier 1 (Preferred) sees this first, then Tier 2, Tier 3 and finally the open marketplace, each after an hour without a taker.</span>
          </span>
        </label>
      )}

      <div className="flex flex-wrap gap-5 text-sm text-slate-700">
        {([
          ['Instant book', instant, setInstant],
          ['Overnight', overnight, setOvernight],
          ['Emergency', emergency, setEmergency],
        ] as const).map(([text, val, set]) => (
          <label key={text} className="inline-flex items-center gap-2">
            <input type="checkbox" checked={val} disabled={dis} onChange={(e) => set(e.target.checked)} className="rounded border-slate-300 text-emerald-600" />
            {text}
          </label>
        ))}
      </div>

      <Field label="Notes">
        <Textarea value={notes} maxLength={1000} onChange={(e) => setNotes(e.target.value)} />
      </Field>
    </Modal>
  );
}
