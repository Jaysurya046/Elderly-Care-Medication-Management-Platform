import { prisma, CareProfile, Role, MembershipStatus } from '@elder-care/db';
import { DEFAULT_ROLE_SCOPES } from '@elder-care/core';
import { generateEmergencyCode } from '../lib/crypto';
import { requireProfileAccess } from '../lib/auth-guard';
import { recordAuditLog } from '../lib/audit';

export interface CreateProfileInput {
  displayName: string;
  dateOfBirth: Date | string;
  timezone?: string;
  bloodType: string;
  allergies?: string;
  conditions?: string;
  primaryDoctorName?: string;
  preferredHospital?: string;
  emailShowsMedicineNames?: boolean;
  readAloudEnabled?: boolean;
}

export async function createCareProfile(
  ownerId: string,
  input: CreateProfileInput
): Promise<CareProfile> {
  let emergencyCode = generateEmergencyCode();
  // Ensure uniqueness
  while (await prisma.careProfile.findUnique({ where: { emergencyCode } })) {
    emergencyCode = generateEmergencyCode();
  }

  const profile = await prisma.careProfile.create({
    data: {
      ownerId,
      displayName: input.displayName.trim(),
      dateOfBirth: typeof input.dateOfBirth === 'string' ? new Date(input.dateOfBirth) : input.dateOfBirth,
      timezone: input.timezone || 'Asia/Kolkata',
      bloodType: input.bloodType.trim(),
      allergies: input.allergies || '',
      conditions: input.conditions || '',
      primaryDoctorName: input.primaryDoctorName || '',
      preferredHospital: input.preferredHospital || '',
      emergencyCode,
      emailShowsMedicineNames: input.emailShowsMedicineNames ?? false,
      readAloudEnabled: input.readAloudEnabled ?? true,
    },
  });

  // Automatically create the OWNER membership
  await prisma.membership.create({
    data: {
      profileId: profile.id,
      userId: ownerId,
      role: Role.OWNER,
      scopes: DEFAULT_ROLE_SCOPES.OWNER,
      status: MembershipStatus.ACTIVE,
    },
  });

  await recordAuditLog({
    profileId: profile.id,
    actorUserId: ownerId,
    action: 'PROFILE:UPDATE',
    entityType: 'CareProfile',
    entityId: profile.id,
    metadata: { action: 'CREATED' },
  });

  return profile;
}

export async function updateCareProfile(
  profileId: string,
  input: Partial<CreateProfileInput>,
  actorUserId?: string
): Promise<CareProfile> {
  const { membership } = await requireProfileAccess(profileId, {
    role: Role.OWNER,
    userIdOverride: actorUserId,
  });

  const updated = await prisma.careProfile.update({
    where: { id: profileId },
    data: {
      displayName: input.displayName ? input.displayName.trim() : undefined,
      bloodType: input.bloodType ? input.bloodType.trim() : undefined,
      allergies: input.allergies !== undefined ? input.allergies : undefined,
      conditions: input.conditions !== undefined ? input.conditions : undefined,
      primaryDoctorName: input.primaryDoctorName !== undefined ? input.primaryDoctorName : undefined,
      preferredHospital: input.preferredHospital !== undefined ? input.preferredHospital : undefined,
      timezone: input.timezone !== undefined ? input.timezone : undefined,
      emailShowsMedicineNames:
        input.emailShowsMedicineNames !== undefined ? input.emailShowsMedicineNames : undefined,
      readAloudEnabled: input.readAloudEnabled !== undefined ? input.readAloudEnabled : undefined,
    },
  });

  await recordAuditLog({
    profileId,
    actorUserId: membership.userId,
    actorMembershipId: membership.id,
    action: 'PROFILE:UPDATE',
    entityType: 'CareProfile',
    entityId: profileId,
    metadata: { action: 'UPDATED' },
  });

  return updated;
}

export async function rotateEmergencyCode(
  profileId: string,
  actorUserId?: string
): Promise<string> {
  const { membership } = await requireProfileAccess(profileId, {
    role: Role.OWNER,
    userIdOverride: actorUserId,
  });

  let newCode = generateEmergencyCode();
  while (await prisma.careProfile.findUnique({ where: { emergencyCode: newCode } })) {
    newCode = generateEmergencyCode();
  }

  await prisma.careProfile.update({
    where: { id: profileId },
    data: { emergencyCode: newCode },
  });

  await recordAuditLog({
    profileId,
    actorUserId: membership.userId,
    actorMembershipId: membership.id,
    action: 'PROFILE:UPDATE',
    entityType: 'CareProfile',
    entityId: profileId,
    metadata: { action: 'ROTATED_EMERGENCY_CODE' },
  });

  return newCode;
}

export async function requestProfileDeletion(
  profileId: string,
  actorUserId?: string
): Promise<Date> {
  const { membership } = await requireProfileAccess(profileId, {
    role: Role.OWNER,
    userIdOverride: actorUserId,
  });

  // 30-day grace period (Section 8: Data export and deletion)
  const gracePeriodEnd = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

  await prisma.careProfile.update({
    where: { id: profileId },
    data: { deletionRequestedAt: gracePeriodEnd },
  });

  await recordAuditLog({
    profileId,
    actorUserId: membership.userId,
    actorMembershipId: membership.id,
    action: 'PROFILE:DELETE_REQUESTED',
    entityType: 'CareProfile',
    entityId: profileId,
    metadata: { gracePeriodEnd: gracePeriodEnd.toISOString() },
  });

  return gracePeriodEnd;
}
