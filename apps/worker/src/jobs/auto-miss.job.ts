import { prisma } from '@elder-care/db';
import { sendEmail } from '../email-sender';
import { MissedDoseEmail } from '@elder-care/email';
import { format, toZonedTime } from 'date-fns-tz';
import React from 'react';

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
      schedule: {
        include: {
          medication: true,
        },
      },
      profile: {
        include: {
          owner: true,
        },
      },
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

        // Send missed-dose notification to the elder
        const recipient = (dose as any).profile?.owner;
        if (recipient) {
          const refKey = `DOSE_MISSED_${dose.id}_${recipient.id}`;

          const existingLog = await prisma.notificationLog.findUnique({
            where: { referenceKey: refKey },
          });

          if (!existingLog) {
            const tz = (dose as any).profile.timezone || 'Asia/Kolkata';
            const localZoned = toZonedTime(dose.scheduledAt, tz);
            const localTimeStr = format(localZoned, 'hh:mm a', { timeZone: tz });
            const showMedicine = Boolean((dose as any).profile.emailShowsMedicineNames);
            const medName = dose.schedule.medication.name;

            const subject = showMedicine
              ? `Missed Medication Alert: ${medName} for ${(dose as any).profile.displayName}`
              : `Missed Medication Alert for ${(dose as any).profile.displayName}`;

            const appBaseUrl = process.env.APP_BASE_URL || 'http://localhost:3000';
            const template = React.createElement(MissedDoseEmail, {
              displayName: (dose as any).profile.displayName,
              localTimeStr,
              appUrl: `${appBaseUrl}/senior`,
              emailShowsMedicineNames: showMedicine,
              medicines: [
                {
                  name: dose.schedule.medication.name,
                  strength: dose.schedule.medication.strength,
                  instructions: dose.schedule.medication.instructions,
                },
              ],
            });

            const notifLog = await prisma.notificationLog.create({
              data: {
                profileId: dose.profileId,
                recipientUserId: recipient.id,
                type: 'DOSE_MISSED',
                referenceKey: refKey,
                channel: 'EMAIL',
                status: 'PENDING',
                attempts: 1,
              },
            });

            const sendResult = await sendEmail({
              to: recipient.email,
              subject,
              template,
            });

            await prisma.notificationLog.update({
              where: { id: notifLog.id },
              data: {
                status: sendResult.success ? 'SENT' : 'FAILED',
                sentAt: sendResult.success ? new Date() : null,
                error: sendResult.error || null,
              },
            });
          }
        }
      }
    }
  }

  return missedCount;
}
