'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import {
  CheckCircle2,
  Clock,
  Sun,
  Sunset,
  Moon,
  Coffee,
  AlertCircle,
  Settings2,
  WifiOff,
  LogOut,
  RefreshCw,
  Lock,
} from 'lucide-react';
import { Badge, ReadAloudButton } from '@elder-care/ui';
import {
  syncOfflineQueueItems,
  loadOfflineQueue,
  saveOfflineQueue,
  QueuedOfflineAction,
} from '@/lib/offline-queue';
import { useTranslation, LanguageSelector } from '@/lib/i18n';

interface DoseItem {
  id: string;
  name: string;
  strength: string;
  instructions: string;
  timeStr: string;
  block: 'MORNING' | 'AFTERNOON' | 'EVENING' | 'BEDTIME';
  status: 'PENDING' | 'TAKEN' | 'SNOOZED' | 'SKIPPED' | 'MISSED' | 'LATE_TAKEN';
  isNextDue?: boolean;
}

interface QueuedAction {
  profileId: string;
  doseId: string;
  action: 'TAKE' | 'SNOOZE' | 'SKIP';
  skipReason?: string;
  queuedAt: string;
}

export default function SeniorModePage() {
  const router = useRouter();

  // Profile & session state
  const [profileId, setProfileId] = React.useState<string | null>(null);
  const [membershipId, setMembershipId] = React.useState<string | null>(null);
  const [elderName, setElderName] = React.useState<string>('Kamala Devi');
  const [loading, setLoading] = React.useState(true);
  const [doses, setDoses] = React.useState<DoseItem[]>([]);

  // Accessibility & Display state
  const [textSize, setTextSize] = React.useState<'normal' | 'large' | 'xlarge'>('normal');
  const [highContrast, setHighContrast] = React.useState(false);
  const [statusMessage, setStatusMessage] = React.useState('');
  const [errorMessage, setErrorMessage] = React.useState('');

  // Skip modal state
  const [skipModalDoseId, setSkipModalDoseId] = React.useState<string | null>(null);
  const [skipReason, setSkipReason] = React.useState('');
  const [submittingAction, setSubmittingAction] = React.useState(false);

  // Passcode exit modal state
  const [exitModalOpen, setExitModalOpen] = React.useState(false);
  const [passcode, setPasscode] = React.useState('');
  const [passcodeError, setPasscodeError] = React.useState('');
  const [verifyingPasscode, setVerifyingPasscode] = React.useState(false);

  // Offline handling
  const [isOffline, setIsOffline] = React.useState(false);
  const [queuedCount, setQueuedCount] = React.useState(0);

  // Detect time block from Date in profile timezone
  const getTimeBlock = (date: Date, timeZone: string = 'Asia/Kolkata'): 'MORNING' | 'AFTERNOON' | 'EVENING' | 'BEDTIME' => {
    const hourStr = new Intl.DateTimeFormat('en-US', { hour: 'numeric', hour12: false, timeZone }).format(date);
    const hours = parseInt(hourStr, 10);
    if (hours >= 5 && hours < 12) return 'MORNING';
    if (hours >= 12 && hours < 17) return 'AFTERNOON';
    if (hours >= 17 && hours < 21) return 'EVENING';
    return 'BEDTIME';
  };

  const { t } = useTranslation();

  // High Contrast mode toggle (WCAG AAA >= 7:1)
  React.useEffect(() => {
    document.documentElement.setAttribute('data-high-contrast', String(highContrast));
    if (highContrast) {
      document.body.classList.add('high-contrast');
    } else {
      document.body.classList.remove('high-contrast');
    }
  }, [highContrast]);

  // Root font-size scaling for text size
  React.useEffect(() => {
    document.documentElement.setAttribute('data-text-size', textSize);
    document.body.classList.remove('text-large', 'text-xlarge');
    if (textSize === 'large') document.body.classList.add('text-large');
    if (textSize === 'xlarge') document.body.classList.add('text-xlarge');
  }, [textSize]);

  // Load offline queue count
  const updateQueueCount = () => {
    const q = loadOfflineQueue();
    setQueuedCount(q.length);
  };

  // Synchronize offline queued actions with drop-on-409 and clientActionIds
  const syncOfflineQueue = React.useCallback(async () => {
    try {
      const queue = loadOfflineQueue();
      if (!Array.isArray(queue) || queue.length === 0) return;

      setStatusMessage(`Syncing ${queue.length} offline actions...`);

      const result = await syncOfflineQueueItems(queue);

      saveOfflineQueue(result.remainingQueue);
      setQueuedCount(result.remainingQueue.length);

      if (result.remainingQueue.length === 0) {
        setStatusMessage('All offline medication actions synchronized successfully.');
      } else {
        setStatusMessage(`Synced ${result.successful} actions. ${result.remainingQueue.length} remaining.`);
      }
    } catch {
      // ignore parse errors
    }
  }, []);

  // Online / Offline listeners
  React.useEffect(() => {
    setIsOffline(typeof navigator !== 'undefined' ? !navigator.onLine : false);
    updateQueueCount();

    const handleOnline = () => {
      setIsOffline(false);
      setStatusMessage('Internet connection restored. Synchronizing offline actions...');
      syncOfflineQueue();
    };

    const handleOffline = () => {
      setIsOffline(true);
      setStatusMessage('You are offline. Actions will be saved safely on this device and synced when connected.');
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [syncOfflineQueue]);

  // Fetch real profile & doses
  const loadData = React.useCallback(async () => {
    try {
      setLoading(true);
      setErrorMessage('');

      // 1. Get current session and profile info
      const meRes = await fetch('/api/auth/me');
      if (!meRes.ok) {
        if (meRes.status === 401) {
          router.push('/login?redirect=/senior');
          return;
        }
        throw new Error('Failed to load user profile');
      }

      const meData = await meRes.json();
      const firstMembership = meData.memberships?.[0];
      const activeProfile = firstMembership?.profile || firstMembership?.careProfile;
      if (!firstMembership || !activeProfile) {
        setErrorMessage('No active care profile found for this account.');
        setLoading(false);
        return;
      }

      const activeProfileId = activeProfile.id;
      const profileTimezone = activeProfile.timezone || 'Asia/Kolkata';
      setProfileId(activeProfileId);
      setMembershipId(firstMembership.id);
      setElderName(activeProfile.displayName || activeProfile.elderName || 'Senior');

      // 2. Fetch real doses for today in profile timezone
      const formatter = new Intl.DateTimeFormat('en-CA', {
        timeZone: profileTimezone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      });
      const todayDateStr = formatter.format(new Date()); // YYYY-MM-DD
      const startOfDay = new Date(`${todayDateStr}T00:00:00.000Z`).toISOString();
      const endOfDay = new Date(`${todayDateStr}T23:59:59.999Z`).toISOString();

      const dosesRes = await fetch(
        `/api/profiles/${activeProfileId}/doses?startDate=${encodeURIComponent(startOfDay)}&endDate=${encodeURIComponent(endOfDay)}`
      );

      if (dosesRes.ok) {
        const dosesData = await dosesRes.json();
        const mappedDoses: DoseItem[] = (dosesData.data || []).map((d: any) => {
          const sched = new Date(d.scheduledAt);
          const med = d.schedule?.medication || d.medication;
          return {
            id: d.id,
            name: med?.name || 'Medication',
            strength: med?.strength || '',
            instructions: med?.instructions || 'Take as prescribed',
            timeStr: new Intl.DateTimeFormat('en-US', {
              hour: '2-digit',
              minute: '2-digit',
              timeZone: profileTimezone,
            }).format(sched),
            block: getTimeBlock(sched, profileTimezone),
            status: d.status,
          };
        });

        // Set next due flag on first pending or snoozed dose
        let foundNext = false;
        for (const dose of mappedDoses) {
          if (!foundNext && (dose.status === 'PENDING' || dose.status === 'SNOOZED')) {
            dose.isNextDue = true;
            foundNext = true;
          }
        }

        setDoses(mappedDoses);
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Error loading doses.');
    } finally {
      setLoading(false);
    }
  }, [router]);

  React.useEffect(() => {
    loadData();
  }, [loadData]);

  // Queue offline action with clientActionId
  const queueOfflineAction = (doseId: string, action: 'TAKE' | 'SNOOZE' | 'SKIP', reason?: string) => {
    if (!profileId) return;
    try {
      const q = loadOfflineQueue();
      const clientActionId = (typeof crypto !== 'undefined' && crypto.randomUUID)
        ? crypto.randomUUID()
        : `client_act_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

      q.push({
        clientActionId,
        profileId,
        doseId,
        action,
        skipReason: reason,
        timestamp: new Date().toISOString(),
      });
      saveOfflineQueue(q);
      setQueuedCount(q.length);
    } catch {
      // ignore
    }
  };

  // 3-Tap: Handle TAKE
  const handleTakeDose = async (doseId: string) => {
    if (isOffline) {
      queueOfflineAction(doseId, 'TAKE');
      setDoses((prev) =>
        prev.map((d) => (d.id === doseId ? { ...d, status: 'TAKEN', isNextDue: false } : d))
      );
      setStatusMessage('Offline: Medicine recorded as taken. Will sync when back online.');
      return;
    }

    if (!profileId) return;
    setSubmittingAction(true);
    setErrorMessage('');
    try {
      const res = await fetch(`/api/profiles/${profileId}/doses/${doseId}/action`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'TAKE' }),
      });

      const data = await res.json();
      if (res.status === 409) {
        const actorName = data.actorName || data.actor || data.message || 'another caregiver';
        setErrorMessage(`Already recorded by ${actorName}.`);
        await loadData();
        return;
      }

      if (!res.ok) {
        throw new Error(data.error || 'Failed to record dose.');
      }

      setStatusMessage('Good job! Medicine marked as taken.');
      await loadData();
    } catch (err: any) {
      setErrorMessage(err.message || 'Could not record dose.');
    } finally {
      setSubmittingAction(false);
    }
  };

  // 3-Tap: Handle SNOOZE
  const handleSnoozeDose = async (doseId: string) => {
    if (isOffline) {
      queueOfflineAction(doseId, 'SNOOZE');
      setDoses((prev) =>
        prev.map((d) => (d.id === doseId ? { ...d, status: 'SNOOZED', isNextDue: false } : d))
      );
      setStatusMessage('Offline: Reminder snoozed for 15 minutes.');
      return;
    }

    if (!profileId) return;
    setSubmittingAction(true);
    setErrorMessage('');
    try {
      const res = await fetch(`/api/profiles/${profileId}/doses/${doseId}/action`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'SNOOZE' }),
      });

      const data = await res.json();
      if (res.status === 409) {
        const actorName = data.actorName || data.actor || data.message || 'another caregiver';
        setErrorMessage(`Already recorded by ${actorName}.`);
        await loadData();
        return;
      }

      if (!res.ok) {
        throw new Error(data.error || 'Failed to snooze dose.');
      }

      setStatusMessage('Reminder set. We will remind you again in 15 minutes.');
      await loadData();
    } catch (err: any) {
      setErrorMessage(err.message || 'Could not snooze dose.');
    } finally {
      setSubmittingAction(false);
    }
  };

  // 3-Tap: Handle SKIP with reason
  const handleConfirmSkip = async () => {
    if (!skipModalDoseId || !skipReason.trim()) return;

    if (isOffline) {
      queueOfflineAction(skipModalDoseId, 'SKIP', skipReason);
      setDoses((prev) =>
        prev.map((d) =>
          d.id === skipModalDoseId ? { ...d, status: 'SKIPPED', isNextDue: false } : d
        )
      );
      setStatusMessage('Offline: Medicine marked as skipped. Will sync when back online.');
      setSkipModalDoseId(null);
      setSkipReason('');
      return;
    }

    if (!profileId) return;
    setSubmittingAction(true);
    setErrorMessage('');
    try {
      const res = await fetch(`/api/profiles/${profileId}/doses/${skipModalDoseId}/action`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'SKIP', skipReason }),
      });

      const data = await res.json();
      if (res.status === 409) {
        const actorName = data.actorName || data.actor || data.message || 'another caregiver';
        setErrorMessage(`Already recorded by ${actorName}.`);
        setSkipModalDoseId(null);
        setSkipReason('');
        await loadData();
        return;
      }

      if (!res.ok) {
        throw new Error(data.error || 'Failed to record skip.');
      }

      setStatusMessage('Medicine marked as skipped. Caregiver has been notified.');
      setSkipModalDoseId(null);
      setSkipReason('');
      await loadData();
    } catch (err: any) {
      setErrorMessage(err.message || 'Could not skip dose.');
    } finally {
      setSubmittingAction(false);
    }
  };

  // Passcode verification to exit Senior Mode
  const handleVerifyPasscodeAndExit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!passcode || passcode.length < 4) {
      setPasscodeError('Please enter your 4-6 digit passcode.');
      return;
    }

    if (!membershipId) {
      router.push('/dashboard');
      return;
    }

    setVerifyingPasscode(true);
    setPasscodeError('');
    try {
      const res = await fetch('/api/auth/passcode', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'verify',
          membershipId,
          passcode,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        setPasscodeError(data.error || 'Incorrect passcode. Try again.');
        return;
      }

      // Exit authorized
      setExitModalOpen(false);
      router.push('/dashboard');
    } catch {
      setPasscodeError('Error verifying passcode. Please try again.');
    } finally {
      setVerifyingPasscode(false);
    }
  };

  // Find next pending or snoozed dose
  const nextDose = doses.find((d) => d.status === 'PENDING' || d.status === 'SNOOZED');

  return (
    <div className="max-w-3xl mx-auto px-4 py-8 text-slate-900">
      {/* Offline Status Banner */}
      {isOffline && (
        <div
          role="alert"
          aria-live="assertive"
          className="mb-6 p-4 rounded-2xl bg-amber-500 text-slate-950 font-black text-lg flex items-center justify-between shadow-md"
        >
          <div className="flex items-center gap-3">
            <WifiOff className="w-7 h-7 shrink-0" />
            <span>You are currently OFFLINE. All dose actions are securely saved locally.</span>
          </div>
          {queuedCount > 0 && (
            <Badge variant="warning" className="bg-slate-950 text-white text-sm">
              {queuedCount} Queued
            </Badge>
          )}
        </div>
      )}

      {/* Screen Reader Live Status Region */}
      <div aria-live="polite" className="sr-only" role="status">
        {statusMessage}
      </div>
      {errorMessage && (
        <div aria-live="assertive" className="sr-only" role="alert">
          {errorMessage}
        </div>
      )}

      {/* Accessibility & Display Controls Bar */}
      <div className="flex flex-wrap items-center justify-between gap-4 p-4 mb-8 bg-white rounded-2xl border-2 border-slate-300 shadow-sm">
        <div className="flex items-center gap-2">
          <Settings2 className="w-6 h-6 text-slate-700" />
          <span className="font-bold text-lg">Display:</span>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* Text Size Controls */}
          <div className="inline-flex rounded-lg border-2 border-slate-300 p-1 bg-slate-100" role="group" aria-label="Text Size Controls">
            <button
              onClick={() => setTextSize('normal')}
              className={`px-3 py-1.5 rounded-md font-bold text-sm min-h-[40px] ${
                textSize === 'normal' ? 'bg-white shadow text-blue-700' : 'text-slate-700'
              }`}
              aria-label="Standard text size"
            >
              A
            </button>
            <button
              onClick={() => setTextSize('large')}
              className={`px-3 py-1.5 rounded-md font-bold text-base min-h-[40px] ${
                textSize === 'large' ? 'bg-white shadow text-blue-700' : 'text-slate-700'
              }`}
              aria-label="Large text size"
            >
              A+
            </button>
            <button
              onClick={() => setTextSize('xlarge')}
              className={`px-3 py-1.5 rounded-md font-bold text-lg min-h-[40px] ${
                textSize === 'xlarge' ? 'bg-white shadow text-blue-700' : 'text-slate-700'
              }`}
              aria-label="Extra large text size"
            >
              A++
            </button>
          </div>

          {/* High Contrast Toggle */}
          <button
            onClick={() => setHighContrast(!highContrast)}
            className={`px-4 py-2 rounded-lg font-bold border-2 transition-colors min-h-[48px] ${
              highContrast
                ? 'bg-black text-white border-black'
                : 'bg-white text-slate-800 border-slate-400 hover:bg-slate-100'
            }`}
            aria-pressed={highContrast}
          >
            {highContrast ? 'Black & White' : 'High Contrast'}
          </button>

          {/* Language Selector */}
          <LanguageSelector />

          {/* Passcode Protected Exit */}
          <button
            onClick={() => {
              setPasscode('');
              setPasscodeError('');
              setExitModalOpen(true);
            }}
            className="flex items-center gap-2 px-4 py-2 rounded-lg font-bold border-2 border-slate-300 text-slate-700 hover:bg-slate-100 min-h-[48px]"
            aria-label="Exit Senior Mode to Dashboard (PIN required)"
          >
            <Lock className="w-5 h-5 text-slate-500" />
            <span>Exit Mode</span>
          </button>
        </div>
      </div>

      {/* Header */}
      <header className="mb-8">
        <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight mb-2">
          Today&apos;s Medicines
        </h1>
        <p className="text-xl text-slate-600">
          Hello {elderName}. Here are your medicines for today.
        </p>
      </header>

      {/* Loading & Error States */}
      {loading ? (
        <div className="p-12 text-center bg-white rounded-3xl border-2 border-slate-200 shadow-sm">
          <RefreshCw className="w-10 h-10 text-blue-600 animate-spin mx-auto mb-4" />
          <p className="text-2xl font-bold text-slate-700">Loading your medication schedule...</p>
        </div>
      ) : errorMessage ? (
        <div className="p-8 bg-rose-50 border-2 border-rose-300 rounded-2xl mb-8">
          <p className="text-rose-800 text-xl font-bold">{errorMessage}</p>
          <button
            onClick={loadData}
            className="mt-4 px-6 py-3 bg-rose-600 text-white font-bold rounded-xl text-lg hover:bg-rose-700"
          >
            Try Again
          </button>
        </div>
      ) : (
        <>
          {/* Next Dose Due (Hero Banner) */}
          {nextDose ? (
            <section
              aria-labelledby="next-due-heading"
              className="mb-10 p-6 sm:p-8 bg-blue-50 border-4 border-blue-600 rounded-3xl shadow-lg"
            >
              <div className="flex items-center gap-3 mb-4">
                <Badge variant="critical" className="text-sm px-3 py-1 font-bold">
                  TAKE THIS NOW
                </Badge>
                <span className="text-xl font-bold text-blue-900">
                  Scheduled for {nextDose.timeStr}
                </span>
              </div>

              <div className="mb-6">
                <h2 id="next-due-heading" className="text-3xl sm:text-4xl font-extrabold text-slate-900 mb-2">
                  {nextDose.name}
                </h2>
                {nextDose.strength && (
                  <p className="text-2xl font-bold text-blue-800 mb-2">
                    Strength: {nextDose.strength}
                  </p>
                )}
                <p className="text-xl text-slate-700 bg-white p-4 rounded-xl border border-blue-200">
                  👉 {nextDose.instructions}
                </p>
              </div>

              {/* Web Speech Read Aloud Button */}
              <div className="mb-8">
                <ReadAloudButton
                  textToRead={`Take ${nextDose.name}, strength ${nextDose.strength}. Instruction: ${nextDose.instructions}`}
                  label="Listen to directions"
                  className="w-full text-xl py-4 min-h-[56px] border-2 border-blue-600 bg-white text-blue-800 hover:bg-blue-100 font-bold"
                />
              </div>

              {/* Big 3-Tap Action Buttons (Section 7) */}
              <div className="flex flex-col gap-4">
                <button
                  disabled={submittingAction}
                  onClick={() => handleTakeDose(nextDose.id)}
                  className="w-full py-5 px-6 rounded-2xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-2xl font-black shadow-md focus-visible:ring-4 focus-visible:ring-emerald-400 min-h-[64px] flex items-center justify-center gap-3 active:scale-[0.99] transition-transform"
                >
                  <CheckCircle2 className="w-8 h-8 shrink-0" />
                  <span>I Took This Medicine</span>
                </button>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <button
                    disabled={submittingAction}
                    onClick={() => handleSnoozeDose(nextDose.id)}
                    className="py-4 px-6 rounded-2xl bg-white hover:bg-slate-100 disabled:opacity-50 text-slate-900 text-xl font-bold border-2 border-slate-400 shadow-sm focus-visible:ring-4 focus-visible:ring-slate-400 min-h-[56px] flex items-center justify-center gap-2"
                  >
                    <Clock className="w-6 h-6 text-amber-600 shrink-0" />
                    <span>Remind me in 15 mins</span>
                  </button>

                  <button
                    disabled={submittingAction}
                    onClick={() => setSkipModalDoseId(nextDose.id)}
                    className="py-4 px-6 rounded-2xl bg-white hover:bg-rose-50 disabled:opacity-50 text-rose-800 text-xl font-bold border-2 border-rose-400 shadow-sm focus-visible:ring-4 focus-visible:ring-rose-400 min-h-[56px] flex items-center justify-center gap-2"
                  >
                    <AlertCircle className="w-6 h-6 text-rose-600 shrink-0" />
                    <span>Skip (tell us why)</span>
                  </button>
                </div>
              </div>
            </section>
          ) : (
            <div className="mb-10 p-8 bg-emerald-50 border-2 border-emerald-300 rounded-3xl text-center shadow-sm">
              <CheckCircle2 className="w-12 h-12 text-emerald-600 mx-auto mb-3" />
              <h2 className="text-3xl font-extrabold text-emerald-950 mb-2">All Caught Up!</h2>
              <p className="text-xl text-emerald-800">
                You have taken all scheduled medicines for today. Great job!
              </p>
            </div>
          )}

          {/* Timeline Blocks */}
          <div className="space-y-8">
            {/* Morning */}
            <section aria-labelledby="morning-block">
              <div className="flex items-center gap-3 mb-4 border-b-2 border-slate-300 pb-2">
                <Coffee className="w-7 h-7 text-amber-600" />
                <h3 id="morning-block" className="text-2xl font-bold text-slate-900">
                  Morning (Breakfast)
                </h3>
              </div>
              <div className="space-y-4">
                {doses
                  .filter((d) => d.block === 'MORNING')
                  .map((dose) => (
                    <DoseCard
                      key={dose.id}
                      dose={dose}
                      onTake={() => handleTakeDose(dose.id)}
                      onSnooze={() => handleSnoozeDose(dose.id)}
                      onSkip={() => setSkipModalDoseId(dose.id)}
                    />
                  ))}
                {doses.filter((d) => d.block === 'MORNING').length === 0 && (
                  <p className="text-slate-500 italic text-lg">No morning medicines scheduled.</p>
                )}
              </div>
            </section>

            {/* Afternoon */}
            <section aria-labelledby="afternoon-block">
              <div className="flex items-center gap-3 mb-4 border-b-2 border-slate-300 pb-2">
                <Sun className="w-7 h-7 text-amber-500" />
                <h3 id="afternoon-block" className="text-2xl font-bold text-slate-900">
                  Afternoon (Lunch)
                </h3>
              </div>
              <div className="space-y-4">
                {doses
                  .filter((d) => d.block === 'AFTERNOON')
                  .map((dose) => (
                    <DoseCard
                      key={dose.id}
                      dose={dose}
                      onTake={() => handleTakeDose(dose.id)}
                      onSnooze={() => handleSnoozeDose(dose.id)}
                      onSkip={() => setSkipModalDoseId(dose.id)}
                    />
                  ))}
                {doses.filter((d) => d.block === 'AFTERNOON').length === 0 && (
                  <p className="text-slate-500 italic text-lg">No afternoon medicines scheduled.</p>
                )}
              </div>
            </section>

            {/* Evening */}
            <section aria-labelledby="evening-block">
              <div className="flex items-center gap-3 mb-4 border-b-2 border-slate-300 pb-2">
                <Sunset className="w-7 h-7 text-orange-600" />
                <h3 id="evening-block" className="text-2xl font-bold text-slate-900">
                  Evening (Dinner)
                </h3>
              </div>
              <div className="space-y-4">
                {doses
                  .filter((d) => d.block === 'EVENING')
                  .map((dose) => (
                    <DoseCard
                      key={dose.id}
                      dose={dose}
                      onTake={() => handleTakeDose(dose.id)}
                      onSnooze={() => handleSnoozeDose(dose.id)}
                      onSkip={() => setSkipModalDoseId(dose.id)}
                    />
                  ))}
                {doses.filter((d) => d.block === 'EVENING').length === 0 && (
                  <p className="text-slate-500 italic text-lg">No evening medicines scheduled.</p>
                )}
              </div>
            </section>

            {/* Bedtime */}
            <section aria-labelledby="bedtime-block">
              <div className="flex items-center gap-3 mb-4 border-b-2 border-slate-300 pb-2">
                <Moon className="w-7 h-7 text-indigo-600" />
                <h3 id="bedtime-block" className="text-2xl font-bold text-slate-900">
                  Bedtime
                </h3>
              </div>
              <div className="space-y-4">
                {doses
                  .filter((d) => d.block === 'BEDTIME')
                  .map((dose) => (
                    <DoseCard
                      key={dose.id}
                      dose={dose}
                      onTake={() => handleTakeDose(dose.id)}
                      onSnooze={() => handleSnoozeDose(dose.id)}
                      onSkip={() => setSkipModalDoseId(dose.id)}
                    />
                  ))}
                {doses.filter((d) => d.block === 'BEDTIME').length === 0 && (
                  <p className="text-slate-500 italic text-lg">No bedtime medicines scheduled.</p>
                )}
              </div>
            </section>
          </div>
        </>
      )}

      {/* Skip Confirmation Dialog */}
      {skipModalDoseId && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="skip-dialog-title"
          className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4"
        >
          <div className="bg-white rounded-3xl max-w-lg w-full p-8 border-4 border-slate-400 shadow-2xl">
            <h3 id="skip-dialog-title" className="text-2xl font-extrabold text-slate-900 mb-4">
              Why are you skipping this medicine?
            </h3>
            <p className="text-lg text-slate-600 mb-4">
              Please choose a reason so your family and doctor understand:
            </p>

            <div className="space-y-3 mb-6">
              {[
                'Doctor advised to pause it',
                'Feeling sick or upset stomach',
                'Medicine is out of stock',
                'Side effects or allergic reaction',
                'Other reason',
              ].map((reason) => (
                <button
                  key={reason}
                  onClick={() => setSkipReason(reason)}
                  className={`w-full text-left p-4 rounded-xl border-2 font-bold text-lg min-h-[52px] ${
                    skipReason === reason
                      ? 'border-blue-600 bg-blue-50 text-blue-900'
                      : 'border-slate-300 bg-white hover:bg-slate-50'
                  }`}
                >
                  {reason}
                </button>
              ))}
            </div>

            <div className="flex gap-4">
              <button
                onClick={() => {
                  setSkipModalDoseId(null);
                  setSkipReason('');
                }}
                className="flex-1 py-4 px-6 rounded-xl border-2 border-slate-300 font-bold text-lg min-h-[52px] hover:bg-slate-100"
              >
                Go Back
              </button>
              <button
                onClick={handleConfirmSkip}
                disabled={!skipReason || submittingAction}
                className="flex-1 py-4 px-6 rounded-xl bg-rose-600 hover:bg-rose-700 disabled:opacity-50 text-white font-bold text-lg min-h-[52px]"
              >
                Confirm Skip
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Passcode Exit Gate Modal */}
      {exitModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="exit-modal-title"
          className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4"
        >
          <div className="bg-white rounded-3xl max-w-md w-full p-8 border-4 border-slate-300 shadow-2xl">
            <div className="flex items-center gap-3 mb-4">
              <Lock className="w-8 h-8 text-blue-600" />
              <h3 id="exit-modal-title" className="text-2xl font-extrabold text-slate-900">
                Caregiver Passcode
              </h3>
            </div>
            <p className="text-base text-slate-600 mb-6">
              To prevent accidental changes, enter your 4-6 digit passcode to switch to the Caregiver Dashboard.
            </p>

            <form onSubmit={handleVerifyPasscodeAndExit} className="space-y-4">
              <div>
                <label htmlFor="exit-passcode" className="sr-only">Passcode</label>
                <input
                  id="exit-passcode"
                  type="password"
                  inputMode="numeric"
                  maxLength={6}
                  placeholder="Enter 4-6 digit PIN"
                  value={passcode}
                  onChange={(e) => setPasscode(e.target.value.replace(/\D/g, ''))}
                  className="w-full p-4 text-center text-3xl tracking-widest font-mono border-2 border-slate-300 rounded-2xl focus:border-blue-600 focus:outline-none"
                  autoFocus
                />
              </div>

              {passcodeError && (
                <div role="alert" aria-live="assertive" className="text-rose-600 font-bold text-sm">
                  {passcodeError}
                </div>
              )}

              <div className="flex gap-4 pt-2">
                <button
                  type="button"
                  onClick={() => setExitModalOpen(false)}
                  className="flex-1 py-3.5 px-4 rounded-xl border-2 border-slate-300 font-bold text-base hover:bg-slate-100"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={verifyingPasscode || passcode.length < 4}
                  className="flex-1 py-3.5 px-4 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-bold text-base shadow-sm"
                >
                  {verifyingPasscode ? 'Verifying...' : 'Unlock'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

function DoseCard({
  dose,
  onTake,
  onSnooze,
  onSkip,
}: {
  dose: DoseItem;
  onTake: () => void;
  onSnooze: () => void;
  onSkip: () => void;
}) {
  const isTaken = dose.status === 'TAKEN' || dose.status === 'LATE_TAKEN';
  const isSkipped = dose.status === 'SKIPPED';
  const isMissed = dose.status === 'MISSED';

  return (
    <div
      className={`p-5 rounded-2xl border-2 transition-all ${
        isTaken
          ? 'bg-emerald-50 border-emerald-300 opacity-90'
          : isSkipped
          ? 'bg-slate-100 border-slate-300 opacity-75'
          : isMissed
          ? 'bg-rose-50 border-rose-300'
          : 'bg-white border-slate-300 hover:border-slate-400'
      }`}
    >
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <span className="text-xl font-extrabold text-slate-900">{dose.name}</span>
            {dose.strength && (
              <span className="text-lg font-bold text-blue-700 bg-blue-100 px-2.5 py-0.5 rounded-md">
                {dose.strength}
              </span>
            )}
          </div>
          <p className="text-base text-slate-600 mb-1">{dose.instructions}</p>
          <p className="text-sm font-semibold text-slate-500">Scheduled: {dose.timeStr}</p>
        </div>

        <div className="flex items-center gap-3">
          {isTaken ? (
            <div className="flex items-center gap-2 text-emerald-800 font-bold text-lg bg-emerald-100 px-4 py-2 rounded-xl border border-emerald-300">
              <CheckCircle2 className="w-6 h-6" />
              <span>Taken</span>
            </div>
          ) : isSkipped ? (
            <div className="flex items-center gap-2 text-slate-700 font-bold text-lg bg-slate-200 px-4 py-2 rounded-xl">
              <AlertCircle className="w-6 h-6" />
              <span>Skipped</span>
            </div>
          ) : isMissed ? (
            <div className="flex items-center gap-2 text-rose-700 font-bold text-lg bg-rose-100 px-4 py-2 rounded-xl">
              <AlertCircle className="w-6 h-6" />
              <span>Missed</span>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <button
                onClick={onTake}
                className="py-3 px-5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-lg min-h-[48px] shadow-sm active:scale-95 transition-transform"
              >
                Take Now
              </button>
              <button
                onClick={onSnooze}
                className="p-3 rounded-xl border-2 border-slate-300 hover:bg-slate-100 text-slate-700 min-h-[48px]"
                aria-label="Snooze this medicine"
              >
                <Clock className="w-5 h-5 text-amber-600" />
              </button>
              <button
                onClick={onSkip}
                className="p-3 rounded-xl border-2 border-rose-300 hover:bg-rose-50 text-rose-700 min-h-[48px]"
                aria-label="Skip this medicine"
              >
                <AlertCircle className="w-5 h-5 text-rose-600" />
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
