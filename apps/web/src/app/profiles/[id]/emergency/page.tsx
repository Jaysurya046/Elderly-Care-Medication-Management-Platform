'use client';

import * as React from 'react';
import { AlertTriangle, Printer, Phone, MapPin, Heart, Shield } from 'lucide-react';
import { Button } from '@elder-care/ui';

export default function EmergencyCardPage() {
  const handlePrint = () => {
    if (typeof window !== 'undefined') {
      window.print();
    }
  };

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      {/* Top Action Bar (hidden when printing) */}
      <div className="no-print flex items-center justify-between mb-8 p-4 bg-white rounded-2xl border border-slate-200 shadow-sm">
        <div>
          <span className="text-sm font-bold text-rose-600 uppercase tracking-wider">
            Verified Emergency Record
          </span>
          <p className="text-sm text-slate-500">
            Keep a physical copy in the wallet, refrigerator, or bedside.
          </p>
        </div>
        <button
          onClick={handlePrint}
          className="px-6 py-3 rounded-xl bg-slate-900 hover:bg-black text-white font-bold text-lg min-h-[48px] flex items-center gap-2 shadow-sm transition-colors"
        >
          <Printer className="w-5 h-5" />
          <span>Print Card</span>
        </button>
      </div>

      {/* Printable Emergency Card Container */}
      <div className="emergency-card-container bg-white rounded-3xl border-4 border-rose-600 p-8 shadow-xl">
        {/* Card Header */}
        <div className="border-b-4 border-rose-600 pb-6 mb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-2 text-rose-600 font-black text-sm uppercase tracking-widest mb-1">
              <AlertTriangle className="w-5 h-5 shrink-0" />
              EMERGENCY MEDICAL INFORMATION
            </div>
            <h1 className="text-4xl font-black text-slate-900">Kamala Devi</h1>
            <p className="text-lg font-bold text-slate-600 mt-1">
              Date of Birth: April 14, 1952 (Age: 74)
            </p>
          </div>
          <div className="text-right sm:border-l-4 sm:border-rose-200 sm:pl-6">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
              Blood Group
            </span>
            <div className="text-4xl font-black text-rose-600">O POSITIVE (O+)</div>
          </div>
        </div>

        {/* Critical Alerts Row: Allergies & Conditions */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
          <div className="bg-rose-50 border-2 border-rose-300 rounded-2xl p-5">
            <span className="text-sm font-extrabold text-rose-800 uppercase tracking-wide flex items-center gap-2">
              <AlertTriangle className="w-4 h-4" />
              ALLERGIES (DO NOT ADMINISTER)
            </span>
            <p className="text-2xl font-black text-rose-950 mt-2">
              Penicillin, Sulfa drugs
            </p>
          </div>

          <div className="bg-amber-50 border-2 border-amber-300 rounded-2xl p-5">
            <span className="text-sm font-extrabold text-amber-800 uppercase tracking-wide flex items-center gap-2">
              <Heart className="w-4 h-4" />
              CHRONIC CONDITIONS
            </span>
            <p className="text-xl font-bold text-amber-950 mt-2">
              Type 2 Diabetes, Hypertension, Osteoarthritis
            </p>
          </div>
        </div>

        {/* Current Medications Table */}
        <div className="mb-8">
          <h2 className="text-2xl font-black text-slate-900 border-b-2 border-slate-300 pb-2 mb-4">
            Current Daily Medications
          </h2>
          <div className="space-y-3">
            {[
              { name: 'Telmisartan', strength: '40 mg', timing: 'Morning (08:00 AM)', purpose: 'Blood Pressure (CRITICAL)' },
              { name: 'Metformin', strength: '500 mg', timing: 'Twice daily with meals', purpose: 'Type 2 Diabetes' },
              { name: 'Shelcal 500', strength: '500 mg + D3', timing: 'Afternoon (01:00 PM)', purpose: 'Calcium & Bone Health' },
            ].map((med, i) => (
              <div key={i} className="p-4 rounded-xl border-2 border-slate-200 bg-slate-50 flex items-center justify-between">
                <div>
                  <span className="text-xl font-black text-slate-900">{med.name} {med.strength}</span>
                  <p className="text-base text-slate-600">{med.timing} • {med.purpose}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Emergency Contacts & Hospital */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 border-t-2 border-slate-300 pt-6">
          <div>
            <h3 className="text-lg font-bold text-slate-900 mb-2 flex items-center gap-2">
              <Phone className="w-5 h-5 text-blue-600" />
              Emergency Caregiver Contact
            </h3>
            <p className="text-xl font-black text-slate-900">Rajesh Sharma (Son)</p>
            <p className="text-lg font-bold text-blue-800">+91 98765 43210</p>
            <p className="text-sm text-slate-500">Authorized primary health proxy</p>
          </div>

          <div>
            <h3 className="text-lg font-bold text-slate-900 mb-2 flex items-center gap-2">
              <MapPin className="w-5 h-5 text-rose-600" />
              Doctor & Hospital
            </h3>
            <p className="text-lg font-black text-slate-900">Dr. Anand Kulkarni</p>
            <p className="text-base font-bold text-slate-700">Ruby Hall Clinic, Pune</p>
            <p className="text-sm text-slate-500">Emergency OPD: 020-66455100</p>
          </div>
        </div>

        {/* Footer with Verification Code */}
        <div className="mt-8 pt-4 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between text-xs text-slate-500 gap-2">
          <span>Digital Record ID: EMRG8821 • Access verified by Elder Care Security Guard</span>
          <span>Printed from eldercare.local • Subject to immediate profile revocation</span>
        </div>
      </div>
    </div>
  );
}
