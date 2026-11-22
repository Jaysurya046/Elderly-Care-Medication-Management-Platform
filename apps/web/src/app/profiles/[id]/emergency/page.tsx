import * as React from 'react';
import { prisma, Role } from '@elder-care/db';
import { getCurrentUser } from '@/lib/session';
import { recordAuditLog } from '@/lib/audit';
import { AlertTriangle, Phone, MapPin, Heart, Shield } from 'lucide-react';
import { PrintButton } from './print-button';

interface EmergencyCardPageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ code?: string }>;
}

export default async function EmergencyCardPage({ params, searchParams }: EmergencyCardPageProps) {
  const { id } = await params;
  const { code } = await searchParams;

  const currentUser = await getCurrentUser();

  // Verify access:
  // Option A: Active signed-in member with view_medications scope or OWNER/CAREGIVER
  let hasAccess = false;
  let actorUserId: string | null = null;
  let actorMembershipId: string | null = null;

  if (currentUser) {
    const membership = await prisma.membership.findFirst({
      where: {
        profileId: id,
        userId: currentUser.id,
        status: 'ACTIVE',
      },
    });

    if (membership) {
      const isOwnerOrCaregiver = membership.role === Role.OWNER || membership.role === Role.CAREGIVER;
      const scopes = (membership.scopes as any) || {};
      const hasViewMedScope = Array.isArray(scopes)
        ? scopes.includes('view_medications')
        : Boolean(scopes.view_medications);

      if (isOwnerOrCaregiver || hasViewMedScope) {
        hasAccess = true;
        actorUserId = currentUser.id;
        actorMembershipId = membership.id;
      }
    }
  }

  // Option B: Valid emergency code
  if (!hasAccess && code) {
    const targetProfile = await prisma.careProfile.findUnique({
      where: { id },
      select: { emergencyCode: true },
    });

    if (
      targetProfile?.emergencyCode &&
      targetProfile.emergencyCode.trim().toUpperCase() === code.trim().toUpperCase()
    ) {
      hasAccess = true;
    }
  }

  // Access denied: render generic error without exposing ANY PHI
  if (!hasAccess) {
    return (
      <div className="max-w-md mx-auto px-4 py-16 text-center">
        <div className="p-8 bg-white rounded-3xl border-2 border-slate-200 shadow-lg">
          <div className="w-16 h-16 bg-rose-100 text-rose-600 rounded-full flex items-center justify-center mx-auto mb-4">
            <AlertTriangle className="w-8 h-8" />
          </div>
          <h1 className="text-2xl font-black text-slate-900 mb-2">Access Denied</h1>
          <p className="text-slate-600 mb-6 text-sm">
            Access to this emergency medical profile is protected. Please provide a valid emergency code or sign in with an authorized care circle account.
          </p>
          <form method="GET" action={`/profiles/${id}/emergency`} className="space-y-4">
            <div>
              <label htmlFor="code" className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1 text-left">
                Emergency Code
              </label>
              <input
                type="text"
                id="code"
                name="code"
                placeholder="Enter 8-digit Emergency Code"
                className="w-full px-4 py-3 border border-slate-300 rounded-xl font-mono text-center tracking-widest text-lg uppercase focus:ring-2 focus:ring-rose-500 focus:outline-none"
                required
              />
            </div>
            <button
              type="submit"
              className="w-full py-3 bg-rose-600 hover:bg-rose-700 text-white font-bold rounded-xl text-base shadow-sm transition-colors"
            >
              Verify & View Card
            </button>
          </form>
        </div>
      </div>
    );
  }

  // Record mandatory Section 8 audit log
  await recordAuditLog({
    profileId: id,
    actorUserId,
    actorMembershipId,
    action: 'EMERGENCY_CARD:VIEW',
    entityType: 'CareProfile',
    entityId: id,
    metadata: { accessMethod: currentUser ? 'AUTHENTICATED_SESSION' : 'EMERGENCY_CODE' },
  });

  // Query real data from database
  const profile = await prisma.careProfile.findUnique({
    where: { id },
  });

  if (!profile) {
    return (
      <div className="max-w-md mx-auto px-4 py-16 text-center">
        <h1 className="text-2xl font-black text-slate-900">Record Not Found</h1>
      </div>
    );
  }

  const [emergencyContacts, medications] = await Promise.all([
    prisma.emergencyContact.findMany({
      where: { profileId: id },
      orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }],
    }),
    prisma.medication.findMany({
      where: { profileId: id, isActive: true },
      include: { schedules: true },
      orderBy: [{ criticality: 'desc' }, { name: 'asc' }],
    }),
  ]);

  const birthDate = profile.dateOfBirth ? new Date(profile.dateOfBirth) : null;
  const age = birthDate
    ? Math.floor((Date.now() - birthDate.getTime()) / (365.25 * 24 * 60 * 60 * 1000))
    : null;

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
        <PrintButton />
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
            <h1 className="text-4xl font-black text-slate-900">{profile.displayName}</h1>
            {birthDate && (
              <p className="text-lg font-bold text-slate-600 mt-1">
                Date of Birth: {birthDate.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })}
                {age !== null && ` (Age: ${age})`}
              </p>
            )}
          </div>
          <div className="text-right sm:border-l-4 sm:border-rose-200 sm:pl-6">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
              Blood Group
            </span>
            <div className="text-4xl font-black text-rose-600">{profile.bloodType || 'NOT SPECIFIED'}</div>
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
              {profile.allergies || 'No documented allergies'}
            </p>
          </div>

          <div className="bg-amber-50 border-2 border-amber-300 rounded-2xl p-5">
            <span className="text-sm font-extrabold text-amber-800 uppercase tracking-wide flex items-center gap-2">
              <Heart className="w-4 h-4" />
              CHRONIC CONDITIONS
            </span>
            <p className="text-xl font-bold text-amber-950 mt-2">
              {profile.conditions || 'None reported'}
            </p>
          </div>
        </div>

        {/* Current Medications Table */}
        <div className="mb-8">
          <h2 className="text-2xl font-black text-slate-900 border-b-2 border-slate-300 pb-2 mb-4">
            Active Medications
          </h2>
          {medications.length === 0 ? (
            <p className="text-slate-500 italic">No active medications registered.</p>
          ) : (
            <div className="space-y-3">
              {medications.map((med) => {
                const timings = med.schedules
                  .flatMap((s) => (Array.isArray(s.timesOfDay) ? (s.timesOfDay as string[]) : []))
                  .join(', ');
                return (
                  <div
                    key={med.id}
                    className={`p-4 rounded-xl border-2 flex items-center justify-between ${
                      med.criticality === 'CRITICAL'
                        ? 'border-rose-300 bg-rose-50/50'
                        : 'border-slate-200 bg-slate-50'
                    }`}
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-xl font-black text-slate-900">
                          {med.name} {med.strength}
                        </span>
                        {med.criticality === 'CRITICAL' && (
                          <span className="px-2 py-0.5 rounded text-xs font-black bg-rose-600 text-white uppercase">
                            Critical
                          </span>
                        )}
                      </div>
                      <p className="text-base text-slate-600">
                        {timings ? `Schedule: ${timings}` : med.instructions || 'Daily'} • {med.form}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Emergency Contacts & Hospital */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 border-t-2 border-slate-300 pt-6">
          <div>
            <h3 className="text-lg font-bold text-slate-900 mb-2 flex items-center gap-2">
              <Phone className="w-5 h-5 text-blue-600" />
              Emergency Caregiver Contacts
            </h3>
            {emergencyContacts.length === 0 ? (
              <p className="text-slate-500 italic">No emergency contacts registered.</p>
            ) : (
              <div className="space-y-3">
                {emergencyContacts.map((contact) => (
                  <div key={contact.id}>
                    <p className="text-xl font-black text-slate-900">
                      {contact.name} ({contact.relationship})
                      {contact.isPrimary && (
                        <span className="ml-2 text-xs font-bold px-2 py-0.5 bg-blue-100 text-blue-700 rounded-full">
                          Primary
                        </span>
                      )}
                    </p>
                    <p className="text-lg font-bold text-blue-800">{contact.phoneNumber}</p>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div>
            <h3 className="text-lg font-bold text-slate-900 mb-2 flex items-center gap-2">
              <MapPin className="w-5 h-5 text-rose-600" />
              Doctor & Hospital
            </h3>
            <p className="text-lg font-black text-slate-900">
              {profile.primaryDoctorName || 'Not specified'}
            </p>
            <p className="text-base font-bold text-slate-700">
              {profile.preferredHospital || 'Not specified'}
            </p>
          </div>
        </div>

        {/* Footer with Verification Code */}
        <div className="mt-8 pt-4 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between text-xs text-slate-500 gap-2">
          <span>Digital Record ID: {profile.id.slice(0, 8)} • Access verified by Elder Care Security</span>
          <span>Printed from eldercare.local • Subject to immediate profile revocation</span>
        </div>
      </div>
    </div>
  );
}
