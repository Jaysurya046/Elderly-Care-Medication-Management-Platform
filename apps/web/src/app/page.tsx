import Link from 'next/link';
import { Heart, ShieldCheck, Users, Clock, AlertTriangle } from 'lucide-react';

export default function HomePage() {
  return (
    <div className="max-w-4xl mx-auto px-6 py-12">
      <header className="text-center mb-12">
        <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-blue-100 text-blue-800 font-semibold text-sm mb-4">
          <ShieldCheck className="w-4 h-4" />
          Consent-Based Elder Healthcare
        </div>
        <h1 className="text-4xl sm:text-5xl font-extrabold text-slate-900 tracking-tight mb-4">
          Elder Care & Medication Platform
        </h1>
        <p className="text-xl text-slate-600 max-w-2xl mx-auto">
          Clear, large-text medicine schedules for older adults, with real-time updates and peace of
          mind for family caregivers.
        </p>
      </header>

      {/* Two Entry Points */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-12">
        {/* Senior Mode Card */}
        <div className="bg-white p-8 rounded-2xl border-2 border-blue-200 shadow-md hover:border-blue-500 transition-colors flex flex-col justify-between">
          <div>
            <div className="w-14 h-14 rounded-xl bg-blue-600 text-white flex items-center justify-center mb-6">
              <Clock className="w-8 h-8" />
            </div>
            <h2 className="text-2xl font-bold text-slate-900 mb-3">Senior Mode</h2>
            <p className="text-slate-600 text-lg mb-6 leading-relaxed">
              Designed for ease and clarity. See today&apos;s medicines in large, easy-to-read blocks.
              Tap once to confirm you took your dose, or listen to instructions read aloud.
            </p>
          </div>
          <Link
            href="/senior"
            className="w-full inline-flex items-center justify-center px-6 py-4 rounded-xl bg-blue-600 text-white text-xl font-bold hover:bg-blue-700 focus-visible:ring-4 focus-visible:ring-blue-400 transition-all text-center min-h-[56px]"
          >
            Open Senior Mode (/senior)
          </Link>
        </div>

        {/* Care Circle Dashboard Card */}
        <div className="bg-white p-8 rounded-2xl border-2 border-emerald-200 shadow-md hover:border-emerald-500 transition-colors flex flex-col justify-between">
          <div>
            <div className="w-14 h-14 rounded-xl bg-emerald-600 text-white flex items-center justify-center mb-6">
              <Users className="w-8 h-8" />
            </div>
            <h2 className="text-2xl font-bold text-slate-900 mb-3">Care Circle Mode</h2>
            <p className="text-slate-600 text-lg mb-6 leading-relaxed">
              Full overview for family and caregivers. Manage prescriptions, monitor adherence
              streaks, track doctor visits, and manage safety alerts.
            </p>
          </div>
          <Link
            href="/dashboard"
            className="w-full inline-flex items-center justify-center px-6 py-4 rounded-xl bg-emerald-600 text-white text-xl font-bold hover:bg-emerald-700 focus-visible:ring-4 focus-visible:ring-emerald-400 transition-all text-center min-h-[56px]"
          >
            Open Care Dashboard (/dashboard)
          </Link>
        </div>
      </div>

      {/* Emergency Access Banner */}
      <div className="bg-rose-50 border-2 border-rose-300 rounded-xl p-6 flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <AlertTriangle className="w-8 h-8 text-rose-600 shrink-0" />
          <div>
            <h3 className="text-lg font-bold text-rose-900">Emergency Medical Card</h3>
            <p className="text-rose-700 text-base">
              First responders or clinics can access vital allergy and medication records with an
              emergency code.
            </p>
          </div>
        </div>
        <Link
          href="/profiles/demo/emergency?code=EMRG8821"
          className="whitespace-nowrap px-5 py-3 rounded-lg bg-rose-600 text-white font-bold hover:bg-rose-700 focus-visible:ring-4 focus-visible:ring-rose-400 text-center"
        >
          View Emergency Card
        </Link>
      </div>

      {/* Disclaimer Notice (Section 1, Principle 4) */}
      <footer className="mt-12 text-center text-sm text-slate-500 border-t pt-6">
        <p>
          <strong>Notice:</strong> This software is not a substitute for professional medical
          advice, diagnosis, or treatment. Always follow your prescribing physician&apos;s
          instructions.
        </p>
      </footer>
    </div>
  );
}
