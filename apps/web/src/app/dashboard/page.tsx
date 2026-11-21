'use client';

import * as React from 'react';
import Link from 'next/link';
import {
  Users,
  Pill,
  Calendar,
  FileText,
  Activity,
  ShieldAlert,
  Plus,
  Flame,
  CheckCircle,
  AlertTriangle,
  Clock,
  Printer,
  ChevronRight,
} from 'lucide-react';
import { Badge, Button } from '@elder-care/ui';

export default function CareCircleDashboardPage() {
  const [activeTab, setActiveTab] = React.useState<
    'overview' | 'medications' | 'appointments' | 'notes' | 'circle' | 'audit'
  >('overview');

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      {/* Profile Header */}
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8 bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <h1 className="text-3xl font-extrabold text-slate-900">Kamala Devi</h1>
            <Badge variant="success" className="text-sm">Active Care Circle</Badge>
          </div>
          <p className="text-slate-600 text-base">
            Age: 74 • Location: Pune, India • Timezone: Asia/Kolkata • Primary Doctor: Dr. Anand Kulkarni
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Link
            href="/senior"
            className="px-4 py-2.5 rounded-xl bg-blue-50 text-blue-700 font-bold border border-blue-200 hover:bg-blue-100 min-h-[48px] flex items-center gap-2"
          >
            Switch to Senior Mode
          </Link>
          <Link
            href="/profiles/demo/emergency?code=EMRG8821"
            className="px-4 py-2.5 rounded-xl bg-rose-50 text-rose-700 font-bold border border-rose-200 hover:bg-rose-100 min-h-[48px] flex items-center gap-2"
          >
            <Printer className="w-5 h-5" />
            Print Emergency Card
          </Link>
        </div>
      </header>

      {/* Navigation Tabs */}
      <nav className="flex flex-wrap gap-2 mb-8 border-b border-slate-200 pb-2" aria-label="Dashboard Tabs">
        {[
          { id: 'overview', label: 'Adherence & Overview', icon: Activity },
          { id: 'medications', label: 'Medicines & Stock', icon: Pill },
          { id: 'appointments', label: 'Appointments', icon: Calendar },
          { id: 'notes', label: 'Care Notes', icon: FileText },
          { id: 'circle', label: 'Care Circle', icon: Users },
          { id: 'audit', label: 'Audit Trail', icon: ShieldAlert },
        ].map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`flex items-center gap-2 px-5 py-3 rounded-xl font-bold text-base transition-colors min-h-[48px] ${
                isActive
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
              }`}
            >
              <Icon className="w-5 h-5" />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </nav>

      {/* Tab 1: Overview & Adherence */}
      {activeTab === 'overview' && (
        <div className="space-y-8">
          {/* Key Metrics Row */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
            <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
              <span className="text-slate-500 font-semibold text-sm">7-Day Adherence</span>
              <div className="flex items-baseline gap-2 mt-2">
                <span className="text-4xl font-extrabold text-emerald-600">92%</span>
                <span className="text-slate-500 text-sm">Target: &gt;90%</span>
              </div>
              <p className="text-slate-600 text-xs mt-3">23 of 25 scheduled doses taken on time</p>
            </div>

            <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
              <span className="text-slate-500 font-semibold text-sm">30-Day Adherence</span>
              <div className="flex items-baseline gap-2 mt-2">
                <span className="text-4xl font-extrabold text-blue-600">89%</span>
                <span className="text-slate-500 text-sm">Stable</span>
              </div>
              <p className="text-slate-600 text-xs mt-3">Formula: (Taken + Late) / Eligible Scheduled</p>
            </div>

            <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
              <span className="text-slate-500 font-semibold text-sm">Clean Streak</span>
              <div className="flex items-center gap-2 mt-2">
                <Flame className="w-8 h-8 text-amber-500" />
                <span className="text-4xl font-extrabold text-slate-900">12 Days</span>
              </div>
              <p className="text-slate-600 text-xs mt-3">Consecutive days without any missed doses</p>
            </div>
          </div>

          {/* Deterministic Insights Box */}
          <div className="bg-blue-50 border-2 border-blue-200 rounded-2xl p-6">
            <div className="flex items-center gap-2 mb-3">
              <Activity className="w-5 h-5 text-blue-700" />
              <h3 className="text-lg font-bold text-blue-900">Care Insights (Rule-Based)</h3>
            </div>
            <ul className="list-disc list-inside space-y-2 text-slate-700 text-base">
              <li>Morning doses are consistently taken within 15 minutes of scheduled time.</li>
              <li>Evening Metformin was taken late 2 times last week following travel.</li>
              <li>No critical medication doses missed in the past 14 days.</li>
            </ul>
          </div>

          {/* Recent Activity Timeline */}
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
            <h3 className="text-xl font-bold text-slate-900 mb-4">Recent Care Events</h3>
            <div className="divide-y divide-slate-100">
              {[
                { time: 'Today, 8:15 AM', title: 'Telmisartan 40mg marked TAKEN', actor: 'Kamala Devi', icon: CheckCircle, color: 'text-emerald-600' },
                { time: 'Today, 8:40 AM', title: 'Metformin 500mg marked TAKEN', actor: 'Kamala Devi', icon: CheckCircle, color: 'text-emerald-600' },
                { time: 'Yesterday, 8:30 PM', title: 'Care Note: Blood sugar 114 mg/dL', actor: 'Rajesh Sharma (Caregiver)', icon: FileText, color: 'text-blue-600' },
                { time: 'Nov 19, 1:15 PM', title: 'Shelcal 500 SNOOZED for 15 mins', actor: 'Kamala Devi', icon: Clock, color: 'text-amber-600' },
              ].map((ev, i) => {
                const Icon = ev.icon;
                return (
                  <div key={i} className="py-3 flex items-start gap-4">
                    <Icon className={`w-5 h-5 mt-1 ${ev.color}`} />
                    <div className="flex-1">
                      <p className="font-bold text-slate-900 text-base">{ev.title}</p>
                      <p className="text-sm text-slate-500">{ev.actor} • {ev.time}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Tab 2: Medicines & Stock */}
      {activeTab === 'medications' && (
        <div className="space-y-6">
          <div className="flex justify-between items-center">
            <h2 className="text-2xl font-bold text-slate-900">Current Medications</h2>
            <Button className="gap-2">
              <Plus className="w-5 h-5" />
              Add Prescription
            </Button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {[
              {
                name: 'Telmisartan',
                strength: '40 mg',
                criticality: 'CRITICAL',
                times: 'Daily at 08:00 AM',
                instructions: 'With water in morning',
                stock: 28,
                threshold: 7,
                daysRemaining: 28,
              },
              {
                name: 'Metformin',
                strength: '500 mg',
                criticality: 'STANDARD',
                times: 'Daily at 08:00 AM & 08:00 PM',
                instructions: 'With or after food',
                stock: 45,
                threshold: 10,
                daysRemaining: 22,
              },
              {
                name: 'Shelcal 500 (Calcium + D3)',
                strength: '500 mg',
                criticality: 'STANDARD',
                times: 'Daily at 01:00 PM',
                instructions: 'After lunch',
                stock: 4,
                threshold: 5,
                daysRemaining: 4,
                lowStock: true,
              },
            ].map((med, i) => (
              <div key={i} className="bg-white p-6 rounded-2xl border-2 border-slate-200 shadow-sm flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-xl font-bold text-slate-900">{med.name}</span>
                    <Badge variant={med.criticality === 'CRITICAL' ? 'critical' : 'default'}>
                      {med.criticality}
                    </Badge>
                  </div>
                  <p className="text-base text-slate-700 font-medium mb-1">Strength: {med.strength}</p>
                  <p className="text-sm text-slate-500 mb-2">Schedule: {med.times}</p>
                  <p className="text-sm text-slate-600 bg-slate-50 p-2.5 rounded-lg border border-slate-200 mb-4">
                    👉 {med.instructions}
                  </p>
                </div>

                <div className="border-t pt-4 flex items-center justify-between">
                  <div>
                    <span className="text-xs text-slate-500 uppercase font-semibold">Inventory</span>
                    <p className="text-lg font-bold text-slate-900">
                      {med.stock} units remaining (~{med.daysRemaining} days)
                    </p>
                  </div>
                  {med.lowStock ? (
                    <Badge variant="warning" className="gap-1">
                      <AlertTriangle className="w-3.5 h-3.5" />
                      Refill Needed
                    </Badge>
                  ) : (
                    <Badge variant="success">Stock Good</Badge>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tab 3: Appointments */}
      {activeTab === 'appointments' && (
        <div className="space-y-6">
          <div className="flex justify-between items-center">
            <h2 className="text-2xl font-bold text-slate-900">Upcoming Doctor Appointments</h2>
            <Button className="gap-2">
              <Plus className="w-5 h-5" />
              Schedule Appointment
            </Button>
          </div>

          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-4">
              <div>
                <span className="text-sm font-bold text-blue-700 uppercase tracking-wide">
                  Routine Review • In 5 Days
                </span>
                <h3 className="text-2xl font-bold text-slate-900 mt-1">
                  Cardiology & HbA1c Follow-Up
                </h3>
                <p className="text-slate-600 text-base">
                  Dr. Anand Kulkarni (Cardiology) • Ruby Hall Clinic OPD Wing B
                </p>
                <p className="text-sm text-slate-500 mt-1">
                  Travel Buffer: 35 minutes • Leave by alert configured
                </p>
              </div>
              <Badge variant="outline" className="self-start md:self-auto text-sm">
                Travel-Time Aware
              </Badge>
            </div>

            <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 mt-4 space-y-2">
              <span className="font-bold text-slate-800 text-sm">Questions to ask the doctor:</span>
              <ul className="list-disc list-inside text-slate-700 text-sm space-y-1">
                <li>Can we reduce the painkiller dosage for knee osteoarthritis?</li>
                <li>Review HbA1c test results from fasting blood sugar log.</li>
              </ul>
            </div>
          </div>
        </div>
      )}

      {/* Tab 4: Care Notes */}
      {activeTab === 'notes' && (
        <div className="space-y-6">
          <div className="flex justify-between items-center">
            <h2 className="text-2xl font-bold text-slate-900">Daily Care Notes</h2>
            <Button className="gap-2">
              <Plus className="w-5 h-5" />
              Add Note
            </Button>
          </div>

          <div className="space-y-4">
            {[
              {
                author: 'Rajesh Sharma (Son / Caregiver)',
                time: 'Yesterday at 8:30 PM',
                body: 'Mother had a good walk this morning. Blood sugar before breakfast was 114 mg/dL. Knee pain is milder.',
                isPrivate: false,
              },
              {
                author: 'Dr. Anand Kulkarni',
                time: 'Nov 12, 2026',
                body: 'Maintain Telmisartan 40mg. Avoid high sodium foods.',
                isPrivate: false,
              },
            ].map((n, i) => (
              <div key={i} className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                <div className="flex items-center justify-between mb-2">
                  <span className="font-bold text-slate-900 text-base">{n.author}</span>
                  <span className="text-xs text-slate-500">{n.time}</span>
                </div>
                <p className="text-slate-700 text-base leading-relaxed">{n.body}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tab 5: Care Circle */}
      {activeTab === 'circle' && (
        <div className="space-y-6">
          <div className="flex justify-between items-center">
            <h2 className="text-2xl font-bold text-slate-900">Care Circle Members</h2>
            <Button className="gap-2">
              <Plus className="w-5 h-5" />
              Invite Caregiver
            </Button>
          </div>

          <div className="divide-y divide-slate-200 bg-white rounded-2xl border border-slate-200 overflow-hidden">
            {[
              { name: 'Kamala Devi', email: 'kamala@eldercare.demo', role: 'OWNER', scopes: 'Full Control & Profile Owner' },
              { name: 'Rajesh Sharma', email: 'rajesh@eldercare.demo', role: 'CAREGIVER', scopes: 'Manage Medicines, Appointments, Alerts' },
              { name: 'Sunita (Visiting Nurse)', email: 'sunita@eldercare.demo', role: 'CAREGIVER', scopes: 'Log Doses, View Schedule, Care Notes' },
            ].map((member, i) => (
              <div key={i} className="p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <div className="flex items-center gap-3 mb-1">
                    <span className="font-bold text-slate-900 text-lg">{member.name}</span>
                    <Badge variant={member.role === 'OWNER' ? 'success' : 'default'}>{member.role}</Badge>
                  </div>
                  <p className="text-sm text-slate-500">{member.email}</p>
                  <p className="text-xs text-slate-600 mt-1">Granted: {member.scopes}</p>
                </div>
                {member.role !== 'OWNER' && (
                  <button className="text-sm font-bold text-rose-600 hover:text-rose-700 px-3 py-1.5 rounded-lg border border-rose-200 hover:bg-rose-50 self-start sm:self-auto min-h-[40px]">
                    Revoke Access
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tab 6: Audit Trail */}
      {activeTab === 'audit' && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-2xl font-bold text-slate-900">Security & Audit Log</h2>
              <p className="text-slate-500 text-sm">
                Immutable, append-only record of every sensitive health action and access event.
              </p>
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 overflow-x-auto shadow-sm">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-700">
                <tr>
                  <th className="py-3 px-4 font-bold">Timestamp (UTC)</th>
                  <th className="py-3 px-4 font-bold">Action</th>
                  <th className="py-3 px-4 font-bold">Entity</th>
                  <th className="py-3 px-4 font-bold">Actor</th>
                  <th className="py-3 px-4 font-bold">IP (Hashed)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-600">
                {[
                  { time: '2026-11-21 02:45:12', action: 'DOSE:ACTION', entity: 'DoseEvent (Telmisartan)', actor: 'Kamala Devi', ip: '127.0.0.1' },
                  { time: '2026-11-21 03:10:04', action: 'DOSE:ACTION', entity: 'DoseEvent (Metformin)', actor: 'Kamala Devi', ip: '127.0.0.1' },
                  { time: '2026-11-20 15:00:22', action: 'PROFILE:VIEW', entity: 'CareProfile (Kamala Devi)', actor: 'Rajesh Sharma', ip: '3f8a91b2c4e5' },
                  { time: '2026-11-20 14:55:00', action: 'EMERGENCY_CARD:VIEW', entity: 'EmergencyCard', actor: 'Emergency Code Access', ip: '8d2e1b4f9a0c' },
                ].map((log, i) => (
                  <tr key={i} className="hover:bg-slate-50">
                    <td className="py-3 px-4 font-mono text-xs">{log.time}</td>
                    <td className="py-3 px-4 font-semibold text-slate-800">{log.action}</td>
                    <td className="py-3 px-4">{log.entity}</td>
                    <td className="py-3 px-4">{log.actor}</td>
                    <td className="py-3 px-4 font-mono text-xs">{log.ip}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
