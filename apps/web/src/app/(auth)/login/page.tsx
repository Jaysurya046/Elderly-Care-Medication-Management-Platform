'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ShieldCheck, KeyRound, Lock, Mail, AlertCircle } from 'lucide-react';
import { Button } from '@elder-care/ui';

export default function LoginPage() {
  const router = useRouter();
  const [authMode, setAuthMode] = React.useState<'password' | 'passcode'>('password');
  const [email, setEmail] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [passcode, setPasscode] = React.useState('');
  const [errorMessage, setErrorMessage] = React.useState('');
  const [isLoading, setIsLoading] = React.useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');
    setIsLoading(true);

    try {
      // For demo purpose, redirect to senior mode or dashboard directly
      if (authMode === 'passcode') {
        if (!/^\d{4,6}$/.test(passcode)) {
          setErrorMessage('PIN must be 4 to 6 numbers.');
          setIsLoading(false);
          return;
        }
        router.push('/senior');
      } else {
        if (!email || !password) {
          setErrorMessage('Please fill in both email and password.');
          setIsLoading(false);
          return;
        }
        router.push('/dashboard');
      }
    } catch {
      setErrorMessage('Sign-in failed. Please check your credentials.');
      setIsLoading(false);
    }
  };

  return (
    <div className="max-w-md mx-auto px-4 py-12">
      <div className="bg-white rounded-3xl border-2 border-slate-300 p-8 shadow-lg">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="w-12 h-12 rounded-2xl bg-blue-600 text-white flex items-center justify-center mx-auto mb-4">
            <Lock className="w-6 h-6" />
          </div>
          <h1 className="text-3xl font-extrabold text-slate-900">Sign In</h1>
          <p className="text-slate-600 text-base mt-1">
            Access your care circle and medicine schedule
          </p>
        </div>

        {/* Auth Mode Toggle */}
        <div className="grid grid-cols-2 gap-2 p-1.5 bg-slate-100 rounded-xl mb-6 border border-slate-200">
          <button
            type="button"
            onClick={() => {
              setAuthMode('password');
              setErrorMessage('');
            }}
            className={`py-2.5 text-center font-bold text-base rounded-lg transition-colors min-h-[44px] ${
              authMode === 'password'
                ? 'bg-white text-blue-700 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Password
          </button>
          <button
            type="button"
            onClick={() => {
              setAuthMode('passcode');
              setErrorMessage('');
            }}
            className={`py-2.5 text-center font-bold text-base rounded-lg transition-colors min-h-[44px] ${
              authMode === 'passcode'
                ? 'bg-white text-blue-700 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Quick PIN
          </button>
        </div>

        {/* Live Error Announcement (Section 7 WCAG requirement) */}
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

        {/* Sign In Form */}
        <form onSubmit={handleSubmit} className="space-y-5">
          {authMode === 'password' ? (
            <>
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
                  placeholder="e.g. kamala@eldercare.demo"
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
                  placeholder="••••••••••••"
                  className="w-full px-4 py-3 rounded-xl border-2 border-slate-300 text-lg focus:border-blue-600 focus:outline-none min-h-[52px]"
                />
              </div>
            </>
          ) : (
            <div>
              <label htmlFor="passcode" className="block text-base font-bold text-slate-800 mb-1">
                4 to 6 Digit Kitchen PIN
              </label>
              <p className="text-sm text-slate-500 mb-2">
                Quick unlock for shared home tablet.
              </p>
              <input
                id="passcode"
                type="password"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={6}
                required
                value={passcode}
                onChange={(e) => setPasscode(e.target.value)}
                placeholder="1234"
                className="w-full px-4 py-3 rounded-xl border-2 border-slate-300 text-2xl tracking-widest text-center font-mono focus:border-blue-600 focus:outline-none min-h-[56px]"
              />
            </div>
          )}

          <button
            type="submit"
            disabled={isLoading}
            className="w-full py-4 px-6 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-extrabold text-xl shadow-md min-h-[56px] transition-colors"
          >
            {isLoading ? 'Signing in...' : authMode === 'passcode' ? 'Unlock Profile' : 'Sign In'}
          </button>
        </form>

        <div className="mt-8 text-center text-sm text-slate-500 border-t pt-4">
          <p>
            Demo Accounts: <br />
            <strong>Kamala:</strong> kamala@eldercare.demo (PIN: 1234) <br />
            <strong>Rajesh:</strong> rajesh@eldercare.demo (PIN: 5678)
          </p>
        </div>
      </div>
    </div>
  );
}
