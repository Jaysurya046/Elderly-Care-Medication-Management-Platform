import { prisma } from '@elder-care/db';

export async function processScheduledDeletions(referenceTime: Date = new Date()): Promise<number> {
  let deletedCount = 0;

  // Profiles where deletion was requested more than 30 days ago (grace period expired)
  const thirtyDaysAgo = new Date(referenceTime.getTime() - 30 * 24 * 60 * 60 * 1000);

  const eligibleProfiles = await prisma.careProfile.findMany({
    where: {
      deletionRequestedAt: {
        lte: thirtyDaysAgo,
      },
    },
    include: {
      owner: true,
    },
  });

  for (const profile of eligibleProfiles) {
    // Record immutable audit log before final database purge
    await prisma.auditLog.create({
      data: {
        profileId: profile.id,
        actorUserId: profile.ownerId,
        action: 'DATA:DELETE',
        entityType: 'CareProfile',
        entityId: profile.id,
        metadata: {
          profileName: profile.displayName,
          deletionRequestedAt: profile.deletionRequestedAt?.toISOString(),
          purgedAt: referenceTime.toISOString(),
          reason: '30_DAY_GRACE_PERIOD_EXPIRED',
        },
      },
    });

    // Delete care profile (cascades to medications, schedules, doses, care notes, appointments, memberships)
    await prisma.careProfile.delete({
      where: { id: profile.id },
    });

    deletedCount++;
  }

  return deletedCount;
}
