import { z } from 'zod';

export const createMedicationSchema = z.object({
  name: z.string().min(1, 'Medication name is required').max(200),
  genericName: z.string().max(200).optional(),
  strength: z.string().min(1, 'Strength is required (e.g. 500mg)').max(100),
  form: z.string().min(1, 'Form is required (e.g. Tablet, Capsule)').max(100),
  instructions: z.string().max(1000).optional(),
  criticality: z.enum(['STANDARD', 'CRITICAL']).default('STANDARD'),
  prescribedBy: z.string().max(200).optional(),
  startDate: z.union([z.string(), z.date()]),
  endDate: z.union([z.string(), z.date()]).nullable().optional(),
  stockCount: z.number().int().min(0, 'Stock count cannot be negative').default(0),
  refillThreshold: z.number().int().min(0).default(5),
  rrule: z.string().optional(),
  timesOfDay: z.array(z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Invalid time format (HH:MM)')).min(1, 'At least one time of day is required'),
  graceMinutes: z.number().int().min(1).default(60),
  snoozeMinutes: z.number().int().min(1).default(15),
  escalateToCaregivers: z.boolean().optional(),
});

export const updateCareProfileSchema = z.object({
  displayName: z.string().min(1, 'Display name cannot be empty').max(200).optional(),
  dateOfBirth: z.union([z.string(), z.date()]).optional(),
  timezone: z.string().max(100).optional(),
  bloodType: z.string().max(10).optional(),
  allergies: z.string().max(2000).optional(),
  conditions: z.string().max(2000).optional(),
  primaryDoctorName: z.string().max(200).optional(),
  preferredHospital: z.string().max(200).optional(),
  emailShowsMedicineNames: z.boolean().optional(),
  readAloudEnabled: z.boolean().optional(),
});

export const doseActionSchema = z.object({
  action: z.enum(['TAKE', 'SNOOZE', 'SKIP', 'CORRECTION']),
  note: z.string().max(1000).optional(),
  skipReason: z.string().max(1000).optional(),
  correctionTargetStatus: z.enum(['TAKEN', 'LATE_TAKEN', 'SKIPPED', 'MISSED', 'PENDING']).optional(),
});

export const createCareNoteSchema = z.object({
  body: z.string().min(1, 'Note content cannot be empty').max(5000, 'Note is too long (max 5000 characters)'),
  isPrivate: z.boolean().default(false),
});

export const invitationCreateSchema = z.object({
  email: z.string().email('Please enter a valid email address'),
  role: z.enum(['CAREGIVER', 'FAMILY', 'EMERGENCY_VIEWER']),
  scopes: z.record(z.string(), z.boolean()).optional(),
});

export const invitationAcceptSchema = z.object({
  token: z.string().min(1, 'Invitation token is required'),
});

export const verifyPasscodeSchema = z.object({
  membershipId: z.string().min(1, 'Membership ID is required'),
  passcode: z.string().regex(/^\d{4,6}$/, 'Passcode must be between 4 and 6 digits'),
});

export const signUpSchema = z.object({
  name: z.string().min(1, 'Name is required').max(200),
  email: z.string().email('Please enter a valid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  consentGiven: z.boolean().refine((val) => val === true, {
    message: 'Explicit consent to health data processing is required.',
  }),
  consentVersion: z.string().default('v1.0'),
});

export const signInSchema = z.object({
  email: z.string().email('Please enter a valid email address'),
  password: z.string().min(1, 'Password is required'),
  totpCode: z.string().optional(),
});

export const requestPasswordResetSchema = z.object({
  email: z.string().email('Please enter a valid email address'),
});

export const resetPasswordSchema = z.object({
  token: z.string().min(1, 'Reset token is required'),
  newPassword: z.string().min(8, 'New password must be at least 8 characters'),
});

export const totpVerifySchema = z.object({
  code: z.string().regex(/^\d{6}$/, 'TOTP code must be 6 digits'),
});

export const setPasscodeSchema = z.object({
  membershipId: z.string().min(1, 'Membership ID is required'),
  passcode: z.string().regex(/^\d{4,6}$/, 'Passcode must be between 4 and 6 digits'),
});

export const confirmCareCircleMemberSchema = z.object({
  membershipId: z.string().min(1, 'Membership ID is required'),
  confirmedScopes: z.record(z.string(), z.boolean()).optional(),
});

export const updateMedicationSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  genericName: z.string().max(200).nullable().optional(),
  strength: z.string().min(1).max(100).optional(),
  form: z.string().min(1).max(100).optional(),
  instructions: z.string().max(1000).nullable().optional(),
  criticality: z.enum(['STANDARD', 'CRITICAL']).optional(),
  prescribedBy: z.string().max(200).nullable().optional(),
  stockCount: z.number().int().min(0, 'Stock count cannot be negative').optional(),
  refillThreshold: z.number().int().min(0).optional(),
  isActive: z.boolean().optional(),
});

export const createAppointmentSchema = z.object({
  title: z.string().min(1, 'Title is required').max(200),
  doctorName: z.string().min(1, 'Doctor name is required').max(200),
  specialty: z.string().max(200).optional(),
  clinicName: z.string().max(200).optional(),
  address: z.string().max(500).optional(),
  scheduledAt: z.union([z.string(), z.date()]).optional(),
  startsAt: z.union([z.string(), z.date()]).optional(),
  travelMinutes: z.number().int().min(0).default(0),
  isPrivate: z.boolean().default(false),
  notes: z.string().max(2000).optional(),
  questionsToAsk: z.string().max(2000).optional(),
  reminderOffsetsMinutes: z.array(z.number().int()).optional(),
}).refine((data) => Boolean(data.scheduledAt || data.startsAt), {
  message: 'Either scheduledAt or startsAt is required',
  path: ['scheduledAt'],
});

export const doseCorrectionSchema = z.object({
  targetStatus: z.enum(['TAKEN', 'LATE_TAKEN', 'SKIPPED', 'MISSED', 'PENDING']),
  reason: z.string().min(1, 'Reason is required for dose correction').max(1000),
});

export function formatZodError(error: z.ZodError): Record<string, string> {
  const formatted: Record<string, string> = {};
  for (const issue of error.issues) {
    const field = issue.path.join('.') || 'general';
    formatted[field] = issue.message;
  }
  return formatted;
}
