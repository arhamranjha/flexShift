'use client';

import { useState, useEffect } from 'react';
import { Header } from '@/components/Header';
import { 
  Building2, 
  Users, 
  AlertTriangle, 
  Clock, 
  TrendingUp, 
  PlusCircle, 
  CheckCircle2, 
  ArrowRight 
} from 'lucide-react';
import Link from 'next/link';

export default function DashboardPage() {
  const [stats, setStats] = useState({
    activeBranches: 3,
    staffBankSize: 24,
    fillRate: '94.2%',
    uncoveredVacancies: 2,
    pendingTimesheets: 1,
  });

  const [urgentShifts, setUrgentShifts] = useState([
    {
      id: '1',
      branch: 'Beckenham High Street Pharmacy',
      role: 'Pharmacist',
      date: 'Sat, 10 Oct 2026',
      time: '20:00 - 04:30',
      rate: '£35.00/hr',
      isEmergency: true,
      systems: ['Nexphase'],
    },
    {
      id: '2',
      branch: 'Richmond George Street Healthcare',
      role: 'Pharmacist',
      date: 'Sun, 11 Oct 2026',
      time: '09:00 - 18:00',
      rate: '£33.00/hr',
      isEmergency: false,
      systems: ['ProScript'],
    },
  ]);

  return (
    <>
      <Header 
        title="Workforce Operations Dashboard" 
        subtitle="Live multi-branch scheduling, staff bank engagement, and shift fulfillment metrics"
      />

      <main className="p-8 space-y-8">
        {/* KPI Metric Grid */}
        <div className="grid grid-cols-1 md:grid-cols-5 gap-5">
          <div className="bg-white p-5 rounded-xl border border-slate-200/80 shadow-sm flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">Active Branches</p>
              <h3 className="text-2xl font-bold text-slate-900 mt-1">{stats.activeBranches}</h3>
              <p className="text-[11px] text-emerald-600 font-medium mt-1">London Network</p>
            </div>
            <div className="w-11 h-11 bg-slate-100 rounded-lg flex items-center justify-center text-slate-600">
              <Building2 className="w-5 h-5" />
            </div>
          </div>

          <div className="bg-white p-5 rounded-xl border border-slate-200/80 shadow-sm flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">Staff Bank Pool</p>
              <h3 className="text-2xl font-bold text-slate-900 mt-1">{stats.staffBankSize}</h3>
              <p className="text-[11px] text-emerald-600 font-medium mt-1">100% Vetted Relief</p>
            </div>
            <div className="w-11 h-11 bg-emerald-50 rounded-lg flex items-center justify-center text-emerald-600">
              <Users className="w-5 h-5" />
            </div>
          </div>

          <div className="bg-white p-5 rounded-xl border border-slate-200/80 shadow-sm flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">Shift Fill Rate</p>
              <h3 className="text-2xl font-bold text-slate-900 mt-1">{stats.fillRate}</h3>
              <p className="text-[11px] text-emerald-600 font-medium mt-1">+3.8% this month</p>
            </div>
            <div className="w-11 h-11 bg-blue-50 rounded-lg flex items-center justify-center text-blue-600">
              <TrendingUp className="w-5 h-5" />
            </div>
          </div>

          <div className="bg-white p-5 rounded-xl border border-slate-200/80 shadow-sm flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">Open Vacancies</p>
              <h3 className="text-2xl font-bold text-rose-600 mt-1">{stats.uncoveredVacancies}</h3>
              <p className="text-[11px] text-rose-500 font-medium mt-1">Requires immediate cover</p>
            </div>
            <div className="w-11 h-11 bg-rose-50 rounded-lg flex items-center justify-center text-rose-600">
              <AlertTriangle className="w-5 h-5" />
            </div>
          </div>

          <div className="bg-white p-5 rounded-xl border border-slate-200/80 shadow-sm flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">Timesheet Queue</p>
              <h3 className="text-2xl font-bold text-amber-600 mt-1">{stats.pendingTimesheets}</h3>
              <p className="text-[11px] text-amber-600 font-medium mt-1">Awaiting manager sign-off</p>
            </div>
            <div className="w-11 h-11 bg-amber-50 rounded-lg flex items-center justify-center text-amber-600">
              <Clock className="w-5 h-5" />
            </div>
          </div>
        </div>

        {/* Quick Actions & Urgent Shifts */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Urgent Vacancies Card */}
          <div className="lg:col-span-2 bg-white rounded-xl border border-slate-200/80 shadow-sm overflow-hidden">
            <div className="p-6 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h2 className="text-base font-bold text-slate-900">Priority Open Vacancies</h2>
                <p className="text-xs text-slate-500">Uncovered shifts needing relief staff assignment</p>
              </div>
              <Link 
                href="/rota" 
                className="text-xs font-semibold text-emerald-600 hover:text-emerald-700 flex items-center gap-1"
              >
                View Full Rota <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </div>

            <div className="divide-y divide-slate-100">
              {urgentShifts.map((shift) => (
                <div key={shift.id} className="p-5 flex items-center justify-between hover:bg-slate-50/60 transition-colors">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-sm text-slate-900">{shift.branch}</span>
                      {shift.isEmergency && (
                        <span className="bg-rose-100 text-rose-800 text-[10px] font-bold px-2 py-0.5 rounded-full uppercase">
                          Emergency Surge
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-slate-500 flex items-center gap-3">
                      <span>{shift.date}</span>
                      <span>•</span>
                      <span>{shift.time}</span>
                      <span>•</span>
                      <span className="font-bold text-emerald-700">{shift.rate}</span>
                    </div>
                    <div className="flex items-center gap-1.5 mt-1.5">
                      {shift.systems.map((s) => (
                        <span key={s} className="bg-slate-100 text-slate-600 text-[11px] px-2 py-0.5 rounded border border-slate-200/60 font-medium">
                          {s}
                        </span>
                      ))}
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <Link
                      href="/rota"
                      className="px-3.5 py-1.5 bg-emerald-600 text-white rounded-lg text-xs font-semibold hover:bg-emerald-700 shadow-sm"
                    >
                      Assign Staff
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Quick Shortcuts & Staff Bank Tier summary */}
          <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm p-6 space-y-6">
            <div>
              <h2 className="text-base font-bold text-slate-900">Direct Actions</h2>
              <p className="text-xs text-slate-500 mt-0.5">Quick workflows for rota coordinators</p>
            </div>

            <div className="space-y-3">
              <Link
                href="/rota"
                className="w-full flex items-center justify-between p-3.5 rounded-lg border border-slate-200 bg-slate-50/50 hover:bg-emerald-50 hover:border-emerald-200 transition-colors group"
              >
                <div className="flex items-center gap-3">
                  <PlusCircle className="w-5 h-5 text-emerald-600" />
                  <div className="text-left">
                    <div className="text-xs font-bold text-slate-800 group-hover:text-emerald-900">Build Open Shift</div>
                    <div className="text-[11px] text-slate-500">Publish slot to Staff Bank or Marketplace</div>
                  </div>
                </div>
                <ArrowRight className="w-4 h-4 text-slate-400 group-hover:text-emerald-600" />
              </Link>

              <Link
                href="/staff-bank"
                className="w-full flex items-center justify-between p-3.5 rounded-lg border border-slate-200 bg-slate-50/50 hover:bg-emerald-50 hover:border-emerald-200 transition-colors group"
              >
                <div className="flex items-center gap-3">
                  <Users className="w-5 h-5 text-blue-600" />
                  <div className="text-left">
                    <div className="text-xs font-bold text-slate-800 group-hover:text-blue-900">Staff Bank Roster</div>
                    <div className="text-[11px] text-slate-500">Tier 1 & Tier 2 preferred relief pool</div>
                  </div>
                </div>
                <ArrowRight className="w-4 h-4 text-slate-400 group-hover:text-blue-600" />
              </Link>

              <Link
                href="/compliance"
                className="w-full flex items-center justify-between p-3.5 rounded-lg border border-slate-200 bg-slate-50/50 hover:bg-emerald-50 hover:border-emerald-200 transition-colors group"
              >
                <div className="flex items-center gap-3">
                  <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                  <div className="text-left">
                    <div className="text-xs font-bold text-slate-800 group-hover:text-emerald-900">Verify Credentials</div>
                    <div className="text-[11px] text-slate-500">Inspect Identity, RTW, DBS & Indemnity</div>
                  </div>
                </div>
                <ArrowRight className="w-4 h-4 text-slate-400 group-hover:text-emerald-600" />
              </Link>
            </div>
          </div>
        </div>
      </main>
    </>
  );
}
