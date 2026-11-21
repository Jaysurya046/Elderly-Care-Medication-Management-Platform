'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ShieldCheck, UserPlus, AlertCircle } from 'lucide-react';

export default function SignUpPage() {
  const router = useRouter();
  const [name, setName] = React.useState('');
  const [email, setEmail] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [consentGiven, setConsentGiven] = React.useState(false);
  const [errorMessage, setErrorMessage] = React.useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!consentGiven) {
      setErrorMessage('You must review and agree to the privacy and health consent notice.');
      return;
    }
    router.push('/dashboard');
  };

  return (
    <div className="max-w-md mx-auto px-4 py-12">
      <div className="bg-white rounded-3xl border-2 border-slate-300 p-8 shadow-lg">
        <div className="text-center mb-8">
          <div className="w-12 h-12 rounded-2xl bg-blue-600 text-white flex items-center justify-center mx-auto mb-4">
            <UserPlus className="w-6 h-6" />
          </div>
          <h1 className="text-3xl font-extrabold text-slate-900">Create Account</h1>
          <p className="text-slate-600 text-base mt-1">
            Sign up as an elder or family caregiver
          </p>
        </div>

        {errorMessage && (
          <div
            role="alert"
            aria-live="assertive"
            className="mb-6 p-4 rounded-xl bg-rose-50 border-2 border-rose-300 text-rose-800 text-base font-bold flex items-center gap-3"
          >
            <AlertCircle className="w-5 h-5 shrink-0 text-rose-600" />
            <span>{errorMessage}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label htmlFor="name" className="block text-base font-bold text-slate-800 mb-1">
              Full Name
            </label>
            <input
              id="name"
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Kamala Devi"
              className="w-full px-4 py-3 rounded-xl border-2 border-slate-300 text-lg focus:border-blue-600 focus:outline-none min-h-[52px]"
            />
          </div>

          <div>
            <label htmlFor="email" className="block text-base font-bold text-slate-800 mb-1">
              Email Address
            </label>
            <input
              id="email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="e.g. kamala@example.com"
              className="w-full px-4 py-3 rounded-xl border-2 border-slate-300 text-lg focus:border-blue-600 focus:outline-none min-h-[52px]"
            />
          </div>

          <div>
            <label htmlFor="password" className="block text-base font-bold text-slate-800 mb-1">
              Password
            </label>
            <input
              id="password"
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="At least 8 characters"
              className="w-full px-4 py-3 rounded-xl border-2 border-slate-300 text-lg focus:border-blue-600 focus:outline-none min-h-[52px]"
            />
          </div>

          {/* Explicit Consent Checkbox (Section 8 DPDP & GDPR requirement) */}
          <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
            <div className="flex items-start gap-3">
              <input
                id="consent"
                type="checkbox"
                checked={consentGiven}
                onChange={(e) => setConsentGiven(e.target.checked)}
                className="w-6 h-6 mt-0.5 rounded border-2 border-slate-400 text-blue-600 focus:ring-blue-500 shrink-0"
              />
              <label htmlFor="consent" className="text-sm text-slate-700 leading-snug">
                I understand and consent to storing my medicine schedules and health routines
                securely. I retain ownership of my profile and can export or delete it at any time.
                (Consent Version: <strong>v1.0</strong>)
              </label>
            </div>
          </div>

          <button
            type="submit"
            className="w-full py-4 px-6 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-extrabold text-xl shadow-md min-h-[56px] transition-colors"
          >
            Create My Account
          </button>
        </form>

        <div className="mt-6 text-center text-sm text-slate-600">
          Already have an account?{' '}
          <Link href="/login" className="text-blue-600 font-bold underline">
            Sign In
          </Link>
        </div>
      </div>
    </div>
  );
}
