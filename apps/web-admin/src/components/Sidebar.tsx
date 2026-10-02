'use client';

import type { Role } from '@flexshift/api-client';
import clsx from 'clsx';
import {
  CalendarDays, Clock, FileCheck2, Handshake, LayoutDashboard, ListChecks, Palmtree, Receipt, Settings, ShieldCheck, UserSearch, Users,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/lib/auth';

const ALL: Role[] = ['SUPER_ADMIN', 'ORG_ADMIN', 'FACILITY_MANAGER'];
const ADMINS: Role[] = ['SUPER_ADMIN', 'ORG_ADMIN'];

const navItems: { href: string; label: string; icon: typeof Users; roles: Role[] }[] = [
  { href: '/', label: 'Overview', icon: LayoutDashboard, roles: ALL },
  { href: '/rota', label: 'Multi-Branch Rota', icon: CalendarDays, roles: ALL },
  { href: '/shifts', label: 'Shifts', icon: ListChecks, roles: ALL },
  { href: '/negotiations', label: 'Rate Negotiations', icon: Handshake, roles: ALL },
  { href: '/staff-bank', label: 'Staff Bank Roster', icon: Users, roles: ALL },
  { href: '/workers', label: 'Relief Workers', icon: UserSearch, roles: ALL },
  { href: '/compliance', label: 'Compliance Desk', icon: FileCheck2, roles: ALL },
  { href: '/timesheets', label: 'Timesheet Approvals', icon: Clock, roles: ALL },
  { href: '/invoices', label: 'Billing & Invoices', icon: Receipt, roles: ADMINS },
  { href: '/leave', label: 'Leave Management', icon: Palmtree, roles: ALL },
  { href: '/settings', label: 'Settings', icon: Settings, roles: ADMINS },
];

export function Sidebar() {
  const pathname = usePathname();
  const { user } = useAuth();
  const items = navItems.filter((i) => user && i.roles.includes(user.role));

  return (
    <aside className="w-64 bg-slate-900 text-slate-100 flex flex-col shrink-0 min-h-screen sticky top-0 h-screen">
      <div className="h-16 flex items-center px-6 border-b border-slate-800 gap-3">
        <div className="w-9 h-9 rounded-lg bg-emerald-500 flex items-center justify-center text-white font-bold text-lg shadow-sm">FS</div>
        <div>
          <span className="font-bold text-lg tracking-tight text-white">FlexShift</span>
          <span className="block text-[11px] font-medium text-emerald-400 uppercase tracking-wider">Enterprise Ops</span>
        </div>
      </div>

      <nav className="flex-1 px-4 py-6 space-y-1.5 overflow-y-auto">
        {items.map((item) => {
          const Icon = item.icon;
          const isActive = item.href === '/' ? pathname === '/' : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={clsx(
                'flex items-center gap-3 px-3.5 py-2.5 rounded-lg text-sm font-medium transition-colors',
                isActive ? 'bg-emerald-600 text-white shadow-sm' : 'text-slate-400 hover:text-white hover:bg-slate-800/60',
              )}
            >
              <Icon className="w-4 h-4 shrink-0" />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>

      <div className="p-4 border-t border-slate-800">
        <div className="bg-slate-800/80 rounded-lg p-3 text-xs flex items-start gap-2.5 border border-slate-700/60">
          <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
          <div>
            <div className="font-semibold text-slate-200">Compliance gating on</div>
            <div className="text-slate-400 mt-0.5">Only verified, in-date workers can be booked</div>
          </div>
        </div>
      </div>
    </aside>
  );
}
