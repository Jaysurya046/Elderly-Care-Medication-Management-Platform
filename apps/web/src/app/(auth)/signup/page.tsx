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
  const [dateOfBirth, setDateOfBirth] = React.useState('1950-01-01');
  const [timezone, setTimezone] = React.useState('Asia/Kolkata');
  const [bloodType, setBloodType] = React.useState('O+');
  const [consentGiven, setConsentGiven] = React.useState(false);
  const [errorMessage, setErrorMessage] = React.useState('');
  const [fieldErrors, setFieldErrors] = React.useState<Record<string, string>>({});
  const [isLoading, setIsLoading] = React.useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');
    setFieldErrors({});

    if (!consentGiven) {
      setErrorMessage('You must review and agree to the privacy and health consent notice.');
      return;
    }

    setIsLoading(true);

    try {
      const res = await fetch('/api/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          email: email.trim(),
          password,
          dateOfBirth,
          timezone,
          bloodType,
          consentGiven: true,
          consentVersion: 'v1.0',
        }),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        if (data.errors) {
          setFieldErrors(data.errors);
        }
        setErrorMessage(data.error || 'Account creation failed. Please check your entries.');
        setIsLoading(false);
        return;
      }

      // Successfully signed up and authenticated with session cookie
      router.push('/dashboard');
      router.refresh();
    } catch {
      setErrorMessage('A network error occurred. Please try again.');
      setIsLoading(false);
    }
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
            {fieldErrors.name && (
              <p className="text-rose-600 text-sm font-semibold mt-1">{fieldErrors.name}</p>
            )}
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
            {fieldErrors.email && (
              <p className="text-rose-600 text-sm font-semibold mt-1">{fieldErrors.email}</p>
            )}
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
            {fieldErrors.password && (
              <p className="text-rose-600 text-sm font-semibold mt-1">{fieldErrors.password}</p>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label htmlFor="dob" className="block text-sm font-bold text-slate-800 mb-1">
                Date of Birth
              </label>
              <input
                id="dob"
                type="date"
                required
                value={dateOfBirth}
                onChange={(e) => setDateOfBirth(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border-2 border-slate-300 text-base focus:border-blue-600 focus:outline-none min-h-[48px]"
              />
            </div>

            <div>
              <label htmlFor="bloodType" className="block text-sm font-bold text-slate-800 mb-1">
                Blood Type
              </label>
              <select
                id="bloodType"
                value={bloodType}
                onChange={(e) => setBloodType(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border-2 border-slate-300 text-base focus:border-blue-600 focus:outline-none min-h-[48px] bg-white"
              >
                {['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-', 'Unknown'].map((bt) => (
                  <option key={bt} value={bt}>
                    {bt}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="timezone" className="block text-sm font-bold text-slate-800 mb-1">
                Timezone
              </label>
              <select
                id="timezone"
                value={timezone}
                onChange={(e) => setTimezone(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border-2 border-slate-300 text-base focus:border-blue-600 focus:outline-none min-h-[48px] bg-white"
              >
                <option value="Asia/Kolkata">Asia/Kolkata (IST)</option>
                <option value="America/New_York">America/New_York (EST)</option>
                <option value="America/Los_Angeles">America/Los_Angeles (PST)</option>
                <option value="Europe/London">Europe/London (GMT)</option>
                <option value="UTC">UTC</option>
              </select>
            </div>
          </div>

          {/* Explicit Consent & Privacy Notice (Section 8 DPDP & GDPR requirement) */}
          <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-3">
            <div className="text-sm text-slate-700 leading-relaxed font-medium">
              <strong className="text-slate-900 block mb-1">Health Data Privacy Notice (v1.0):</strong>
              We store and process sensitive health information (medications, dose adherence, appointments, doctor notes) solely to facilitate your care circle coordination. Your health data is never shared with third parties or advertisers.
            </div>

            <div className="flex items-start gap-3 pt-2 border-t border-slate-200">
              <input
                id="consent"
                type="checkbox"
                required
                checked={consentGiven}
                onChange={(e) => setConsentGiven(e.target.checked)}
                className="w-5 h-5 mt-0.5 rounded border-2 border-slate-400 text-blue-600 focus:ring-blue-500 shrink-0"
              />
              <label htmlFor="consent" className="text-sm font-bold text-slate-800 leading-snug cursor-pointer">
                I give explicit consent to the processing of medical and health information as described in Notice v1.0.
              </label>
            </div>
            {fieldErrors.consentGiven && (
              <p className="text-rose-600 text-sm font-semibold">{fieldErrors.consentGiven}</p>
            )}
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="w-full py-4 px-6 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-extrabold text-xl shadow-md min-h-[56px] transition-colors disabled:opacity-50"
          >
            {isLoading ? 'Creating Account...' : 'Agree & Create Account'}
          </button>
        </form>

        <div className="mt-6 text-center text-sm text-slate-600">
          Already have an account?{' '}
          <Link href="/login" className="font-bold text-blue-600 hover:underline">
            Sign In
          </Link>
        </div>
      </div>
    </div>
  );
}
