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

export function formatZodError(error: z.ZodError): Record<string, string> {
  const formatted: Record<string, string> = {};
  for (const issue of error.issues) {
    const field = issue.path.join('.') || 'general';
    formatted[field] = issue.message;
  }
  return formatted;
}
