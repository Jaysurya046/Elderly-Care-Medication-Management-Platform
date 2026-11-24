'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Users,
  Pill,
  Calendar,
  FileText,
  Activity,
  ShieldAlert,
  Plus,
  Flame,
  CheckCircle,
  AlertTriangle,
  Clock,
  Printer,
  Edit2,
  Trash2,
  Lock,
  RefreshCw,
  Check,
  X,
} from 'lucide-react';
import { Badge, Button } from '@elder-care/ui';
import { calculateAdherence, isLowStock, calculateDaysOfSupply } from '@elder-care/core';

export default function CareCircleDashboardPage() {
  const router = useRouter();

  const [activeTab, setActiveTab] = React.useState<
    'overview' | 'medications' | 'appointments' | 'notes' | 'circle' | 'audit'
  >('overview');

  // Active Profile & Session State
  const [profile, setProfile] = React.useState<any>(null);
  const [profileId, setProfileId] = React.useState<string | null>(null);
  const [userRole, setUserRole] = React.useState<string>('CAREGIVER');
  const [userScopes, setUserScopes] = React.useState<string[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [statusMessage, setStatusMessage] = React.useState('');
  const [errorMessage, setErrorMessage] = React.useState('');

  // Domain Collections State
  const [medications, setMedications] = React.useState<any[]>([]);
  const [appointments, setAppointments] = React.useState<any[]>([]);
  const [careNotes, setCareNotes] = React.useState<any[]>([]);
  const [members, setMembers] = React.useState<any[]>([]);
  const [activities, setActivities] = React.useState<any[]>([]);
  const [doses, setDoses] = React.useState<any[]>([]);

  // Modals State
  const [addMedModalOpen, setAddMedModalOpen] = React.useState(false);
  const [stockModalMed, setStockModalMed] = React.useState<any | null>(null);
  const [newStockCount, setNewStockCount] = React.useState<number>(0);
  const [addApptModalOpen, setAddApptModalOpen] = React.useState(false);
  const [addNoteModalOpen, setAddNoteModalOpen] = React.useState(false);
  const [inviteModalOpen, setInviteModalOpen] = React.useState(false);

  // Form Submitting & Field Errors
  const [formSubmitting, setFormSubmitting] = React.useState(false);
  const [formErrors, setFormErrors] = React.useState<Record<string, string>>({});

  // Medication Form State
  const [medForm, setMedForm] = React.useState({
    name: '',
    genericName: '',
    strength: '500 mg',
    form: 'Tablet',
    criticality: 'STANDARD',
    instructions: 'Take with food and water',
    stockCount: 30,
    refillThreshold: 7,
    timesOfDay: '08:00, 20:00',
    startDate: new Date().toISOString().slice(0, 10),
  });

  // Appointment Form State
  const [apptForm, setApptForm] = React.useState({
    title: '',
    doctorName: '',
    clinicName: '',
    scheduledAt: '',
    travelMinutes: 30,
    isPrivate: false,
    questionsToAsk: '',
  });

  // Note Form State
  const [noteForm, setNoteForm] = React.useState({
    body: '',
    isPrivate: false,
  });

  // Invite Form State
  const [inviteForm, setInviteForm] = React.useState({
    email: '',
    role: 'CAREGIVER',
    scopeManageMeds: true,
    scopeViewMeds: true,
    scopeManageAppts: true,
    scopeViewAppts: true,
    scopeWriteNotes: true,
    scopeViewNotes: true,
    scopeViewPrivate: false,
  });

  // Initial Fetch: Profile & Session
  const loadProfile = React.useCallback(async () => {
    try {
      setLoading(true);
      const meRes = await fetch('/api/auth/me');
      if (!meRes.ok) {
        if (meRes.status === 401) {
          router.push('/login?redirect=/dashboard');
          return;
        }
        throw new Error('Failed to load authenticated user.');
      }

      const meData = await meRes.json();
      const firstMembership = meData.memberships?.[0];
      const activeProfile = firstMembership?.profile || firstMembership?.careProfile;
      if (!firstMembership || !activeProfile) {
        setErrorMessage('No active care profile found.');
        setLoading(false);
        return;
      }

      const activeId = activeProfile.id;
      setProfileId(activeId);

      // Fetch profile details & members
      const profRes = await fetch(`/api/profiles/${activeId}`);
      if (profRes.ok) {
        const profData = await profRes.json();
        setProfile(profData.data.profile);
        setUserRole(profData.data.userRole);
        setUserScopes(profData.data.scopes || []);
        setMembers(profData.data.members || []);
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Error loading dashboard.');
    } finally {
      setLoading(false);
    }
  }, [router]);

  // Load Tab Specific Collections
  const loadCollections = React.useCallback(async (pId: string) => {
    try {
      const [medsRes, apptsRes, notesRes, actRes, dosesRes] = await Promise.all([
        fetch(`/api/profiles/${pId}/medications`),
        fetch(`/api/profiles/${pId}/appointments`),
        fetch(`/api/profiles/${pId}/care-notes`),
        fetch(`/api/profiles/${pId}/activity`),
        fetch(`/api/profiles/${pId}/doses`),
      ]);

      if (medsRes.ok) {
        const d = await medsRes.json();
        setMedications(d.data || []);
      }
      if (apptsRes.ok) {
        const d = await apptsRes.json();
        setAppointments(d.data || []);
      }
      if (notesRes.ok) {
        const d = await notesRes.json();
        setCareNotes(d.data || []);
      }
      if (actRes.ok) {
        const d = await actRes.json();
        setActivities(d.data || []);
      }
      if (dosesRes.ok) {
        const d = await dosesRes.json();
        setDoses(d.data || []);
      }
    } catch {
      // ignore collection fetch errors
    }
  }, []);

  React.useEffect(() => {
    loadProfile();
  }, [loadProfile]);

  React.useEffect(() => {
    if (profileId) {
      loadCollections(profileId);
    }
  }, [profileId, loadCollections]);

  // Calculate Real Adherence
  const adherence = React.useMemo(() => {
    if (!doses || doses.length === 0) {
      return { percentage: 100, takenCount: 0, lateTakenCount: 0, missedCount: 0, totalEligibleDoses: 0 };
    }
    return calculateAdherence(
      doses.map((d) => ({
        id: d.id,
        scheduledAt: d.scheduledAt,
        status: d.status,
        skipReason: d.skipReason,
      }))
    );
  }, [doses]);

  // Low Stock Medications
  const lowStockMeds = React.useMemo(() => {
    return medications.filter((m) => isLowStock(m.stockCount, m.refillThreshold));
  }, [medications]);

  // Handle Medication Creation Form Submit
  const handleAddMedication = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profileId) return;

    setFormSubmitting(true);
    setFormErrors({});
    try {
      const times = medForm.timesOfDay.split(',').map((t) => t.trim()).filter(Boolean);
      const res = await fetch(`/api/profiles/${profileId}/medications`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: medForm.name,
          genericName: medForm.genericName || undefined,
          strength: medForm.strength,
          form: medForm.form,
          criticality: medForm.criticality,
          instructions: medForm.instructions || undefined,
          stockCount: Number(medForm.stockCount),
          refillThreshold: Number(medForm.refillThreshold),
          timesOfDay: times.length > 0 ? times : ['08:00'],
          startDate: new Date(medForm.startDate).toISOString(),
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        if (data.details) {
          setFormErrors(data.details);
        } else {
          setFormErrors({ general: data.error || 'Failed to add medication' });
        }
        return;
      }

      setStatusMessage(`Medication ${medForm.name} added successfully.`);
      setAddMedModalOpen(false);
      setMedForm({
        name: '',
        genericName: '',
        strength: '500 mg',
        form: 'Tablet',
        criticality: 'STANDARD',
        instructions: 'Take with food and water',
        stockCount: 30,
        refillThreshold: 7,
        timesOfDay: '08:00, 20:00',
        startDate: new Date().toISOString().slice(0, 10),
      });
      loadCollections(profileId);
    } catch {
      setFormErrors({ general: 'Network error adding medication.' });
    } finally {
      setFormSubmitting(false);
    }
  };

  // Handle Stock Adjustment
  const handleAdjustStock = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profileId || !stockModalMed) return;

    setFormSubmitting(true);
    setFormErrors({});
    try {
      const res = await fetch(`/api/profiles/${profileId}/medications/${stockModalMed.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          stockCount: Number(newStockCount),
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setFormErrors({ general: data.error || 'Failed to update stock.' });
        return;
      }

      setStatusMessage(`Stock for ${stockModalMed.name} updated to ${newStockCount}.`);
      setStockModalMed(null);
      loadCollections(profileId);
    } catch {
      setFormErrors({ general: 'Network error updating stock.' });
    } finally {
      setFormSubmitting(false);
    }
  };

  // Handle Appointment Creation
  const handleAddAppointment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profileId) return;

    setFormSubmitting(true);
    setFormErrors({});
    try {
      const res = await fetch(`/api/profiles/${profileId}/appointments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: apptForm.title,
          doctorName: apptForm.doctorName,
          clinicName: apptForm.clinicName || undefined,
          scheduledAt: apptForm.scheduledAt ? new Date(apptForm.scheduledAt).toISOString() : new Date().toISOString(),
          travelMinutes: Number(apptForm.travelMinutes),
          isPrivate: apptForm.isPrivate,
          questionsToAsk: apptForm.questionsToAsk || undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        if (data.details) {
          setFormErrors(data.details);
        } else {
          setFormErrors({ general: data.error || 'Failed to schedule appointment' });
        }
        return;
      }

      setStatusMessage('Appointment scheduled successfully.');
      setAddApptModalOpen(false);
      setApptForm({
        title: '',
        doctorName: '',
        clinicName: '',
        scheduledAt: '',
        travelMinutes: 30,
        isPrivate: false,
        questionsToAsk: '',
      });
      loadCollections(profileId);
    } catch {
      setFormErrors({ general: 'Network error scheduling appointment.' });
    } finally {
      setFormSubmitting(false);
    }
  };

  // Handle Care Note Creation
  const handleAddNote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profileId) return;

    setFormSubmitting(true);
    setFormErrors({});
    try {
      const res = await fetch(`/api/profiles/${profileId}/care-notes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          body: noteForm.body,
          isPrivate: noteForm.isPrivate,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        if (data.details) {
          setFormErrors(data.details);
        } else {
          setFormErrors({ general: data.error || 'Failed to add care note' });
        }
        return;
      }

      setStatusMessage('Care note added successfully.');
      setAddNoteModalOpen(false);
      setNoteForm({ body: '', isPrivate: false });
      loadCollections(profileId);
    } catch {
      setFormErrors({ general: 'Network error adding note.' });
    } finally {
      setFormSubmitting(false);
    }
  };

  // Handle Care Circle Invitation
  const handleInviteMember = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profileId) return;

    setFormSubmitting(true);
    setFormErrors({});
    try {
      const scopes: Record<string, boolean> = {
        manage_medications: inviteForm.scopeManageMeds,
        view_medications: inviteForm.scopeViewMeds,
        manage_appointments: inviteForm.scopeManageAppts,
        view_appointments: inviteForm.scopeViewAppts,
        write_notes: inviteForm.scopeWriteNotes,
        view_notes: inviteForm.scopeViewNotes,
        view_private_items: inviteForm.scopeViewPrivate,
      };

      const res = await fetch(`/api/profiles/${profileId}/care-circle/invite`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: inviteForm.email,
          role: inviteForm.role,
          scopes,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        if (data.details) {
          setFormErrors(data.details);
        } else {
          setFormErrors({ general: data.error || 'Failed to send invitation' });
        }
        return;
      }

      setStatusMessage(`Invitation sent to ${inviteForm.email}.`);
      setInviteModalOpen(false);
      setInviteForm({
        email: '',
        role: 'CAREGIVER',
        scopeManageMeds: true,
        scopeViewMeds: true,
        scopeManageAppts: true,
        scopeViewAppts: true,
        scopeWriteNotes: true,
        scopeViewNotes: true,
        scopeViewPrivate: false,
      });
      loadProfile();
    } catch {
      setFormErrors({ general: 'Network error sending invitation.' });
    } finally {
      setFormSubmitting(false);
    }
  };

  // Handle Confirm Member
  const handleConfirmMember = async (memberId: string) => {
    if (!profileId) return;
    try {
      const res = await fetch(`/api/profiles/${profileId}/care-circle/confirm`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ membershipId: memberId }),
      });
      if (res.ok) {
        setStatusMessage('Member successfully confirmed.');
        loadProfile();
      }
    } catch {
      // ignore
    }
  };

  // Handle Remove Member
  const handleRemoveMember = async (memberId: string) => {
    if (!profileId) return;
    if (!confirm('Are you sure you want to remove this member from the Care Circle?')) return;

    try {
      const res = await fetch(`/api/profiles/${profileId}/care-circle/${memberId}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        setStatusMessage('Member removed from Care Circle.');
        loadProfile();
      }
    } catch {
      // ignore
    }
  };

  // Handle Cancel Scheduled Deletion
  const handleCancelDeletion = async () => {
    if (!profileId) return;
    try {
      const res = await fetch(`/api/profiles/${profileId}/delete`, {
        method: 'DELETE',
      });
      if (res.ok) {
        setStatusMessage('Scheduled deletion was cancelled. Your profile and records are preserved.');
        setProfile((prev: any) => ({ ...prev, deletionRequestedAt: null }));
      }
    } catch {
      setErrorMessage('Failed to cancel deletion.');
    }
  };

  if (loading) {
    return (
      <div className="max-w-6xl mx-auto px-4 py-16 text-center">
        <RefreshCw className="w-10 h-10 text-blue-600 animate-spin mx-auto mb-4" />
        <p className="text-xl font-bold text-slate-700">Loading Care Circle Dashboard...</p>
      </div>
    );
  }

  const elderDisplayName = profile?.displayName || 'Care Profile';
  const isOwner = userRole === 'OWNER';

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      {/* Screen Reader Live Status Region */}
      <div aria-live="polite" className="sr-only" role="status">
        {statusMessage}
      </div>
      {errorMessage && (
        <div aria-live="assertive" className="sr-only" role="alert">
          {errorMessage}
        </div>
      )}

      {/* Pending Deletion Warning Banner */}
      {profile?.deletionRequestedAt && (
        <div
          role="alert"
          aria-live="assertive"
          className="mb-6 p-4 rounded-2xl bg-rose-600 text-white font-bold shadow-md flex flex-col sm:flex-row sm:items-center justify-between gap-4"
        >
          <div className="flex items-center gap-3">
            <Trash2 className="w-6 h-6 shrink-0" />
            <div>
              <p className="text-lg">
                Permanent Profile Deletion Scheduled for{' '}
                {new Date(new Date(profile.deletionRequestedAt).getTime() + 30 * 24 * 60 * 60 * 1000).toLocaleDateString()}
              </p>
              <p className="text-sm text-rose-100 font-normal">
                You are in the 30-day grace period. You can cancel this request at any time before that date.
              </p>
            </div>
          </div>
          {isOwner && (
            <button
              onClick={handleCancelDeletion}
              className="px-4 py-2 bg-white text-rose-700 font-extrabold rounded-xl hover:bg-rose-50 text-sm shrink-0"
            >
              Cancel Deletion
            </button>
          )}
        </div>
      )}

      {/* Low-Stock Warning Alert Banner */}
      {lowStockMeds.length > 0 && (
        <div
          role="alert"
          aria-live="assertive"
          className="mb-6 p-4 rounded-2xl bg-amber-50 border-2 border-amber-300 text-amber-900 shadow-sm flex items-center justify-between"
        >
          <div className="flex items-center gap-3">
            <AlertTriangle className="w-6 h-6 text-amber-600 shrink-0" />
            <div>
              <span className="font-extrabold text-base">Low Stock Alert: </span>
              <span>
                {lowStockMeds.map((m) => `${m.name} (${m.stockCount} remaining)`).join(', ')}.
                Refill recommended.
              </span>
            </div>
          </div>
          <button
            onClick={() => setActiveTab('medications')}
            className="px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white font-bold text-sm shrink-0"
          >
            View Stock
          </button>
        </div>
      )}

      {/* Profile Header */}
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8 bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <h1 className="text-3xl font-extrabold text-slate-900">{elderDisplayName}</h1>
            <Badge variant="success" className="text-sm">Active Care Circle</Badge>
            <Badge variant={isOwner ? 'critical' : 'outline'} className="text-xs">
              Role: {userRole}
            </Badge>
          </div>
          <p className="text-slate-600 text-base">
            Timezone: {profile?.timezone || 'Asia/Kolkata'} • Doctor: {profile?.primaryDoctorName || 'None assigned'} • Hospital: {profile?.preferredHospital || 'None'}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Link
            href="/senior"
            className="px-4 py-2.5 rounded-xl bg-blue-50 text-blue-700 font-bold border border-blue-200 hover:bg-blue-100 min-h-[48px] flex items-center gap-2"
          >
            Switch to Senior Mode
          </Link>

          {isOwner && profile?.emergencyCode ? (
            <Link
              href={`/profiles/${profileId}/emergency?code=${profile.emergencyCode}`}
              className="px-4 py-2.5 rounded-xl bg-rose-50 text-rose-700 font-bold border border-rose-200 hover:bg-rose-100 min-h-[48px] flex items-center gap-2"
              title={`Emergency Code: ${profile.emergencyCode}`}
            >
              <Printer className="w-5 h-5" />
              <span>Emergency Card ({profile.emergencyCode})</span>
            </Link>
          ) : (
            <span
              className="px-3 py-2 rounded-xl bg-slate-100 text-slate-500 text-xs font-semibold flex items-center gap-1.5"
              title="Emergency code is protected and restricted to the profile OWNER"
            >
              <Lock className="w-4 h-4" />
              Emergency Code Protected (OWNER only)
            </span>
          )}
          <div className="flex items-center gap-2">
            <a
              href={`/api/profiles/${profileId}/export?format=json`}
              download
              className="px-3 py-2 rounded-xl border border-slate-300 hover:bg-slate-50 text-slate-700 text-xs font-bold"
              title="Export complete record as JSON"
            >
              Export JSON
            </a>
            <a
              href={`/api/profiles/${profileId}/export?format=csv`}
              download
              className="px-3 py-2 rounded-xl border border-slate-300 hover:bg-slate-50 text-slate-700 text-xs font-bold"
              title="Export complete record as CSV"
            >
              Export CSV
            </a>
          </div>
        </div>
      </header>

      {/* Navigation Tabs */}
      <nav className="flex flex-wrap gap-2 mb-8 border-b border-slate-200 pb-2" aria-label="Dashboard Tabs">
        {[
          { id: 'overview', label: 'Adherence & Overview', icon: Activity },
          { id: 'medications', label: 'Medicines & Stock', icon: Pill },
          { id: 'appointments', label: 'Appointments', icon: Calendar },
          { id: 'notes', label: 'Care Notes', icon: FileText },
          { id: 'circle', label: 'Care Circle', icon: Users },
          { id: 'audit', label: 'Audit Trail', icon: ShieldAlert },
        ].map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`flex items-center gap-2 px-5 py-3 rounded-xl font-bold text-base transition-colors min-h-[48px] ${
                isActive
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
              }`}
            >
              <Icon className="w-5 h-5" />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </nav>

      {/* Tab 1: Overview & Adherence */}
      {activeTab === 'overview' && (
        <div className="space-y-8">
          {/* Key Metrics Row */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
            <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
              <span className="text-slate-500 font-semibold text-sm">Overall Adherence Rate</span>
              <div className="flex items-baseline gap-2 mt-2">
                <span className={`text-4xl font-extrabold ${adherence.percentage >= 85 ? 'text-emerald-600' : 'text-amber-600'}`}>
                  {adherence.percentage}%
                </span>
                <span className="text-slate-500 text-sm">Target: &gt;90%</span>
              </div>
              <p className="text-slate-600 text-xs mt-3">
                {adherence.takenCount + adherence.lateTakenCount} of {adherence.totalEligibleDoses} eligible doses recorded
              </p>
            </div>

            <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
              <span className="text-slate-500 font-semibold text-sm">Missed / Skipped Doses</span>
              <div className="flex items-baseline gap-2 mt-2">
                <span className="text-4xl font-extrabold text-blue-600">{adherence.missedCount}</span>
                <span className="text-slate-500 text-sm">Missed</span>
              </div>
              <p className="text-slate-600 text-xs mt-3">
                Formula: (Taken + Late) / Eligible Scheduled
              </p>
            </div>

            <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
              <span className="text-slate-500 font-semibold text-sm">Inventory Status</span>
              <div className="flex items-center gap-2 mt-2">
                {lowStockMeds.length > 0 ? (
                  <>
                    <AlertTriangle className="w-8 h-8 text-amber-500" />
                    <span className="text-3xl font-extrabold text-amber-600">{lowStockMeds.length} Low</span>
                  </>
                ) : (
                  <>
                    <CheckCircle className="w-8 h-8 text-emerald-500" />
                    <span className="text-3xl font-extrabold text-emerald-600">Stock Good</span>
                  </>
                )}
              </div>
              <p className="text-slate-600 text-xs mt-3">{medications.length} active prescriptions tracked</p>
            </div>
          </div>

          {/* Activity Timeline */}
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
            <h3 className="text-xl font-bold text-slate-900 mb-4">Recent Care Events</h3>
            {activities.length === 0 ? (
              <p className="text-slate-500 italic">No recent activity recorded.</p>
            ) : (
              <div className="divide-y divide-slate-100">
                {activities.slice(0, 10).map((act, i) => (
                  <div key={i} className="py-3 flex items-start gap-4">
                    <Activity className="w-5 h-5 mt-1 text-blue-600 shrink-0" />
                    <div className="flex-1">
                      <p className="font-bold text-slate-900 text-base">{act.title || act.action}</p>
                      <p className="text-sm text-slate-500">
                        {act.actorName || 'System'} • {new Date(act.timestamp || act.createdAt).toLocaleString()}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Tab 2: Medicines & Stock */}
      {activeTab === 'medications' && (
        <div className="space-y-6">
          <div className="flex justify-between items-center">
            <h2 className="text-2xl font-bold text-slate-900">Current Medications</h2>
            <Button
              onClick={() => {
                setFormErrors({});
                setAddMedModalOpen(true);
              }}
              className="gap-2"
            >
              <Plus className="w-5 h-5" />
              Add Prescription
            </Button>
          </div>

          {medications.length === 0 ? (
            <div className="p-8 text-center bg-white rounded-2xl border border-slate-200">
              <Pill className="w-12 h-12 text-slate-400 mx-auto mb-2" />
              <p className="text-lg font-bold text-slate-700">No active medications yet.</p>
              <p className="text-sm text-slate-500">Add a prescription to begin tracking doses and inventory.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {medications.map((med) => {
                const low = isLowStock(med.stockCount, med.refillThreshold);
                const dailyDoses = Array.isArray(med.timesOfDay) ? med.timesOfDay.length : 1;
                const daysSupply = calculateDaysOfSupply(med.stockCount, dailyDoses);

                return (
                  <div key={med.id} className="bg-white p-6 rounded-2xl border-2 border-slate-200 shadow-sm flex flex-col justify-between">
                    <div>
                      <div className="flex items-center justify-between mb-3">
                        <span className="text-xl font-bold text-slate-900">{med.name}</span>
                        <Badge variant={med.criticality === 'CRITICAL' ? 'critical' : 'default'}>
                          {med.criticality}
                        </Badge>
                      </div>
                      <p className="text-base text-slate-700 font-medium mb-1">
                        Strength: {med.strength} • {med.form}
                      </p>
                      <p className="text-sm text-slate-500 mb-2">
                        Times: {Array.isArray(med.timesOfDay) ? med.timesOfDay.join(', ') : med.timesOfDay}
                      </p>
                      {med.instructions && (
                        <p className="text-sm text-slate-600 bg-slate-50 p-2.5 rounded-lg border border-slate-200 mb-4">
                          👉 {med.instructions}
                        </p>
                      )}
                    </div>

                    <div className="border-t pt-4 flex items-center justify-between">
                      <div>
                        <span className="text-xs text-slate-500 uppercase font-semibold">Inventory</span>
                        <p className="text-lg font-bold text-slate-900">
                          {med.stockCount} units remaining (~{daysSupply === Infinity ? 0 : daysSupply} days)
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        {low ? (
                          <Badge variant="warning" className="gap-1">
                            <AlertTriangle className="w-3.5 h-3.5" />
                            Refill Needed
                          </Badge>
                        ) : (
                          <Badge variant="success">Stock Good</Badge>
                        )}
                        <button
                          onClick={() => {
                            setStockModalMed(med);
                            setNewStockCount(med.stockCount);
                          }}
                          className="p-2 rounded-lg border border-slate-300 hover:bg-slate-100 text-slate-700"
                          title="Adjust Stock Count"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Tab 3: Appointments */}
      {activeTab === 'appointments' && (
        <div className="space-y-6">
          <div className="flex justify-between items-center">
            <h2 className="text-2xl font-bold text-slate-900">Doctor Appointments</h2>
            <Button
              onClick={() => {
                setFormErrors({});
                setAddApptModalOpen(true);
              }}
              className="gap-2"
            >
              <Plus className="w-5 h-5" />
              Schedule Appointment
            </Button>
          </div>

          {appointments.length === 0 ? (
            <div className="p-8 text-center bg-white rounded-2xl border border-slate-200">
              <Calendar className="w-12 h-12 text-slate-400 mx-auto mb-2" />
              <p className="text-lg font-bold text-slate-700">No scheduled appointments.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {appointments.map((appt) => (
                <div key={appt.id} className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-2">
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="text-xl font-bold text-slate-900">{appt.title}</h3>
                        {appt.isPrivate && <Badge variant="outline">Private</Badge>}
                      </div>
                      <p className="text-slate-600 text-base">
                        Doctor: {appt.doctorName} {appt.clinicName ? `• ${appt.clinicName}` : ''}
                      </p>
                      <p className="text-sm text-slate-500 mt-1">
                        Scheduled: {new Date(appt.startsAt || appt.scheduledAt || Date.now()).toLocaleString()} • Travel Buffer: {appt.travelMinutes} mins
                      </p>
                    </div>
                  </div>
                  {appt.questionsToAsk && (
                    <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 mt-3 text-sm text-slate-700">
                      <span className="font-bold">Questions for Doctor: </span>
                      {appt.questionsToAsk}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Tab 4: Care Notes */}
      {activeTab === 'notes' && (
        <div className="space-y-6">
          <div className="flex justify-between items-center">
            <h2 className="text-2xl font-bold text-slate-900">Care Notes</h2>
            <Button
              onClick={() => {
                setFormErrors({});
                setAddNoteModalOpen(true);
              }}
              className="gap-2"
            >
              <Plus className="w-5 h-5" />
              Add Note
            </Button>
          </div>

          {careNotes.length === 0 ? (
            <div className="p-8 text-center bg-white rounded-2xl border border-slate-200">
              <FileText className="w-12 h-12 text-slate-400 mx-auto mb-2" />
              <p className="text-lg font-bold text-slate-700">No care notes yet.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {careNotes.map((note) => (
                <div key={note.id} className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-bold text-slate-900 text-base">
                      {note.author?.name || 'Care Circle Member'}
                    </span>
                    <div className="flex items-center gap-2">
                      {note.isPrivate && <Badge variant="outline">Private</Badge>}
                      <span className="text-xs text-slate-500">
                        {new Date(note.createdAt).toLocaleString()}
                      </span>
                    </div>
                  </div>
                  <p className="text-slate-700 text-base leading-relaxed">{note.body}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Tab 5: Care Circle */}
      {activeTab === 'circle' && (
        <div className="space-y-6">
          <div className="flex justify-between items-center">
            <h2 className="text-2xl font-bold text-slate-900">Care Circle Members</h2>
            {isOwner && (
              <Button
                onClick={() => {
                  setFormErrors({});
                  setInviteModalOpen(true);
                }}
                className="gap-2"
              >
                <Plus className="w-5 h-5" />
                Invite Caregiver
              </Button>
            )}
          </div>

          <div className="divide-y divide-slate-200 bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
            {members.map((member) => {
              const isPending = member.status === 'INVITED';
              return (
                <div key={member.id} className="p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-3 mb-1">
                      <span className="font-bold text-slate-900 text-lg">
                        {member.user?.name || member.user?.email || 'Invited User'}
                      </span>
                      <Badge variant={member.role === 'OWNER' ? 'success' : isPending ? 'warning' : 'default'}>
                        {member.role} {isPending ? '(Pending Confirmation)' : ''}
                      </Badge>
                    </div>
                    <p className="text-sm text-slate-500">{member.user?.email}</p>
                    <p className="text-xs text-slate-600 mt-1">
                      Scopes: {Array.isArray(member.scopes) ? member.scopes.join(', ') : 'Standard'}
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    {isOwner && isPending && (
                      <button
                        onClick={() => handleConfirmMember(member.id)}
                        className="text-sm font-bold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 px-3 py-1.5 rounded-lg border border-emerald-300 min-h-[40px] flex items-center gap-1.5"
                      >
                        <Check className="w-4 h-4" />
                        Confirm Member
                      </button>
                    )}
                    {isOwner && member.role !== 'OWNER' && (
                      <button
                        onClick={() => handleRemoveMember(member.id)}
                        className="text-sm font-bold text-rose-600 hover:text-rose-700 px-3 py-1.5 rounded-lg border border-rose-200 hover:bg-rose-50 min-h-[40px]"
                      >
                        Remove
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Tab 6: Audit Trail */}
      {activeTab === 'audit' && (
        <div className="space-y-6">
          <div>
            <h2 className="text-2xl font-bold text-slate-900">Security & Audit Log</h2>
            <p className="text-slate-500 text-sm">
              Immutable, append-only record of every health data action and security event.
            </p>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 overflow-x-auto shadow-sm">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-700">
                <tr>
                  <th className="py-3 px-4 font-bold">Timestamp</th>
                  <th className="py-3 px-4 font-bold">Action</th>
                  <th className="py-3 px-4 font-bold">Entity</th>
                  <th className="py-3 px-4 font-bold">Actor</th>
                  <th className="py-3 px-4 font-bold">IP</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-600">
                {activities.map((log, i) => (
                  <tr key={i} className="hover:bg-slate-50">
                    <td className="py-3 px-4 font-mono text-xs">
                      {new Date(log.timestamp || log.createdAt).toLocaleString()}
                    </td>
                    <td className="py-3 px-4 font-semibold text-slate-800">{log.action}</td>
                    <td className="py-3 px-4">{log.entityType || log.entityId || 'Record'}</td>
                    <td className="py-3 px-4">{log.actorName || log.actorUserId || 'User'}</td>
                    <td className="py-3 px-4 font-mono text-xs">{log.ip || '127.0.0.1'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Modal: Add Medication */}
      {addMedModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="add-med-title"
          className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 overflow-y-auto"
        >
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 sm:p-8 border border-slate-300 shadow-2xl">
            <h3 id="add-med-title" className="text-2xl font-extrabold text-slate-900 mb-4">
              Add Prescription
            </h3>

            {formErrors.general && (
              <div role="alert" aria-live="assertive" className="mb-4 p-3 bg-rose-50 border border-rose-200 text-rose-700 text-sm font-bold rounded-xl">
                {formErrors.general}
              </div>
            )}

            <form onSubmit={handleAddMedication} className="space-y-4">
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-1">Medication Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Telmisartan"
                  value={medForm.name}
                  onChange={(e) => setMedForm({ ...medForm, name: e.target.value })}
                  className="w-full p-3 border border-slate-300 rounded-xl focus:border-blue-600 focus:outline-none"
                />
                {formErrors.name && <p className="text-rose-600 text-xs mt-1">{formErrors.name}</p>}
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-1">Strength</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. 40 mg"
                    value={medForm.strength}
                    onChange={(e) => setMedForm({ ...medForm, strength: e.target.value })}
                    className="w-full p-3 border border-slate-300 rounded-xl focus:border-blue-600 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-1">Form</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Tablet"
                    value={medForm.form}
                    onChange={(e) => setMedForm({ ...medForm, form: e.target.value })}
                    className="w-full p-3 border border-slate-300 rounded-xl focus:border-blue-600 focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-1">Criticality</label>
                  <select
                    value={medForm.criticality}
                    onChange={(e) => setMedForm({ ...medForm, criticality: e.target.value as any })}
                    className="w-full p-3 border border-slate-300 rounded-xl focus:border-blue-600 focus:outline-none"
                  >
                    <option value="STANDARD">STANDARD</option>
                    <option value="CRITICAL">CRITICAL</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-1">Times of Day (HH:MM)</label>
                  <input
                    type="text"
                    required
                    placeholder="08:00, 20:00"
                    value={medForm.timesOfDay}
                    onChange={(e) => setMedForm({ ...medForm, timesOfDay: e.target.value })}
                    className="w-full p-3 border border-slate-300 rounded-xl focus:border-blue-600 focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-1">Initial Stock Count</label>
                  <input
                    type="number"
                    min="0"
                    value={medForm.stockCount}
                    onChange={(e) => setMedForm({ ...medForm, stockCount: Number(e.target.value) })}
                    className="w-full p-3 border border-slate-300 rounded-xl focus:border-blue-600 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-1">Refill Alert Threshold</label>
                  <input
                    type="number"
                    min="0"
                    value={medForm.refillThreshold}
                    onChange={(e) => setMedForm({ ...medForm, refillThreshold: Number(e.target.value) })}
                    className="w-full p-3 border border-slate-300 rounded-xl focus:border-blue-600 focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-bold text-slate-700 mb-1">Instructions</label>
                <input
                  type="text"
                  placeholder="Take with a full glass of water after meals"
                  value={medForm.instructions}
                  onChange={(e) => setMedForm({ ...medForm, instructions: e.target.value })}
                  className="w-full p-3 border border-slate-300 rounded-xl focus:border-blue-600 focus:outline-none"
                />
              </div>

              <div className="flex gap-4 pt-4">
                <button
                  type="button"
                  onClick={() => setAddMedModalOpen(false)}
                  className="flex-1 py-3 px-4 rounded-xl border border-slate-300 font-bold hover:bg-slate-100"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={formSubmitting}
                  className="flex-1 py-3 px-4 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-bold"
                >
                  {formSubmitting ? 'Saving...' : 'Save Medication'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Adjust Stock */}
      {stockModalMed && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="adjust-stock-title"
          className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4"
        >
          <div className="bg-white rounded-3xl max-w-md w-full p-6 border border-slate-300 shadow-2xl">
            <h3 id="adjust-stock-title" className="text-xl font-bold text-slate-900 mb-2">
              Adjust Stock: {stockModalMed.name}
            </h3>
            <p className="text-sm text-slate-600 mb-4">
              Enter the new verified physical count for this medicine.
            </p>

            {formErrors.general && (
              <div role="alert" aria-live="assertive" className="mb-4 text-rose-600 text-sm font-bold">
                {formErrors.general}
              </div>
            )}

            <form onSubmit={handleAdjustStock} className="space-y-4">
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-1">Current Quantity on Hand</label>
                <input
                  type="number"
                  min="0"
                  required
                  value={newStockCount}
                  onChange={(e) => setNewStockCount(Number(e.target.value))}
                  className="w-full p-3 text-2xl font-bold text-center border border-slate-300 rounded-xl focus:border-blue-600 focus:outline-none"
                />
              </div>

              <div className="flex gap-4 pt-2">
                <button
                  type="button"
                  onClick={() => setStockModalMed(null)}
                  className="flex-1 py-3 px-4 rounded-xl border border-slate-300 font-bold hover:bg-slate-100"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={formSubmitting}
                  className="flex-1 py-3 px-4 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-bold"
                >
                  {formSubmitting ? 'Updating...' : 'Update Stock'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Add Appointment */}
      {addApptModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="add-appt-title"
          className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4"
        >
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 sm:p-8 border border-slate-300 shadow-2xl">
            <h3 id="add-appt-title" className="text-2xl font-extrabold text-slate-900 mb-4">
              Schedule Appointment
            </h3>

            {formErrors.general && (
              <div role="alert" aria-live="assertive" className="mb-4 p-3 bg-rose-50 border border-rose-200 text-rose-700 text-sm font-bold rounded-xl">
                {formErrors.general}
              </div>
            )}

            <form onSubmit={handleAddAppointment} className="space-y-4">
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-1">Appointment Title</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Cardiology Follow-Up"
                  value={apptForm.title}
                  onChange={(e) => setApptForm({ ...apptForm, title: e.target.value })}
                  className="w-full p-3 border border-slate-300 rounded-xl focus:border-blue-600 focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-1">Doctor Name</label>
                  <input
                    type="text"
                    required
                    placeholder="Dr. Anand Kulkarni"
                    value={apptForm.doctorName}
                    onChange={(e) => setApptForm({ ...apptForm, doctorName: e.target.value })}
                    className="w-full p-3 border border-slate-300 rounded-xl focus:border-blue-600 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-1">Clinic / Hospital</label>
                  <input
                    type="text"
                    placeholder="Ruby Hall OPD"
                    value={apptForm.clinicName}
                    onChange={(e) => setApptForm({ ...apptForm, clinicName: e.target.value })}
                    className="w-full p-3 border border-slate-300 rounded-xl focus:border-blue-600 focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-1">Date & Time</label>
                  <input
                    type="datetime-local"
                    required
                    value={apptForm.scheduledAt}
                    onChange={(e) => setApptForm({ ...apptForm, scheduledAt: e.target.value })}
                    className="w-full p-3 border border-slate-300 rounded-xl focus:border-blue-600 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-1">Travel Buffer (Mins)</label>
                  <input
                    type="number"
                    min="0"
                    value={apptForm.travelMinutes}
                    onChange={(e) => setApptForm({ ...apptForm, travelMinutes: Number(e.target.value) })}
                    className="w-full p-3 border border-slate-300 rounded-xl focus:border-blue-600 focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-bold text-slate-700 mb-1">Questions to Ask Doctor</label>
                <textarea
                  rows={2}
                  placeholder="Questions, symptoms to report, recent blood pressure readings..."
                  value={apptForm.questionsToAsk}
                  onChange={(e) => setApptForm({ ...apptForm, questionsToAsk: e.target.value })}
                  className="w-full p-3 border border-slate-300 rounded-xl focus:border-blue-600 focus:outline-none"
                />
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="appt-private"
                  checked={apptForm.isPrivate}
                  onChange={(e) => setApptForm({ ...apptForm, isPrivate: e.target.checked })}
                  className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                />
                <label htmlFor="appt-private" className="text-sm font-medium text-slate-700">
                  Mark as private (visible only to OWNER and members with private scope)
                </label>
              </div>

              <div className="flex gap-4 pt-4">
                <button
                  type="button"
                  onClick={() => setAddApptModalOpen(false)}
                  className="flex-1 py-3 px-4 rounded-xl border border-slate-300 font-bold hover:bg-slate-100"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={formSubmitting}
                  className="flex-1 py-3 px-4 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-bold"
                >
                  {formSubmitting ? 'Scheduling...' : 'Confirm Appointment'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Add Note */}
      {addNoteModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="add-note-title"
          className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4"
        >
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 sm:p-8 border border-slate-300 shadow-2xl">
            <h3 id="add-note-title" className="text-2xl font-extrabold text-slate-900 mb-4">
              Add Care Note
            </h3>

            {formErrors.general && (
              <div role="alert" aria-live="assertive" className="mb-4 text-rose-600 text-sm font-bold">
                {formErrors.general}
              </div>
            )}

            <form onSubmit={handleAddNote} className="space-y-4">
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-1">Daily Note</label>
                <textarea
                  required
                  rows={4}
                  placeholder="Record observations, appetite, vitals, mobility, mood..."
                  value={noteForm.body}
                  onChange={(e) => setNoteForm({ ...noteForm, body: e.target.value })}
                  className="w-full p-3 border border-slate-300 rounded-xl focus:border-blue-600 focus:outline-none"
                />
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="note-private"
                  checked={noteForm.isPrivate}
                  onChange={(e) => setNoteForm({ ...noteForm, isPrivate: e.target.checked })}
                  className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                />
                <label htmlFor="note-private" className="text-sm font-medium text-slate-700">
                  Private note (visible only to members with private items permission)
                </label>
              </div>

              <div className="flex gap-4 pt-4">
                <button
                  type="button"
                  onClick={() => setAddNoteModalOpen(false)}
                  className="flex-1 py-3 px-4 rounded-xl border border-slate-300 font-bold hover:bg-slate-100"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={formSubmitting}
                  className="flex-1 py-3 px-4 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-bold"
                >
                  {formSubmitting ? 'Saving...' : 'Add Note'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Invite Care Circle Member */}
      {inviteModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="invite-title"
          className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 overflow-y-auto"
        >
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 sm:p-8 border border-slate-300 shadow-2xl">
            <h3 id="invite-title" className="text-2xl font-extrabold text-slate-900 mb-4">
              Invite Care Circle Member
            </h3>

            {formErrors.general && (
              <div role="alert" aria-live="assertive" className="mb-4 p-3 bg-rose-50 border border-rose-200 text-rose-700 text-sm font-bold rounded-xl">
                {formErrors.general}
              </div>
            )}

            <form onSubmit={handleInviteMember} className="space-y-4">
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-1">Email Address</label>
                <input
                  type="email"
                  required
                  placeholder="caregiver@family.org"
                  value={inviteForm.email}
                  onChange={(e) => setInviteForm({ ...inviteForm, email: e.target.value })}
                  className="w-full p-3 border border-slate-300 rounded-xl focus:border-blue-600 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-sm font-bold text-slate-700 mb-1">Role</label>
                <select
                  value={inviteForm.role}
                  onChange={(e) => setInviteForm({ ...inviteForm, role: e.target.value })}
                  className="w-full p-3 border border-slate-300 rounded-xl focus:border-blue-600 focus:outline-none"
                >
                  <option value="CAREGIVER">CAREGIVER (Can log doses, notes, manage appointments)</option>
                  <option value="FAMILY">FAMILY (View-only for schedule, notes, adherence)</option>
                  <option value="EMERGENCY_VIEWER">EMERGENCY_VIEWER (Emergency card view only)</option>
                </select>
              </div>

              <div className="space-y-2 border-t pt-3">
                <span className="block text-sm font-bold text-slate-800">Permissions (Scopes)</span>
                <label className="flex items-center gap-2 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    checked={inviteForm.scopeManageMeds}
                    onChange={(e) => setInviteForm({ ...inviteForm, scopeManageMeds: e.target.checked })}
                    className="w-4 h-4 rounded text-blue-600"
                  />
                  Manage Medications & Record Doses
                </label>
                <label className="flex items-center gap-2 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    checked={inviteForm.scopeManageAppts}
                    onChange={(e) => setInviteForm({ ...inviteForm, scopeManageAppts: e.target.checked })}
                    className="w-4 h-4 rounded text-blue-600"
                  />
                  Manage Doctor Appointments
                </label>
                <label className="flex items-center gap-2 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    checked={inviteForm.scopeWriteNotes}
                    onChange={(e) => setInviteForm({ ...inviteForm, scopeWriteNotes: e.target.checked })}
                    className="w-4 h-4 rounded text-blue-600"
                  />
                  Create Care Notes
                </label>
                <label className="flex items-center gap-2 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    checked={inviteForm.scopeViewPrivate}
                    onChange={(e) => setInviteForm({ ...inviteForm, scopeViewPrivate: e.target.checked })}
                    className="w-4 h-4 rounded text-blue-600"
                  />
                  View Private Notes & Appointments
                </label>
              </div>

              <div className="flex gap-4 pt-4">
                <button
                  type="button"
                  onClick={() => setInviteModalOpen(false)}
                  className="flex-1 py-3 px-4 rounded-xl border border-slate-300 font-bold hover:bg-slate-100"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={formSubmitting}
                  className="flex-1 py-3 px-4 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-bold"
                >
                  {formSubmitting ? 'Sending...' : 'Send Invitation'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
