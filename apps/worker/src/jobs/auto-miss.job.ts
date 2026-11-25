import { prisma } from '@elder-care/db';

export async function processAutoMissDoses(referenceTime: Date = new Date()): Promise<number> {
  let missedCount = 0;

  // Bounded batch scanner (take: 100) skipping inactive medicines
  const pendingDoses = await prisma.doseEvent.findMany({
    where: {
      status: { in: ['PENDING', 'SNOOZED'] },
      scheduledAt: { lte: referenceTime },
      schedule: { medication: { isActive: true } },
    },
    take: 100,
    include: {
      schedule: true,
    },
  });

  for (const dose of pendingDoses) {
    const graceMs = (dose.schedule.graceMinutes || 60) * 60 * 1000;
    const expiryTime = new Date(dose.scheduledAt.getTime() + graceMs);

    if (referenceTime >= expiryTime) {
      // Conditional atomic updateMany
      const res = await prisma.doseEvent.updateMany({
        where: {
          id: dose.id,
          status: { in: ['PENDING', 'SNOOZED'] },
        },
        data: { status: 'MISSED' },
      });

      if (res.count === 1) {
        await prisma.doseEventAction.create({
          data: {
            doseEventId: dose.id,
            fromStatus: dose.status,
            toStatus: 'MISSED',
            reason: 'Auto-missed after grace period expired',
          },
        });
        missedCount++;
      }
    }
  }

  return missedCount;
}
