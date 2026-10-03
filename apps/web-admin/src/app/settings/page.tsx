'use client';

import { ALL_DOC_TYPES, BASE_MANDATORY_DOCS, docLabel, findMarket, type DocType, type FacilityBranch } from '@flexshift/api-client';
import { Badge, Button, Card, CardHeader, EmptyState, ErrorBlock, Field, Input, LoadingBlock, Modal, Select, label, td, th, useAction, useAsync, useToast } from '@flexshift/ui';
import { Copy, Plus } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Header } from '@/components/Header';
import { api, useAuth, useScope } from '@/lib/auth';
import { useMarket } from '@/lib/market';

export default function SettingsPage() {
  const { user } = useAuth();
  if (user && user.role !== 'ORG_ADMIN' && user.role !== 'SUPER_ADMIN') {
    return (
      <>
        <Header title="Settings" hideBranchPicker />
        <main className="p-8"><Card><EmptyState title="Settings are for organization admins" hint="Ask your organization admin to change these details." /></Card></main>
      </>
    );
  }
  return <SettingsView />;
}

const emptyBranch = { name: '', branchCode: '', addressLine1: '', addressLine2: '', city: '', postcode: '', phone: '', email: '', managerId: '' };

function SettingsView() {
  const { user } = useAuth();
  const { orgId } = useScope();
  const toast = useToast();
  const { run, busy } = useAction();
  const mkt = useMarket();

  const org = useAsync(async () => (orgId ? api.organizations.get(orgId) : null), [orgId]);
  const branches = useAsync(() => api.branches.list(), []);
  const users = useAsync(() => api.users.list(), []);

  const [orgForm, setOrgForm] = useState({ name: '', billingEmail: '', phone: '' });
  const [extraDocs, setExtraDocs] = useState<DocType[]>([]);
  const [country, setCountry] = useState('');
  const [savingMarket, setSavingMarket] = useState(false);
  useEffect(() => {
    if (org.data) {
      setOrgForm({ name: org.data.name, billingEmail: org.data.billingEmail, phone: org.data.phone });
      setExtraDocs(org.data.requiredDocTypes ?? []);
      setCountry(org.data.country ?? '');
    }
  }, [org.data]);

  const [branchModal, setBranchModal] = useState<FacilityBranch | 'new' | null>(null);
  const [bf, setBf] = useState(emptyBranch);
  const [invite, setInvite] = useState(false);
  const [inv, setInv] = useState({ email: '', role: 'FACILITY_MANAGER' as 'ORG_ADMIN' | 'FACILITY_MANAGER', branchId: '' });
  const [tempPw, setTempPw] = useState<{ email: string; password: string } | null>(null);

  const managers = (users.data ?? []).filter((u) => u.role === 'FACILITY_MANAGER' || u.role === 'ORG_ADMIN');

  function openBranch(b: FacilityBranch | 'new') {
    setBf(b === 'new' ? emptyBranch : {
      name: b.name, branchCode: b.branchCode, addressLine1: b.addressLine1 ?? '', addressLine2: '',
      city: b.city, postcode: b.postcode, phone: b.phone, email: b.email ?? '', managerId: b.manager?.id ?? '',
    });
    setBranchModal(b);
  }

  async function saveOrg() {
    if (!orgId) return;
    const res = await run(() => api.organizations.update(orgId, {
      name: orgForm.name.trim(), billingEmail: orgForm.billingEmail.trim(), phone: orgForm.phone.trim(), requiredDocTypes: extraDocs,
    }), 'Organization updated');
    if (res) { org.reload(); mkt.reload(); }
  }

  async function saveMarket() {
    if (!orgId || !country) return;
    setSavingMarket(true);
    const res = await run(() => api.organizations.update(orgId, { country }), 'Market updated');
    setSavingMarket(false);
    if (res) { org.reload(); mkt.reload(); }
  }

  async function saveBranch() {
    const common = {
      name: bf.name.trim(), addressLine1: bf.addressLine1.trim(), city: bf.city.trim(), postcode: bf.postcode.trim(), phone: bf.phone.trim(),
      ...(bf.addressLine2.trim() ? { addressLine2: bf.addressLine2.trim() } : {}),
      ...(bf.email.trim() ? { email: bf.email.trim() } : {}),
      ...(bf.managerId ? { managerId: bf.managerId } : {}),
    };
    const res = await run(
      () => (branchModal === 'new'
        ? api.branches.create({ ...common, branchCode: bf.branchCode.trim() })
        : api.branches.update((branchModal as FacilityBranch).id, common)),
      branchModal === 'new' ? 'Branch added' : 'Branch updated',
    );
    if (res) { setBranchModal(null); branches.reload(); users.reload(); }
  }

  async function sendInvite() {
    const res = await run(() => api.users.create({
      email: inv.email.trim(), role: inv.role, ...(inv.role === 'FACILITY_MANAGER' ? { branchId: inv.branchId } : {}),
    }));
    if (res) {
      setInvite(false);
      setTempPw({ email: res.email, password: res.temporaryPassword });
      setInv({ email: '', role: 'FACILITY_MANAGER', branchId: '' });
      users.reload();
    }
  }

  async function toggleActive(id: string, isActive: boolean) {
    if (await run(() => api.users.update(id, { isActive }), isActive ? 'User reactivated' : 'User deactivated')) users.reload();
  }

  // Credentials already mandatory in the market need no extra tick.
  const orgMarket = findMarket(mkt.markets, country || org.data?.country) ?? mkt.market;
  const marketMandatory = [...BASE_MANDATORY_DOCS, ...orgMarket.extraMandatoryDocs];
  const optionalDocs = ALL_DOC_TYPES.filter((t) => !marketMandatory.includes(t));
  const branchValid = bf.name.trim() && (branchModal !== 'new' || bf.branchCode.trim()) && bf.addressLine1.trim() && bf.city.trim() && bf.postcode.trim() && bf.phone.trim();
  const inviteValid = /\S+@\S+\.\S+/.test(inv.email) && (inv.role === 'ORG_ADMIN' || inv.branchId);

  return (
    <>
      <Header title="Settings" subtitle="Organization, branches and team" hideBranchPicker
        actions={<Link href="/change-password" className="text-sm font-semibold text-emerald-700 hover:underline">Change my password</Link>} />
      <main className="p-8 space-y-6">
        <Card>
          <CardHeader title="Organization" />
          <div className="p-5">
            {org.loading ? <LoadingBlock /> : org.error ? <ErrorBlock error={org.error} retry={org.reload} /> : (
              <div className="grid gap-4 max-w-xl">
                <Field label="Name"><Input value={orgForm.name} onChange={(e) => setOrgForm({ ...orgForm, name: e.target.value })} /></Field>
                <Field label="Billing email"><Input type="email" value={orgForm.billingEmail} onChange={(e) => setOrgForm({ ...orgForm, billingEmail: e.target.value })} /></Field>
                <Field label="Phone"><Input value={orgForm.phone} onChange={(e) => setOrgForm({ ...orgForm, phone: e.target.value })} /></Field>
                <fieldset className="border border-slate-200 rounded-lg p-4">
                  <legend className="px-1 text-xs font-semibold text-slate-700">Additional required credentials</legend>
                  <p className="text-xs text-slate-500 mb-3">
                    Every worker already needs verified, in-date {marketMandatory.map((t) => docLabel(orgMarket, t)).join(', ')} documents. Tick anything else your organization insists on before a worker can be booked.
                  </p>
                  <div className="grid grid-cols-2 gap-2">
                    {optionalDocs.map((t) => (
                      <label key={t} className="inline-flex items-center gap-2 text-sm text-slate-700">
                        <input
                          type="checkbox"
                          checked={extraDocs.includes(t)}
                          onChange={(e) => setExtraDocs(e.target.checked ? [...extraDocs, t] : extraDocs.filter((x) => x !== t))}
                          className="rounded border-slate-300 text-emerald-600"
                        />
                        {docLabel(orgMarket, t)}
                      </label>
                    ))}
                  </div>
                </fieldset>
                <div><Button loading={busy} disabled={!orgForm.name.trim()} onClick={saveOrg}>Save changes</Button></div>
              </div>
            )}
          </div>
        </Card>

        <Card>
          <CardHeader title="Market" />
          <div className="p-5">
            {org.loading ? <LoadingBlock /> : !orgId ? <p className="text-sm text-slate-500">Market settings apply to an organization. Sign in as an organization admin to change them.</p> : (
              <div className="grid gap-4 max-w-xl">
                <Field label="Country / market">
                  <Select value={country} onChange={(e) => setCountry(e.target.value)}>
                    {!country && <option value="">Select a market</option>}
                    {(mkt.markets?.markets ?? []).map((m) => <option key={m.code} value={m.code}>{m.name}</option>)}
                  </Select>
                </Field>
                {orgMarket && country && (
                  <dl className="grid grid-cols-3 gap-3 text-sm">
                    <div><dt className="text-xs text-slate-500">Currency</dt><dd className="font-semibold text-slate-900">{orgMarket.currency}</dd></div>
                    <div><dt className="text-xs text-slate-500">Timezone</dt><dd className="font-semibold text-slate-900">{orgMarket.timezone}</dd></div>
                    <div><dt className="text-xs text-slate-500">Tax</dt><dd className="font-semibold text-slate-900">{orgMarket.taxName} {orgMarket.taxRatePercent}%</dd></div>
                  </dl>
                )}
                <p className="text-xs text-slate-500">
                  Changing the market affects new shifts, invoices and credential wording from now on. Existing shifts and invoices keep the currency they were created with.
                </p>
                <div><Button loading={savingMarket} disabled={!country || country === org.data?.country} onClick={saveMarket}>Save market</Button></div>
              </div>
            )}
          </div>
        </Card>

        <Card>
          <CardHeader title="Branches" action={<Button size="sm" onClick={() => openBranch('new')}><Plus className="w-3.5 h-3.5" />Add branch</Button>} />
          {branches.loading ? <LoadingBlock /> : branches.error ? <ErrorBlock error={branches.error} retry={branches.reload} /> : !branches.data?.length ? (
            <EmptyState title="No branches yet" />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead><tr>{['Name', 'Code', 'City', 'Phone', 'Manager', ''].map((h) => <th key={h} className={th}>{h}</th>)}</tr></thead>
                <tbody>
                  {branches.data.map((b) => (
                    <tr key={b.id}>
                      <td className={td + ' font-semibold'}>{b.name}</td>
                      <td className={td}>{b.branchCode}</td>
                      <td className={td}>{b.city}, {b.postcode}</td>
                      <td className={td}>{b.phone}</td>
                      <td className={td}>{b.manager?.email ?? '-'}</td>
                      <td className={td}><Button size="sm" variant="secondary" onClick={() => openBranch(b)}>Edit</Button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <Card>
          <CardHeader title="Team" action={<Button size="sm" onClick={() => setInvite(true)}><Plus className="w-3.5 h-3.5" />Invite manager/admin</Button>} />
          {users.loading ? <LoadingBlock /> : users.error ? <ErrorBlock error={users.error} retry={users.reload} /> : !users.data?.length ? (
            <EmptyState title="No team members" />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead><tr>{['Email', 'Role', 'Branch', 'Status', ''].map((h) => <th key={h} className={th}>{h}</th>)}</tr></thead>
                <tbody>
                  {users.data.map((u) => (
                    <tr key={u.id}>
                      <td className={td}>{u.email}</td>
                      <td className={td}>{label(u.role)}</td>
                      <td className={td}>{u.managedBranch?.name ?? '-'}</td>
                      <td className={td}><Badge tone={u.isActive ? 'emerald' : 'slate'}>{u.isActive ? 'Active' : 'Inactive'}</Badge></td>
                      <td className={td}>
                        {u.id !== user?.id && (
                          <Button size="sm" variant="secondary" disabled={busy} onClick={() => toggleActive(u.id, !u.isActive)}>
                            {u.isActive ? 'Deactivate' : 'Reactivate'}
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </main>

      <Modal open={!!branchModal} onClose={() => setBranchModal(null)} title={branchModal === 'new' ? 'Add branch' : 'Edit branch'}
        footer={<><Button variant="secondary" onClick={() => setBranchModal(null)}>Cancel</Button><Button loading={busy} disabled={!branchValid} onClick={saveBranch}>Save</Button></>}>
        <Field label="Name"><Input value={bf.name} onChange={(e) => setBf({ ...bf, name: e.target.value })} /></Field>
        <Field label="Branch code" hint={branchModal === 'new' ? undefined : 'Cannot be changed'}>
          <Input value={bf.branchCode} disabled={branchModal !== 'new'} onChange={(e) => setBf({ ...bf, branchCode: e.target.value })} />
        </Field>
        <Field label="Address line 1"><Input value={bf.addressLine1} onChange={(e) => setBf({ ...bf, addressLine1: e.target.value })} /></Field>
        <Field label="Address line 2 (optional)"><Input value={bf.addressLine2} onChange={(e) => setBf({ ...bf, addressLine2: e.target.value })} /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="City"><Input value={bf.city} onChange={(e) => setBf({ ...bf, city: e.target.value })} /></Field>
          <Field label="Postcode"><Input value={bf.postcode} onChange={(e) => setBf({ ...bf, postcode: e.target.value })} /></Field>
        </div>
        <Field label="Phone"><Input value={bf.phone} onChange={(e) => setBf({ ...bf, phone: e.target.value })} /></Field>
        <Field label="Email (optional)"><Input type="email" value={bf.email} onChange={(e) => setBf({ ...bf, email: e.target.value })} /></Field>
        <Field label="Manager">
          <Select value={bf.managerId} onChange={(e) => setBf({ ...bf, managerId: e.target.value })}>
            <option value="">No manager</option>
            {managers.map((m) => <option key={m.id} value={m.id}>{m.email} ({label(m.role)})</option>)}
          </Select>
        </Field>
      </Modal>

      <Modal open={invite} onClose={() => setInvite(false)} title="Invite manager/admin"
        footer={<><Button variant="secondary" onClick={() => setInvite(false)}>Cancel</Button><Button loading={busy} disabled={!inviteValid} onClick={sendInvite}>Create account</Button></>}>
        <Field label="Email"><Input type="email" value={inv.email} onChange={(e) => setInv({ ...inv, email: e.target.value })} /></Field>
        <Field label="Role">
          <Select value={inv.role} onChange={(e) => setInv({ ...inv, role: e.target.value as typeof inv.role })}>
            <option value="FACILITY_MANAGER">Facility manager</option>
            <option value="ORG_ADMIN">Organization admin</option>
          </Select>
        </Field>
        {inv.role === 'FACILITY_MANAGER' && (
          <Field label="Branch">
            <Select value={inv.branchId} onChange={(e) => setInv({ ...inv, branchId: e.target.value })}>
              <option value="">Select a branch</option>
              {(branches.data ?? []).map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </Select>
          </Field>
        )}
      </Modal>

      <Modal open={!!tempPw} onClose={() => setTempPw(null)} title="Account created"
        footer={<Button onClick={() => setTempPw(null)}>Done</Button>}>
        {tempPw && (
          <>
            <p className="text-sm text-slate-700">Share this temporary password with <span className="font-semibold">{tempPw.email}</span>. They will be asked to change it at first login.</p>
            <div className="flex items-center gap-2">
              <code className="flex-1 rounded-lg bg-slate-100 px-3 py-2 text-sm font-mono select-all">{tempPw.password}</code>
              <Button variant="secondary" onClick={() => navigator.clipboard.writeText(tempPw.password).then(() => toast.success('Copied'), () => toast.error('Copy failed'))}>
                <Copy className="w-4 h-4" />Copy
              </Button>
            </div>
            <p className="text-xs font-semibold text-amber-700 bg-amber-50 rounded-lg p-3">This password is shown only once. Copy it now; it cannot be retrieved later.</p>
          </>
        )}
      </Modal>
    </>
  );
}
