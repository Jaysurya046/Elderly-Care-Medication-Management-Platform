import { prisma } from '@elder-care/db';
import pino from 'pino';

const logger = pino({ name: 'scheduled-deletion-job' });

export async function processScheduledDeletions(referenceTime: Date = new Date()): Promise<number> {
  let deletedCount = 0;

  // Profiles where deletion was requested more than 30 days ago (grace period expired)
  const thirtyDaysAgo = new Date(referenceTime.getTime() - 30 * 24 * 60 * 60 * 1000);

  // Bounded batch of max 50 profiles per run
  const eligibleProfiles = await prisma.careProfile.findMany({
    where: {
      deletionRequestedAt: {
        lte: thirtyDaysAgo,
      },
    },
    take: 50,
    include: {
      owner: true,
    },
  });

  for (const profile of eligibleProfiles) {
    try {
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

      // Revoke and delete all active sessions for the owner
      if (prisma.session?.deleteMany) {
        await prisma.session.deleteMany({
          where: { userId: profile.ownerId },
        });
      }

      // Delete care profile (cascades to medications, schedules, doses, care notes, appointments, memberships)
      await prisma.careProfile.delete({
        where: { id: profile.id },
      });

      // Check if owner has any remaining owned profiles or active memberships
      const remainingProfiles = prisma.careProfile?.count
        ? await prisma.careProfile.count({
            where: { ownerId: profile.ownerId, id: { not: profile.id } },
          })
        : 0;

      const remainingMemberships = prisma.membership?.count
        ? await prisma.membership.count({
            where: {
              userId: profile.ownerId,
              profileId: { not: profile.id },
              status: 'ACTIVE',
            },
          })
        : 0;

      // If user has no other active profiles or care circles, soft-delete user account
      if (remainingProfiles === 0 && remainingMemberships === 0 && prisma.user?.update) {
        await prisma.user.update({
          where: { id: profile.ownerId },
          data: { deletedAt: referenceTime },
        });
      }

      deletedCount++;
    } catch (err: any) {
      logger.error(
        { err, profileId: profile.id, ownerId: profile.ownerId },
        `Failed to process scheduled deletion for profile ${profile.id}`
      );
    }
  }

  return deletedCount;
}
