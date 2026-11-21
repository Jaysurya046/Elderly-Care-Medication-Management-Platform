'use client';

import * as React from 'react';
import {
  CheckCircle2,
  Clock,
  Volume2,
  VolumeX,
  Sun,
  Sunset,
  Moon,
  Coffee,
  AlertCircle,
  HelpCircle,
  Settings2,
} from 'lucide-react';
import { Button, Badge, ReadAloudButton } from '@elder-care/ui';

interface DoseItem {
  id: string;
  name: string;
  strength: string;
  instructions: string;
  timeStr: string;
  block: 'MORNING' | 'AFTERNOON' | 'EVENING' | 'BEDTIME';
  status: 'PENDING' | 'TAKEN' | 'SNOOZED' | 'SKIPPED' | 'MISSED';
  isNextDue?: boolean;
}

const INITIAL_DOSES: DoseItem[] = [
  {
    id: 'dose-1',
    name: 'Telmisartan',
    strength: '40 mg',
    instructions: 'Take in the morning with a full glass of water',
    timeStr: '8:00 AM',
    block: 'MORNING',
    status: 'PENDING',
    isNextDue: true,
  },
  {
    id: 'dose-2',
    name: 'Metformin',
    strength: '500 mg',
    instructions: 'Take after your breakfast',
    timeStr: '8:30 AM',
    block: 'MORNING',
    status: 'PENDING',
  },
  {
    id: 'dose-3',
    name: 'Shelcal 500 (Calcium)',
    strength: '500 mg',
    instructions: 'Take right after lunch',
    timeStr: '1:00 PM',
    block: 'AFTERNOON',
    status: 'PENDING',
  },
  {
    id: 'dose-4',
    name: 'Metformin',
    strength: '500 mg',
    instructions: 'Take with your evening dinner',
    timeStr: '8:00 PM',
    block: 'EVENING',
    status: 'PENDING',
  },
];

export default function SeniorModePage() {
  const [doses, setDoses] = React.useState<DoseItem[]>(INITIAL_DOSES);
  const [textSize, setTextSize] = React.useState<'normal' | 'large' | 'xlarge'>('normal');
  const [highContrast, setHighContrast] = React.useState(false);
  const [skipModalDoseId, setSkipModalDoseId] = React.useState<string | null>(null);
  const [skipReason, setSkipReason] = React.useState('');
  const [statusMessage, setStatusMessage] = React.useState('');

  // Handle High Contrast mode toggle
  React.useEffect(() => {
    if (highContrast) {
      document.body.classList.add('high-contrast');
    } else {
      document.body.classList.remove('high-contrast');
    }
  }, [highContrast]);

  // Handle Text Size scaling
  React.useEffect(() => {
    document.body.classList.remove('text-large', 'text-xlarge');
    if (textSize === 'large') document.body.classList.add('text-large');
    if (textSize === 'xlarge') document.body.classList.add('text-xlarge');
  }, [textSize]);

  const handleTakeDose = (id: string) => {
    setDoses((prev) =>
      prev.map((d) => (d.id === id ? { ...d, status: 'TAKEN', isNextDue: false } : d))
    );
    setStatusMessage('Good job! Medicine marked as taken.');
  };

  const handleSnoozeDose = (id: string) => {
    setDoses((prev) =>
      prev.map((d) => (d.id === id ? { ...d, status: 'SNOOZED', isNextDue: false } : d))
    );
    setStatusMessage('Reminder set. We will remind you again in 15 minutes.');
  };

  const handleConfirmSkip = () => {
    if (!skipModalDoseId || !skipReason.trim()) return;
    setDoses((prev) =>
      prev.map((d) =>
        d.id === skipModalDoseId ? { ...d, status: 'SKIPPED', isNextDue: false } : d
      )
    );
    setStatusMessage('Medicine marked as skipped. Caregiver has been notified.');
    setSkipModalDoseId(null);
    setSkipReason('');
  };

  // Find next pending dose
  const nextDose = doses.find((d) => d.status === 'PENDING' || d.status === 'SNOOZED');

  return (
    <div className="max-w-3xl mx-auto px-4 py-8 text-slate-900">
      {/* Accessibility Controls Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-4 p-4 mb-8 bg-white rounded-2xl border-2 border-slate-300 shadow-sm">
        <div className="flex items-center gap-2">
          <Settings2 className="w-6 h-6 text-slate-700" />
          <span className="font-bold text-lg">Display Settings:</span>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {/* Text Size Controls */}
          <div className="inline-flex rounded-lg border-2 border-slate-300 p-1 bg-slate-100">
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
        </div>
      </div>

      {/* Screen Reader Live Status Region */}
      <div
        aria-live="polite"
        className="sr-only"
        role="status"
      >
        {statusMessage}
      </div>

      {/* Header */}
      <header className="mb-8">
        <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight mb-2">
          Today&apos;s Medicines
        </h1>
        <p className="text-xl text-slate-600">
          Hello Kamala. Here are your medicines for today.
        </p>
      </header>

      {/* Next Dose Due (Highlighted First with Large 60px Buttons) */}
      {nextDose && (
        <section
          aria-labelledby="next-due-heading"
          className="mb-10 p-6 sm:p-8 bg-blue-50 border-4 border-blue-600 rounded-3xl shadow-lg"
        >
          <div className="flex items-center gap-3 mb-4">
            <Badge variant="critical" className="text-sm px-3 py-1">
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
            <p className="text-2xl font-bold text-blue-800 mb-2">
              Strength: {nextDose.strength}
            </p>
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

          {/* Big Action Buttons (Min 48px, Section 7) */}
          <div className="flex flex-col gap-4">
            <button
              onClick={() => handleTakeDose(nextDose.id)}
              className="w-full py-5 px-6 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white text-2xl font-black shadow-md focus-visible:ring-4 focus-visible:ring-emerald-400 min-h-[64px] flex items-center justify-center gap-3 active:scale-[0.99] transition-transform"
            >
              <CheckCircle2 className="w-8 h-8 shrink-0" />
              <span>I Took This Medicine</span>
            </button>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <button
                onClick={() => handleSnoozeDose(nextDose.id)}
                className="py-4 px-6 rounded-2xl bg-white hover:bg-slate-100 text-slate-900 text-xl font-bold border-2 border-slate-400 shadow-sm focus-visible:ring-4 focus-visible:ring-slate-400 min-h-[56px] flex items-center justify-center gap-2"
              >
                <Clock className="w-6 h-6 text-amber-600 shrink-0" />
                <span>Remind me in 15 mins</span>
              </button>

              <button
                onClick={() => setSkipModalDoseId(nextDose.id)}
                className="py-4 px-6 rounded-2xl bg-white hover:bg-rose-50 text-rose-800 text-xl font-bold border-2 border-rose-400 shadow-sm focus-visible:ring-4 focus-visible:ring-rose-400 min-h-[56px] flex items-center justify-center gap-2"
              >
                <AlertCircle className="w-6 h-6 text-rose-600 shrink-0" />
                <span>Skip (tell us why)</span>
              </button>
            </div>
          </div>
        </section>
      )}

      {/* Timeline Blocks: Morning, Afternoon, Evening, Bedtime */}
      <div className="space-y-8">
        {/* Morning Block */}
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
          </div>
        </section>

        {/* Afternoon Block */}
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
          </div>
        </section>

        {/* Evening Block */}
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
          </div>
        </section>
      </div>

      {/* Skip Confirmation Dialog (Plain Language Requirement, Section 7) */}
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
                onClick={() => setSkipModalDoseId(null)}
                className="flex-1 py-4 px-6 rounded-xl border-2 border-slate-300 font-bold text-lg min-h-[52px] hover:bg-slate-100"
              >
                Go Back
              </button>
              <button
                onClick={handleConfirmSkip}
                disabled={!skipReason}
                className="flex-1 py-4 px-6 rounded-xl bg-rose-600 hover:bg-rose-700 disabled:opacity-50 text-white font-bold text-lg min-h-[52px]"
              >
                Confirm Skip
              </button>
            </div>
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
  const isCompleted = dose.status === 'TAKEN';
  const isSkipped = dose.status === 'SKIPPED';

  return (
    <div
      className={`p-5 rounded-2xl border-2 transition-all ${
        isCompleted
          ? 'bg-emerald-50 border-emerald-300 opacity-90'
          : isSkipped
          ? 'bg-slate-100 border-slate-300 opacity-75'
          : 'bg-white border-slate-300 hover:border-slate-400'
      }`}
    >
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <span className="text-xl font-extrabold text-slate-900">{dose.name}</span>
            <span className="text-lg font-bold text-blue-700 bg-blue-100 px-2.5 py-0.5 rounded-md">
              {dose.strength}
            </span>
          </div>
          <p className="text-base text-slate-600 mb-1">{dose.instructions}</p>
          <p className="text-sm font-semibold text-slate-500">Scheduled: {dose.timeStr}</p>
        </div>

        <div className="flex items-center gap-3">
          {isCompleted ? (
            <div className="flex items-center gap-2 text-emerald-800 font-bold text-lg bg-emerald-100 px-4 py-2 rounded-xl border border-emerald-300">
              <CheckCircle2 className="w-6 h-6" />
              <span>Taken</span>
            </div>
          ) : isSkipped ? (
            <div className="flex items-center gap-2 text-slate-700 font-bold text-lg bg-slate-200 px-4 py-2 rounded-xl">
              <AlertCircle className="w-6 h-6" />
              <span>Skipped</span>
            </div>
          ) : (
            <button
              onClick={onTake}
              className="py-3 px-6 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-lg min-h-[48px] shadow-sm active:scale-95 transition-transform"
            >
              Take Now
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
