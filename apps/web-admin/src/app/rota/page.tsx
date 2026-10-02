'use client';

import { useState } from 'react';
import { Header } from '@/components/Header';
import { 
  Calendar as CalendarIcon, 
  Plus, 
  Filter, 
  UserCheck, 
  AlertCircle, 
  CheckCircle2, 
  Clock, 
  MapPin,
  X
} from 'lucide-react';

interface MockShift {
  id: string;
  branch: string;
  role: string;
  day: string;
  date: string;
  startTime: string;
  endTime: string;
  hourlyRate: number;
  totalPay: number;
  status: 'OPEN' | 'BOOKED' | 'EMERGENCY' | 'IN_NEGOTIATION';
  assignedWorker?: string;
  systems: string[];
  instantBook: boolean;
}

const initialShifts: MockShift[] = [
  {
    id: 's1',
    branch: 'Richmond George Street Healthcare',
    role: 'Pharmacist',
    day: 'Monday',
    date: 'Oct 5',
    startTime: '09:00',
    endTime: '17:30',
    hourlyRate: 32.5,
    totalPay: 276.25,
    status: 'BOOKED',
    assignedWorker: 'Sarah Yasmin (GPhC-2089412)',
    systems: ['ProScript'],
    instantBook: true,
  },
  {
    id: 's2',
    branch: 'Richmond George Street Healthcare',
    role: 'Pharmacist',
    day: 'Wednesday',
    date: 'Oct 7',
    startTime: '09:00',
    endTime: '18:00',
    hourlyRate: 32.0,
    totalPay: 288.0,
    status: 'OPEN',
    systems: ['ProScript', 'Columbus'],
    instantBook: true,
  },
  {
    id: 's3',
    branch: 'Beckenham High Street Pharmacy',
    role: 'Pharmacist',
    day: 'Friday',
    date: 'Oct 9',
    startTime: '20:00',
    endTime: '04:30',
    hourlyRate: 35.0,
    totalPay: 297.5,
    status: 'EMERGENCY',
    systems: ['Nexphase'],
    instantBook: true,
  },
  {
    id: 's4',
    branch: 'Richmond George Street Healthcare',
    role: 'Pharmacy Dispenser',
    day: 'Saturday',
    date: 'Oct 10',
    startTime: '09:00',
    endTime: '17:00',
    hourlyRate: 18.5,
    totalPay: 148.0,
    status: 'BOOKED',
    assignedWorker: 'Elisha Jones',
    systems: ['ProScript'],
    instantBook: false,
  },
  {
    id: 's5',
    branch: 'Barking Health & Relief Clinic',
    role: 'Pharmacist',
    day: 'Sunday',
    date: 'Oct 11',
    startTime: '10:00',
    endTime: '16:00',
    hourlyRate: 36.0,
    totalPay: 216.0,
    status: 'IN_NEGOTIATION',
    systems: ['Columbus'],
    instantBook: false,
  },
];

const daysOfWeek = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

export default function RotaPage() {
  const [shifts, setShifts] = useState<MockShift[]>(initialShifts);
  const [selectedBranch, setSelectedBranch] = useState('All Branches');
  const [showAddModal, setShowAddModal] = useState(false);
  const [showAssignModal, setShowAssignModal] = useState<string | null>(null);

  // New shift form state
  const [newTitle, setNewTitle] = useState('Clinical Relief Cover');
  const [newBranch, setNewBranch] = useState('Richmond George Street Healthcare');
  const [newDay, setNewDay] = useState('Tuesday');
  const [newStart, setNewStart] = useState('09:00');
  const [newEnd, setNewEnd] = useState('17:30');
  const [newRate, setNewRate] = useState(32.0);
  const [newSystem, setNewSystem] = useState('ProScript');

  const filteredShifts = selectedBranch === 'All Branches'
    ? shifts
    : shifts.filter((s) => s.branch === selectedBranch);

  const handleCreateShift = (e: React.FormEvent) => {
    e.preventDefault();
    const hours = 8.5;
    const shift: MockShift = {
      id: `s-${Date.now()}`,
      branch: newBranch,
      role: 'Pharmacist',
      day: newDay,
      date: 'Oct 6',
      startTime: newStart,
      endTime: newEnd,
      hourlyRate: newRate,
      totalPay: Number((hours * newRate).toFixed(2)),
      status: 'OPEN',
      systems: [newSystem],
      instantBook: true,
    };
    setShifts([...shifts, shift]);
    setShowAddModal(false);
  };

  const handleAssignWorker = (shiftId: string, workerName: string) => {
    setShifts(
      shifts.map((s) =>
        s.id === shiftId
          ? { ...s, status: 'BOOKED', assignedWorker: workerName }
          : s
      )
    );
    setShowAssignModal(null);
  };

  return (
    <>
      <Header
        title="Multi-Branch Visual Rota"
        subtitle="Manage 9-month schedule grids, identify vacancy gaps, and dispatch to Staff Bank"
      />

      <main className="p-8 space-y-6">
        {/* Controls Bar */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 bg-white p-4 rounded-xl border border-slate-200/80 shadow-sm">
          <div className="flex items-center gap-3 w-full sm:w-auto">
            <Filter className="w-4 h-4 text-slate-500" />
            <select
              value={selectedBranch}
              onChange={(e) => setSelectedBranch(e.target.value)}
              className="text-sm font-semibold text-slate-800 bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-emerald-500"
            >
              <option value="All Branches">All Branches (3 Branches)</option>
              <option value="Richmond George Street Healthcare">Richmond George Street Healthcare</option>
              <option value="Beckenham High Street Pharmacy">Beckenham High Street Pharmacy</option>
              <option value="Barking Health & Relief Clinic">Barking Health & Relief Clinic</option>
            </select>
          </div>

          <div className="flex items-center gap-3 w-full sm:w-auto justify-end">
            <span className="text-xs text-slate-500 font-medium">
              Showing week: <strong className="text-slate-800">5 Oct - 11 Oct 2026</strong>
            </span>
            <button
              onClick={() => setShowAddModal(true)}
              className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-lg text-xs font-bold hover:bg-emerald-700 shadow-sm transition-colors"
            >
              <Plus className="w-4 h-4" />
              Add Shift Slot
            </button>
          </div>
        </div>

        {/* Weekly Grid */}
        <div className="grid grid-cols-1 md:grid-cols-7 gap-3">
          {daysOfWeek.map((day) => {
            const dayShifts = filteredShifts.filter((s) => s.day === day);
            return (
              <div key={day} className="bg-slate-100/70 rounded-xl p-3 flex flex-col min-h-[500px] border border-slate-200/60">
                <div className="pb-2 border-b border-slate-200/80 mb-3 flex items-center justify-between">
                  <span className="font-bold text-xs uppercase tracking-wider text-slate-700">{day}</span>
                  <span className="text-[11px] font-semibold text-slate-400">
                    {dayShifts.length} {dayShifts.length === 1 ? 'Shift' : 'Shifts'}
                  </span>
                </div>

                <div className="space-y-3 flex-1">
                  {dayShifts.map((shift) => (
                    <div
                      key={shift.id}
                      className="bg-white rounded-lg p-3.5 border border-slate-200/90 shadow-sm space-y-2 hover:border-slate-300 transition-all"
                    >
                      {/* Status Tag */}
                      <div className="flex items-center justify-between">
                        {shift.status === 'BOOKED' && (
                          <span className="inline-flex items-center gap-1 bg-emerald-100 text-emerald-800 text-[10px] font-bold px-2 py-0.5 rounded">
                            <CheckCircle2 className="w-3 h-3" /> Booked
                          </span>
                        )}
                        {shift.status === 'OPEN' && (
                          <span className="inline-flex items-center gap-1 bg-amber-100 text-amber-800 text-[10px] font-bold px-2 py-0.5 rounded">
                            <AlertCircle className="w-3 h-3" /> Vacancy Gap
                          </span>
                        )}
                        {shift.status === 'EMERGENCY' && (
                          <span className="inline-flex items-center gap-1 bg-rose-100 text-rose-800 text-[10px] font-bold px-2 py-0.5 rounded">
                            <AlertCircle className="w-3 h-3" /> Emergency
                          </span>
                        )}
                        {shift.status === 'IN_NEGOTIATION' && (
                          <span className="inline-flex items-center gap-1 bg-purple-100 text-purple-800 text-[10px] font-bold px-2 py-0.5 rounded">
                            <Clock className="w-3 h-3" /> In Negotiation
                          </span>
                        )}

                        <span className="text-xs font-bold text-slate-900">
                          £{shift.hourlyRate}/hr
                        </span>
                      </div>

                      {/* Role & Time */}
                      <div>
                        <div className="font-bold text-xs text-slate-900 leading-snug">{shift.role}</div>
                        <div className="text-[11px] text-slate-500 flex items-center gap-1 mt-0.5">
                          <Clock className="w-3 h-3" />
                          <span>{shift.startTime} - {shift.endTime}</span>
                        </div>
                      </div>

                      {/* Location */}
                      <div className="text-[11px] text-slate-500 flex items-center gap-1 truncate">
                        <MapPin className="w-3 h-3 shrink-0" />
                        <span className="truncate">{shift.branch.replace(' Healthcare', '').replace(' Pharmacy', '')}</span>
                      </div>

                      {/* Systems */}
                      <div className="flex flex-wrap gap-1">
                        {shift.systems.map((sys) => (
                          <span key={sys} className="bg-slate-100 text-slate-600 text-[10px] font-medium px-1.5 py-0.5 rounded">
                            {sys}
                          </span>
                        ))}
                      </div>

                      {/* Assigned Worker or Action */}
                      <div className="pt-2 border-t border-slate-100 text-[11px]">
                        {shift.assignedWorker ? (
                          <div className="text-emerald-700 font-semibold flex items-center gap-1">
                            <UserCheck className="w-3.5 h-3.5" />
                            <span className="truncate">{shift.assignedWorker}</span>
                          </div>
                        ) : (
                          <button
                            onClick={() => setShowAssignModal(shift.id)}
                            className="w-full text-center py-1 bg-slate-900 text-white rounded font-semibold text-[11px] hover:bg-slate-800 transition-colors shadow-sm"
                          >
                            Assign Staff Bank
                          </button>
                        )}
                      </div>
                    </div>
                  ))}

                  {dayShifts.length === 0 && (
                    <div className="h-28 flex items-center justify-center border-2 border-dashed border-slate-200 rounded-lg text-slate-400 text-xs font-medium">
                      No shifts scheduled
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </main>

      {/* Add Shift Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl max-w-md w-full shadow-2xl overflow-hidden border border-slate-200">
            <div className="p-5 border-b border-slate-100 flex items-center justify-between">
              <h3 className="font-bold text-base text-slate-900">Create New Rota Shift</h3>
              <button onClick={() => setShowAddModal(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateShift} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Branch</label>
                <select
                  value={newBranch}
                  onChange={(e) => setNewBranch(e.target.value)}
                  className="w-full border border-slate-200 rounded-lg p-2 text-xs font-medium focus:ring-2 focus:ring-emerald-500"
                >
                  <option value="Richmond George Street Healthcare">Richmond George Street Healthcare</option>
                  <option value="Beckenham High Street Pharmacy">Beckenham High Street Pharmacy</option>
                  <option value="Barking Health & Relief Clinic">Barking Health & Relief Clinic</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Day of Week</label>
                  <select
                    value={newDay}
                    onChange={(e) => setNewDay(e.target.value)}
                    className="w-full border border-slate-200 rounded-lg p-2 text-xs font-medium"
                  >
                    {daysOfWeek.map((d) => (
                      <option key={d} value={d}>{d}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Hourly Rate (£/hr)</label>
                  <input
                    type="number"
                    value={newRate}
                    onChange={(e) => setNewRate(Number(e.target.value))}
                    step="0.5"
                    className="w-full border border-slate-200 rounded-lg p-2 text-xs font-medium"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Start Time</label>
                  <input
                    type="text"
                    value={newStart}
                    onChange={(e) => setNewStart(e.target.value)}
                    className="w-full border border-slate-200 rounded-lg p-2 text-xs font-medium"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">End Time</label>
                  <input
                    type="text"
                    value={newEnd}
                    onChange={(e) => setNewEnd(e.target.value)}
                    className="w-full border border-slate-200 rounded-lg p-2 text-xs font-medium"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">PMR Computer System</label>
                <select
                  value={newSystem}
                  onChange={(e) => setNewSystem(e.target.value)}
                  className="w-full border border-slate-200 rounded-lg p-2 text-xs font-medium"
                >
                  <option value="ProScript">ProScript</option>
                  <option value="Columbus">Columbus</option>
                  <option value="Nexphase">Nexphase</option>
                  <option value="Positive Solutions">Positive Solutions</option>
                </select>
              </div>

              <div className="pt-4 border-t border-slate-100 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-emerald-600 text-white rounded-lg text-xs font-bold hover:bg-emerald-700 shadow-sm"
                >
                  Publish to Staff Bank
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Direct Assign Staff Bank Modal */}
      {showAssignModal && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl max-w-md w-full shadow-2xl overflow-hidden border border-slate-200">
            <div className="p-5 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h3 className="font-bold text-base text-slate-900">Direct Assign Relief Professional</h3>
                <p className="text-xs text-slate-500">Select verified worker from Staff Bank</p>
              </div>
              <button onClick={() => setShowAssignModal(null)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 space-y-3">
              <div 
                onClick={() => handleAssignWorker(showAssignModal, 'Sarah Yasmin (GPhC-2089412)')}
                className="p-3.5 border border-slate-200 rounded-lg hover:border-emerald-500 hover:bg-emerald-50/50 cursor-pointer transition-all flex items-center justify-between"
              >
                <div>
                  <div className="font-bold text-xs text-slate-900">Sarah Yasmin</div>
                  <div className="text-[11px] text-slate-500">Tier 1 Preferred • GPhC Verified • ProScript</div>
                </div>
                <span className="text-xs font-bold text-emerald-600">Assign</span>
              </div>

              <div 
                onClick={() => handleAssignWorker(showAssignModal, 'David Ibrahim (GPhC-2074319)')}
                className="p-3.5 border border-slate-200 rounded-lg hover:border-emerald-500 hover:bg-emerald-50/50 cursor-pointer transition-all flex items-center justify-between"
              >
                <div>
                  <div className="font-bold text-xs text-slate-900">David Ibrahim</div>
                  <div className="text-[11px] text-slate-500">Tier 2 Regular • Independent Prescriber • Columbus</div>
                </div>
                <span className="text-xs font-bold text-emerald-600">Assign</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
