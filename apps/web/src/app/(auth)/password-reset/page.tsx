'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { KeyRound, CheckCircle, AlertCircle, Lock } from 'lucide-react';

function PasswordResetContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const tokenParam = searchParams.get('token') || '';

  const [token, setToken] = React.useState(tokenParam);
  const [newPassword, setNewPassword] = React.useState('');
  const [confirmPassword, setConfirmPassword] = React.useState('');
  const [statusMessage, setStatusMessage] = React.useState('');
  const [errorMessage, setErrorMessage] = React.useState('');
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [isSuccess, setIsSuccess] = React.useState(false);

  React.useEffect(() => {
    if (tokenParam) {
      setToken(tokenParam);
    }
  }, [tokenParam]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');
    setStatusMessage('');

    if (!token.trim()) {
      setErrorMessage('Reset token is required. Please check the link from your email.');
      return;
    }

    if (newPassword.length < 8) {
      setErrorMessage('Password must be at least 8 characters long.');
      return;
    }

    if (newPassword !== confirmPassword) {
      setErrorMessage('Passwords do not match.');
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await fetch('/api/auth/password-reset/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token: token.trim(),
          newPassword,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        setErrorMessage(data.error || 'Failed to reset password. Link may have expired.');
        setIsSubmitting(false);
        return;
      }

      setIsSuccess(true);
      setStatusMessage('Password reset successfully. Redirecting to login in 3 seconds...');
      setTimeout(() => {
        router.push('/login');
      }, 3000);
    } catch {
      setErrorMessage('A network error occurred. Please try again.');
      setIsSubmitting(false);
    }
  };

  return (
    <div className="max-w-md mx-auto px-4 py-12">
      <div className="bg-white rounded-3xl border-2 border-slate-300 p-8 shadow-lg">
        <div className="text-center mb-8">
          <div className="w-12 h-12 rounded-2xl bg-blue-600 text-white flex items-center justify-center mx-auto mb-4">
            <KeyRound className="w-6 h-6" />
          </div>
          <h1 className="text-3xl font-extrabold text-slate-900">Reset Password</h1>
          <p className="text-slate-600 text-base mt-1">
            Choose a new, strong password for your account
          </p>
        </div>

        {errorMessage && (
          <div
            role="alert"
            className="mb-6 p-4 rounded-xl bg-rose-50 border-2 border-rose-300 text-rose-800 text-base font-bold flex items-center gap-3"
          >
            <AlertCircle className="w-5 h-5 shrink-0 text-rose-600" />
            <span>{errorMessage}</span>
          </div>
        )}

        {isSuccess ? (
          <div
            role="status"
            className="p-6 rounded-2xl bg-emerald-50 border-2 border-emerald-300 text-emerald-900 text-center space-y-4"
          >
            <CheckCircle className="w-12 h-12 text-emerald-600 mx-auto" />
            <p className="font-bold text-lg">{statusMessage}</p>
            <Link
              href="/login"
              className="inline-block px-6 py-3 bg-blue-600 text-white font-bold rounded-xl hover:bg-blue-700"
            >
              Go to Sign In
            </Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-5">
            {!tokenParam && (
              <div>
                <label htmlFor="token" className="block text-base font-bold text-slate-800 mb-1">
                  Reset Token
                </label>
                <input
                  id="token"
                  type="text"
                  required
                  value={token}
                  onChange={(e) => setToken(e.target.value)}
                  placeholder="Paste token from reset email"
                  className="w-full px-4 py-3 rounded-xl border-2 border-slate-300 text-base focus:border-blue-600 focus:outline-none"
                />
              </div>
            )}

            <div>
              <label htmlFor="newPassword" className="block text-base font-bold text-slate-800 mb-1">
                New Password
              </label>
              <div className="relative">
                <input
                  id="newPassword"
                  type="password"
                  required
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="At least 8 characters"
                  className="w-full px-4 py-3 rounded-xl border-2 border-slate-300 text-lg focus:border-blue-600 focus:outline-none min-h-[52px]"
                />
                <Lock className="w-5 h-5 text-slate-400 absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none" />
              </div>
            </div>

            <div>
              <label htmlFor="confirmPassword" className="block text-base font-bold text-slate-800 mb-1">
                Confirm New Password
              </label>
              <div className="relative">
                <input
                  id="confirmPassword"
                  type="password"
                  required
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Re-enter new password"
                  className="w-full px-4 py-3 rounded-xl border-2 border-slate-300 text-lg focus:border-blue-600 focus:outline-none min-h-[52px]"
                />
                <Lock className="w-5 h-5 text-slate-400 absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none" />
              </div>
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full py-4 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:bg-slate-400 text-white font-extrabold text-lg transition-colors shadow-md min-h-[52px]"
            >
              {isSubmitting ? 'Updating Password...' : 'Save New Password'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

export default function PasswordResetPage() {
  return (
    <React.Suspense fallback={<div className="p-8 text-center text-slate-600">Loading reset form...</div>}>
      <PasswordResetContent />
    </React.Suspense>
  );
}
