'use client';

import type { MarketCode, OnboardOrganizationInput, OnboardOrganizationResult, Organization } from '@flexshift/api-client';
import {
  Badge, Button, Card, EmptyState, ErrorBlock, Field, Input, LoadingBlock, Modal, Select, label, td, th, useAction, useAsync, useToast,
} from '@flexshift/ui';
import { Copy, Plus } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Header } from '@/components/Header';
import { api, useAuth } from '@/lib/auth';
import { useMarket } from '@/lib/market';

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

interface FormState {
  orgName: string; adminEmail: string; billingEmail: string; phone: string; marketCode: MarketCode;
  branchName: string; branchCode: string; addressLine1: string; addressLine2: string; city: string; postcode: string; country: string;
  branchPhone: string; managerEmail: string;
}

export default function OrganizationsPage() {
  const { user } = useAuth();
  if (user && user.role !== 'SUPER_ADMIN') {
    return (
      <>
        <Header title="Organizations" hideBranchPicker />
        <main className="p-8"><Card><EmptyState title="Organizations are managed by platform administrators" hint="Ask the platform owner to onboard a new customer." /></Card></main>
      </>
    );
  }
  return <OrganizationsView />;
}

function OrganizationsView() {
  const { markets } = useMarket();
  const { run, busy } = useAction();
  const toast = useToast();
  const { data, error, loading, reload } = useAsync(() => api.organizations.list(), []);

  const defaultCode = (markets?.default ?? 'NZ') as MarketCode;
  const blank = useMemo<FormState>(() => ({
    orgName: '', adminEmail: '', billingEmail: '', phone: '', marketCode: defaultCode,
    branchName: '', branchCode: '', addressLine1: '', addressLine2: '', city: '', postcode: '', country: defaultCode,
    branchPhone: '', managerEmail: '',
  }), [defaultCode]);

  const [creating, setCreating] = useState(false);
  const [f, setF] = useState<FormState>(blank);
  const [created, setCreated] = useState<{ name: string; result: OnboardOrganizationResult } | null>(null);
  const set = <K extends keyof FormState>(k: K) => (e: { target: { value: string } }) => setF((s) => ({ ...s, [k]: e.target.value }));

  const market = markets?.markets.find((m) => m.code === f.marketCode);
  const problems: string[] = [];
  if (f.orgName.trim().length < 2) problems.push('Organization name');
  if (!EMAIL.test(f.adminEmail.trim())) problems.push('A valid organization admin email');
  if (f.billingEmail.trim() && !EMAIL.test(f.billingEmail.trim())) problems.push('A valid billing email');
  if (f.phone.trim().length < 5 || f.phone.trim().length > 25) problems.push('Phone (5 to 25 characters)');
  if (!f.branchName.trim()) problems.push('Branch name');
  if (f.branchCode.trim().length < 2) problems.push('Branch code (at least 2 characters)');
  if (!f.addressLine1.trim() || !f.city.trim() || !f.postcode.trim()) problems.push('Branch address, city and postcode');
  if (f.managerEmail.trim() && !EMAIL.test(f.managerEmail.trim())) problems.push('A valid manager email');
  if (f.managerEmail.trim() && f.managerEmail.trim().toLowerCase() === f.adminEmail.trim().toLowerCase()) problems.push('Different emails for the admin and the manager');

  const open = () => { setF(blank); setCreating(true); };

  async function submit() {
    const body: OnboardOrganizationInput = {
      orgName: f.orgName.trim(), adminEmail: f.adminEmail.trim(), phone: f.phone.trim(), marketCode: f.marketCode,
      branchName: f.branchName.trim(), branchCode: f.branchCode.trim(), addressLine1: f.addressLine1.trim(),
      city: f.city.trim(), postcode: f.postcode.trim(), country: f.country.trim() || f.marketCode,
      ...(f.billingEmail.trim() && { billingEmail: f.billingEmail.trim() }),
      ...(f.addressLine2.trim() && { addressLine2: f.addressLine2.trim() }),
      ...(f.branchPhone.trim() && { branchPhone: f.branchPhone.trim() }),
      ...(f.managerEmail.trim() && { managerEmail: f.managerEmail.trim() }),
    };
    const result = await run(() => api.organizations.onboard(body));
    if (result) {
      setCreated({ name: body.orgName, result });
      setCreating(false);
      reload();
    }
  }

  const copy = (text: string) => navigator.clipboard.writeText(text).then(() => toast.success('Copied'), () => toast.error('Copy failed'));
  const status = (o: Organization) => {
    const admin = o.users?.[0];
    if (!admin) return <Badge tone="amber">No admin</Badge>;
    if (!admin.isActive) return <Badge tone="rose">Admin disabled</Badge>;
    return admin.mustChangePassword && !admin.lastLoginAt ? <Badge tone="sky">Invited, not signed in yet</Badge> : <Badge tone="emerald">Active</Badge>;
  };

  return (
    <>
      <Header
        title="Organizations"
        subtitle="Every customer on the platform"
        hideBranchPicker
        actions={<Button onClick={open}><Plus className="w-4 h-4" />New organization</Button>}
      />
      <main className="p-8 space-y-6">
        <Card className="overflow-x-auto">
          {loading ? <LoadingBlock /> : error ? <ErrorBlock error={error} retry={reload} /> : !data?.length ? (
            <EmptyState title="No organizations yet" hint="Onboard your first customer: it creates the organization, its first branch and its sign-in details in one step." action={<Button onClick={open}>New organization</Button>} />
          ) : (
            <table className="w-full min-w-[900px]">
              <thead><tr>{['Organization', 'Market', 'Admin', 'Branches', 'People', 'Staff bank', 'Status'].map((h) => <th key={h} className={th}>{h}</th>)}</tr></thead>
              <tbody>
                {data.map((o) => (
                  <tr key={o.id}>
                    <td className={td}>
                      <div className="font-semibold text-slate-900">{o.name}</div>
                      <div className="text-xs text-slate-500">{o.code}{o.branches?.length ? ` · ${o.branches.map((b) => b.name).join(', ')}` : ''}</div>
                    </td>
                    <td className={td}>{o.country} · {o.currency}</td>
                    <td className={td}>{o.users?.map((u) => u.email).join(', ') || '-'}</td>
                    <td className={td}>{o._count?.branches ?? 0}</td>
                    <td className={td}>{o._count?.users ?? 0}</td>
                    <td className={td}>{o._count?.staffBankMembers ?? 0}</td>
                    <td className={td}>{status(o)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
      </main>

      <Modal
        open={creating}
        onClose={() => setCreating(false)}
        wide
        title="New organization"
        footer={<><Button variant="secondary" onClick={() => setCreating(false)}>Cancel</Button><Button loading={busy} disabled={problems.length > 0} onClick={submit}>Create organization</Button></>}
      >
        <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Organization</p>
        <Field label="Organization name"><Input value={f.orgName} maxLength={120} onChange={set('orgName')} autoFocus /></Field>
        <div className="grid sm:grid-cols-2 gap-3">
          <Field label="Organization admin email" hint="The owner who signs in first and invites everyone else"><Input type="email" value={f.adminEmail} onChange={set('adminEmail')} /></Field>
          <Field label="Billing email" hint="Defaults to the admin's email"><Input type="email" value={f.billingEmail} onChange={set('billingEmail')} /></Field>
          <Field label="Phone"><Input value={f.phone} maxLength={25} placeholder={market?.phoneExample} onChange={set('phone')} /></Field>
          <Field label="Market" hint={market ? `${market.currency}, ${market.timezone}, ${market.taxName} ${market.taxRatePercent}%` : undefined}>
            <Select value={f.marketCode} onChange={(e) => setF((s) => ({ ...s, marketCode: e.target.value as MarketCode, country: e.target.value }))}>
              {(markets?.markets ?? []).map((m) => <option key={m.code} value={m.code}>{m.name}</option>)}
            </Select>
          </Field>
        </div>

        <p className="text-xs font-bold uppercase tracking-wider text-slate-500 pt-2">First branch</p>
        <div className="grid sm:grid-cols-2 gap-3">
          <Field label="Branch name"><Input value={f.branchName} maxLength={120} onChange={set('branchName')} /></Field>
          <Field label="Branch code" hint="Short and unique, e.g. KIWI-PON-01"><Input value={f.branchCode} maxLength={30} onChange={set('branchCode')} /></Field>
          <Field label="Street address"><Input value={f.addressLine1} maxLength={200} onChange={set('addressLine1')} /></Field>
          <Field label="Address line 2 (optional)"><Input value={f.addressLine2} maxLength={200} onChange={set('addressLine2')} /></Field>
          <Field label="City"><Input value={f.city} maxLength={80} onChange={set('city')} /></Field>
          <Field label="Postcode"><Input value={f.postcode} maxLength={12} onChange={set('postcode')} /></Field>
          <Field label="Branch phone" hint="Defaults to the organization phone"><Input value={f.branchPhone} maxLength={25} onChange={set('branchPhone')} /></Field>
          <Field label="Branch manager email (optional)"><Input type="email" value={f.managerEmail} onChange={set('managerEmail')} /></Field>
        </div>
        {problems.length > 0 && <p className="text-xs text-slate-500">Still needed: {problems.join(' · ')}</p>}
      </Modal>

      <Modal
        open={!!created}
        onClose={() => setCreated(null)}
        wide
        title={created ? `${created.name} is ready` : ''}
        footer={<Button onClick={() => setCreated(null)}>I have copied them</Button>}
      >
        {created && (
          <>
            <p className="text-sm text-slate-700">
              Give each person their temporary password. They must choose their own at first sign-in at the dashboard.
            </p>
            <div className="border border-slate-200 rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead><tr>{['Role', 'Email', 'Temporary password', ''].map((h) => <th key={h} className={th}>{h}</th>)}</tr></thead>
                <tbody>
                  {created.result.users.map((u) => (
                    <tr key={u.email}>
                      <td className={td}>{label(u.role)}</td>
                      <td className={td}>{u.email}</td>
                      <td className={td + ' font-mono'}>{u.temporaryPassword}</td>
                      <td className={td}><Button size="sm" variant="secondary" onClick={() => copy(u.temporaryPassword)}><Copy className="w-3.5 h-3.5" />Copy</Button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-xs font-semibold text-amber-700 bg-amber-50 rounded-lg p-3">These passwords are shown only once and cannot be retrieved later.</p>
          </>
        )}
      </Modal>
    </>
  );
}
