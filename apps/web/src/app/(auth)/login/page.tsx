'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Lock, Mail, AlertCircle, KeyRound, ShieldCheck } from 'lucide-react';

export default function LoginPage() {
  return (
    <React.Suspense fallback={<div className="min-h-screen flex items-center justify-center bg-slate-50"><p className="text-slate-600">Loading sign in...</p></div>}>
      <LoginForm />
    </React.Suspense>
  );
}

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectUrl = searchParams.get('redirect') || '/dashboard';

  const [authMode, setAuthMode] = React.useState<'password' | 'passcode'>('password');
  const [email, setEmail] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [passcode, setPasscode] = React.useState('');
  const [totpCode, setTotpCode] = React.useState('');
  const [requiresTotp, setRequiresTotp] = React.useState(false);
  const [errorMessage, setErrorMessage] = React.useState('');
  const [isLoading, setIsLoading] = React.useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');
    setIsLoading(true);

    try {
      if (authMode === 'passcode') {
        if (!/^\d{4,6}$/.test(passcode)) {
          setErrorMessage('PIN must be 4 to 6 numbers.');
          setIsLoading(false);
          return;
        }
        // In Senior Mode quick PIN unlock, navigate to senior interface
        router.push('/senior');
        return;
      }

      // Password + optional TOTP mode
      const res = await fetch('/api/auth/signin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: email.trim(),
          password,
          totpCode: requiresTotp ? totpCode.trim() : undefined,
        }),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        if (data.requiresTotp) {
          setRequiresTotp(true);
          setErrorMessage('Please enter your 6-digit two-factor authentication code.');
          setIsLoading(false);
          return;
        }
        setErrorMessage(data.error || data.message || 'Sign-in failed. Please check your credentials.');
        setIsLoading(false);
        return;
      }

      // Successfully signed in with session cookie set by server
      router.push(redirectUrl);
      router.refresh();
    } catch {
      setErrorMessage('A network error occurred. Please try again.');
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
              setRequiresTotp(false);
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
              setRequiresTotp(false);
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
                  disabled={requiresTotp}
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
                  disabled={requiresTotp}
                  className="w-full px-4 py-3 rounded-xl border-2 border-slate-300 text-lg focus:border-blue-600 focus:outline-none min-h-[52px]"
                />
              </div>

              {/* TOTP 2FA Step */}
              {requiresTotp && (
                <div className="p-4 bg-blue-50 border-2 border-blue-300 rounded-2xl space-y-2">
                  <label htmlFor="totpCode" className="block text-base font-bold text-blue-900">
                    Two-Factor Authentication Code
                  </label>
                  <p className="text-sm text-blue-700">
                    Enter the 6-digit verification code from your authenticator app.
                  </p>
                  <input
                    id="totpCode"
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    maxLength={6}
                    required
                    autoFocus
                    value={totpCode}
                    onChange={(e) => setTotpCode(e.target.value)}
                    placeholder="123456"
                    className="w-full px-4 py-3 rounded-xl border-2 border-blue-400 text-2xl tracking-widest text-center font-mono focus:border-blue-600 focus:outline-none min-h-[52px]"
                  />
                </div>
              )}
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
            className="w-full py-4 px-6 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-extrabold text-xl shadow-md min-h-[56px] transition-colors disabled:opacity-50"
          >
            {isLoading
              ? 'Verifying...'
              : requiresTotp
              ? 'Verify 2FA & Sign In'
              : authMode === 'passcode'
              ? 'Unlock Profile'
              : 'Sign In'}
          </button>
        </form>

        <div className="mt-6 text-center text-sm text-slate-600">
          Don&apos;t have an account?{' '}
          <Link href="/signup" className="font-bold text-blue-600 hover:underline">
            Create an Account
          </Link>
        </div>

        {/* Demo Credentials block: strictly gated behind non-production environment */}
        {process.env.NODE_ENV !== 'production' && (
          <div className="mt-8 text-center text-sm text-slate-500 border-t pt-4 bg-slate-50 p-3 rounded-xl border border-dashed border-slate-300">
            <span className="font-bold text-xs uppercase tracking-wider text-slate-400 block mb-1">
              Development Only Demo Credentials
            </span>
            <p>
              <strong>Kamala:</strong> kamala@eldercare.demo (PIN: 1234) <br />
              <strong>Rajesh:</strong> rajesh@eldercare.demo (PIN: 5678)
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
