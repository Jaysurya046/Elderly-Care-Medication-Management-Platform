'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { HeartHandshake, CheckCircle, AlertCircle, ArrowRight } from 'lucide-react';

function InviteAcceptContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get('token') || '';

  const [currentUser, setCurrentUser] = React.useState<any>(null);
  const [loadingUser, setLoadingUser] = React.useState(true);
  const [submitting, setSubmitting] = React.useState(false);
  const [statusMessage, setStatusMessage] = React.useState('');
  const [errorMessage, setErrorMessage] = React.useState('');
  const [isAccepted, setIsAccepted] = React.useState(false);

  React.useEffect(() => {
    async function checkAuth() {
      try {
        const res = await fetch('/api/auth/me');
        if (res.ok) {
          const data = await res.json();
          setCurrentUser(data.user);
        } else {
          setCurrentUser(null);
        }
      } catch {
        setCurrentUser(null);
      } finally {
        setLoadingUser(false);
      }
    }
    checkAuth();
  }, []);

  const handleAccept = async () => {
    if (!token) {
      setErrorMessage('Invitation token is missing from the link.');
      return;
    }

    setSubmitting(true);
    setErrorMessage('');
    try {
      const res = await fetch('/api/invite/accept', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        setErrorMessage(data.error || 'Failed to accept invitation. The invitation may be invalid, expired, or already used.');
        setSubmitting(false);
        return;
      }

      setIsAccepted(true);
      setStatusMessage('Invitation accepted! For safety, your membership is currently pending confirmation by the elder/owner before active access is granted.');
    } catch {
      setErrorMessage('A network error occurred. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  if (loadingUser) {
    return (
      <div className="max-w-md mx-auto px-4 py-16 text-center text-slate-600 font-semibold">
        Checking account status...
      </div>
    );
  }

  return (
    <div className="max-w-md mx-auto px-4 py-12">
      <div className="bg-white rounded-3xl border-2 border-slate-300 p-8 shadow-lg">
        <div className="text-center mb-8">
          <div className="w-12 h-12 rounded-2xl bg-indigo-600 text-white flex items-center justify-center mx-auto mb-4">
            <HeartHandshake className="w-6 h-6" />
          </div>
          <h1 className="text-3xl font-extrabold text-slate-900">Care Circle Invitation</h1>
          <p className="text-slate-600 text-base mt-1">
            Join the care circle to support medication management and wellness
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

        {isAccepted ? (
          <div className="text-center space-y-4">
            <div className="p-6 rounded-2xl bg-emerald-50 border-2 border-emerald-300 text-emerald-900">
              <CheckCircle className="w-12 h-12 text-emerald-600 mx-auto mb-3" />
              <h2 className="text-xl font-extrabold mb-2">Welcome to the Care Circle!</h2>
              <p className="text-sm font-medium">{statusMessage}</p>
            </div>
            <Link
              href="/dashboard"
              className="inline-flex items-center justify-center gap-2 w-full py-4 bg-blue-600 hover:bg-blue-700 text-white font-extrabold text-lg rounded-xl shadow-md min-h-[52px]"
            >
              Go to Dashboard
              <ArrowRight className="w-5 h-5" />
            </Link>
          </div>
        ) : !currentUser ? (
          <div className="space-y-4">
            <div className="p-4 rounded-xl bg-amber-50 border border-amber-300 text-amber-900 text-sm">
              Please sign in with the email address that received this invitation to accept it.
            </div>
            <Link
              href={`/login?redirect=${encodeURIComponent(`/invite/accept?token=${token}`)}`}
              className="block w-full text-center py-3.5 px-4 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-base min-h-[48px]"
            >
              Sign In to Accept
            </Link>
            <Link
              href={`/signup?redirect=${encodeURIComponent(`/invite/accept?token=${token}`)}`}
              className="block w-full text-center py-3.5 px-4 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-base min-h-[48px]"
            >
              Create New Account
            </Link>
          </div>
        ) : (
          <div className="space-y-6">
            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 text-slate-700 text-sm">
              Signed in as: <strong className="text-slate-900">{currentUser.email}</strong>
            </div>
            <button
              onClick={handleAccept}
              disabled={submitting || !token}
              className="w-full py-4 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-400 text-white font-extrabold text-lg transition-colors shadow-md min-h-[52px]"
            >
              {submitting ? 'Accepting Invitation...' : 'Accept Invitation'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export default function InviteAcceptPage() {
  return (
    <React.Suspense fallback={<div className="p-8 text-center text-slate-600">Loading invitation...</div>}>
      <InviteAcceptContent />
    </React.Suspense>
  );
}
