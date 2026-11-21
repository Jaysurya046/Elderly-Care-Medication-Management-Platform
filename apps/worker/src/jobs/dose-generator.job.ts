import { prisma } from '@elder-care/db';
import { generateRolling14DaySlots } from '@elder-care/core';

export async function processDoseGeneration(referenceDate: Date = new Date()): Promise<number> {
  const activeMedications = await prisma.medication.findMany({
    where: { isActive: true },
    include: {
      profile: true,
      schedules: true,
    },
  });

  let totalGenerated = 0;

  for (const med of activeMedications) {
    const tz = med.profile.timezone || 'Asia/Kolkata';

    for (const schedule of med.schedules) {
      const times = (schedule.timesOfDay as string[]) || [];

      const slots = generateRolling14DaySlots(
        {
          id: schedule.id,
          medicationId: schedule.medicationId,
          rrule: schedule.rrule,
          timesOfDay: times,
          startsOn: schedule.startsOn,
          endsOn: schedule.endsOn,
          timezone: tz,
        },
        referenceDate
      );

      for (const slot of slots) {
        // Unique on (scheduleId, scheduledAt) prevents duplicates
        const created = await prisma.doseEvent
          .create({
            data: {
              scheduleId: schedule.id,
              profileId: med.profileId,
              scheduledAt: slot.scheduledAtUTC,
              status: 'PENDING',
              snoozeCount: 0,
              stockDecremented: false,
            },
          })
          .then(() => 1)
          .catch(() => 0); // Ignore conflict

        totalGenerated += created;
      }
    }
  }

  return totalGenerated;
}
