'use client';

import { Select } from '@flexshift/ui';
import { Building2, LogOut, UserCircle2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import type { ReactNode } from 'react';
import { useAuth, useScope } from '@/lib/auth';
import { label } from '@flexshift/ui';

interface HeaderProps {
  title: string;
  subtitle?: string;
  /** Page-specific controls rendered before the user menu. */
  actions?: ReactNode;
  /** Hide the branch picker on pages that are not branch-scoped. */
  hideBranchPicker?: boolean;
}

export function Header({ title, subtitle, actions, hideBranchPicker }: HeaderProps) {
  const { user, logout } = useAuth();
  const { branches, branchId, setBranchId, canPickBranch } = useScope();
  const router = useRouter();
  const orgName = branches[0]?.organization?.name;

  return (
    <header className="min-h-16 bg-white border-b border-slate-200 px-8 py-2 flex items-center justify-between gap-4 shrink-0 flex-wrap">
      <div>
        <h1 className="text-xl font-bold text-slate-900">{title}</h1>
        {subtitle && <p className="text-xs text-slate-500 mt-0.5">{subtitle}</p>}
      </div>

      <div className="flex items-center gap-4 flex-wrap">
        {actions}
        {!hideBranchPicker && canPickBranch && (
          <Select aria-label="Branch" value={branchId} onChange={(e) => setBranchId(e.target.value)} className="!w-56 !py-1.5">
            <option value="">All branches</option>
            {branches.map((b) => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </Select>
        )}
        {orgName && (
          <div className="hidden lg:flex items-center gap-2 bg-slate-50 border border-slate-200/80 rounded-lg px-3 py-1.5 text-xs">
            <Building2 className="w-4 h-4 text-slate-500" />
            <span className="font-semibold text-slate-700">{orgName}</span>
          </div>
        )}
        <div className="flex items-center gap-2.5 pl-3 border-l border-slate-200">
          <UserCircle2 className="w-7 h-7 text-slate-400" />
          <div className="text-left">
            <div className="text-xs font-semibold text-slate-800">{user ? label(user.role) : ''}</div>
            <div className="text-[10px] text-slate-500">{user?.email}</div>
          </div>
          <button
            aria-label="Sign out"
            title="Sign out"
            onClick={async () => { await logout(); router.replace('/login'); }}
            className="p-2 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>
    </header>
  );
}
