import { prisma, CareNote, Role } from '@elder-care/db';
import { requireProfileAccess } from '../lib/auth-guard';
import { recordAuditLog } from '../lib/audit';

export interface CreateCareNoteInput {
  body: string;
  isPrivate?: boolean;
}

export async function createCareNote(
  profileId: string,
  input: CreateCareNoteInput,
  actorUserId?: string
): Promise<CareNote> {
  const { membership } = await requireProfileAccess(profileId, {
    scope: 'write_notes',
    userIdOverride: actorUserId,
  });

  const note = await prisma.careNote.create({
    data: {
      profileId,
      authorMembershipId: membership.id,
      body: input.body.trim(),
      isPrivate: input.isPrivate ?? false,
    },
  });

  await recordAuditLog({
    profileId,
    actorUserId: membership.userId,
    actorMembershipId: membership.id,
    action: 'CARE_NOTE:CREATE',
    entityType: 'CareNote',
    entityId: note.id,
    metadata: { isPrivate: note.isPrivate },
  });

  return note;
}

export async function getCareNotes(
  profileId: string,
  actorUserId?: string
): Promise<CareNote[]> {
  const { membership } = await requireProfileAccess(profileId, {
    scope: 'view_notes',
    userIdOverride: actorUserId,
  });

  const scopes = (membership.scopes || {}) as Record<string, boolean>;
  const canViewPrivate = membership.role === Role.OWNER || Boolean(scopes.view_private_items);

  const notes = await prisma.careNote.findMany({
    where: {
      profileId,
      ...(canViewPrivate ? {} : { isPrivate: false }),
    },
    include: {
      authorMembership: {
        include: {
          user: {
            select: { id: true, name: true },
          },
        },
      },
    },
    orderBy: { createdAt: 'desc' },
  });

  await recordAuditLog({
    profileId,
    actorUserId: membership.userId,
    actorMembershipId: membership.id,
    action: 'HEALTH_DATA:READ',
    entityType: 'CareNote',
    entityId: profileId,
    metadata: { count: notes.length },
  });

  return notes;
}

export interface ActivityFeedItem {
  id: string;
  type: 'DOSE_ACTION' | 'CARE_NOTE' | 'APPOINTMENT';
  title: string;
  description: string;
  timestamp: Date;
  actorName?: string;
  isPrivate: boolean;
}

export async function getActivityFeed(
  profileId: string,
  actorUserId?: string
): Promise<ActivityFeedItem[]> {
  const { membership } = await requireProfileAccess(profileId, {
    scope: 'view_notes',
    userIdOverride: actorUserId,
  });

  const scopes = (membership.scopes || {}) as Record<string, boolean>;
  const canViewPrivate = membership.role === Role.OWNER || Boolean(scopes.view_private_items);

  const feed: ActivityFeedItem[] = [];

  // 1. Fetch recent dose actions (past 7 days)
  const doseActions = await prisma.doseEventAction.findMany({
    where: {
      doseEvent: { profileId },
    },
    include: {
      doseEvent: {
        include: {
          schedule: {
            include: { medication: true },
          },
        },
      },
      membership: {
        include: {
          user: {
            select: { id: true, name: true },
          },
        },
      },
    },
    orderBy: { createdAt: 'desc' },
    take: 20,
  });

  for (const action of doseActions) {
    const medName = action.doseEvent.schedule.medication.name;
    const actorName = action.membership?.user?.name || 'Elder / Caregiver';
    feed.push({
      id: `dose_${action.id}`,
      type: 'DOSE_ACTION',
      title: `${medName} marked ${action.toStatus}`,
      description: action.reason ? `Note: ${action.reason}` : `Recorded by ${actorName}`,
      timestamp: action.createdAt,
      actorName,
      isPrivate: false,
    });
  }

  // 2. Fetch care notes (respecting privacy)
  const notes = await prisma.careNote.findMany({
    where: {
      profileId,
      ...(canViewPrivate ? {} : { isPrivate: false }),
    },
    include: {
      authorMembership: {
        include: {
          user: {
            select: { id: true, name: true },
          },
        },
      },
    },
    orderBy: { createdAt: 'desc' },
    take: 20,
  });

  for (const note of notes) {
    const authorName = note.authorMembership?.user?.name || 'Caregiver';
    feed.push({
      id: `note_${note.id}`,
      type: 'CARE_NOTE',
      title: `Care Note by ${authorName}`,
      description: note.body,
      timestamp: note.createdAt,
      actorName: authorName,
      isPrivate: note.isPrivate,
    });
  }

  // 3. Sort chronologically descending
  return feed.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime()).slice(0, 30);
}
