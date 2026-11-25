import { prisma } from '@elder-care/db';
import {
  generateNotificationReferenceKey,
  composeDoseReminderMessage,
  isWithinQuietHours,
  getAdjustedNotificationTime,
  ReminderType,
} from '@elder-care/core';
import { format, toZonedTime } from 'date-fns-tz';
import { sendEmail } from '../email-sender';
import { DoseReminderEmail, DoseDueNowEmail } from '@elder-care/email';
import React from 'react';

export async function processDoseReminders(referenceTime: Date = new Date()): Promise<number> {
  let remindersSent = 0;

  // 1. Automatically mark expired pending doses as MISSED (scheduledAt + graceMinutes passed)
  const pendingDoses = await prisma.doseEvent.findMany({
    where: {
      status: { in: ['PENDING', 'SNOOZED'] },
      scheduledAt: { lte: referenceTime },
      schedule: { medication: { isActive: true } },
    },
    take: 100, // Bounded batch
    include: {
      schedule: true,
      profile: true,
    },
  });

  for (const dose of pendingDoses) {
    const graceMs = (dose.schedule.graceMinutes || 60) * 60 * 1000;
    const expiryTime = new Date(dose.scheduledAt.getTime() + graceMs);

    if (referenceTime >= expiryTime) {
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
      }
    }
  }

  // 2. Scan for eligible doses:
  // - Upcoming doses in the next 15 minutes
  // - Currently due doses in recent window (up to 12 hours ago to capture quiet-hours deferred doses)
  // - Snoozed doses whose snoozedUntil has arrived
  const upcomingWindow = new Date(referenceTime.getTime() + 15 * 60 * 1000);
  const lookbackWindow = new Date(referenceTime.getTime() - 12 * 60 * 60 * 1000);

  const eligibleDoses = await prisma.doseEvent.findMany({
    where: {
      schedule: { medication: { isActive: true } },
      OR: [
        {
          status: 'PENDING',
          scheduledAt: {
            gte: lookbackWindow,
            lte: upcomingWindow,
          },
        },
        {
          status: 'SNOOZED',
          snoozedUntil: {
            lte: referenceTime,
          },
        },
      ],
    },
    take: 100, // Bounded batch
    include: {
      profile: {
        include: {
          owner: true,
        },
      },
      schedule: {
        include: {
          medication: true,
        },
      },
    },
  });

  // Group by profileId + local time for digest grouping
  const groupedDoses = new Map<string, typeof eligibleDoses>();

  for (const dose of eligibleDoses) {
    const tz = dose.profile.timezone || 'Asia/Kolkata';
    const localZoned = toZonedTime(dose.scheduledAt, tz);
    const localTimeStr = format(localZoned, 'hh:mm a', { timeZone: tz });

    const groupKey = `${dose.profileId}___${localTimeStr}`;
    const list = groupedDoses.get(groupKey) || [];
    list.push(dose);
    groupedDoses.set(groupKey, list);
  }

  for (const [groupKey, doses] of groupedDoses.entries()) {
    const first = doses[0];
    const profile = first.profile;
    const recipient = profile.owner;
    const tz = profile.timezone || 'Asia/Kolkata';
    const hasCritical = doses.some((d) => d.schedule.medication.criticality === 'CRITICAL');

    // Quiet hours handling:
    // If dose was scheduled during quiet hours, it is deferred to 06:30 local time
    const adjusted = getAdjustedNotificationTime(first.scheduledAt, hasCritical, tz);
    if (adjusted.wasDeferred && referenceTime < adjusted.dispatchAtUtc) {
      continue; // Still within quiet hours window; deferred until 06:30
    }

    // If currently within quiet hours for this profile and non-critical, do not send
    if (!hasCritical && isWithinQuietHours(referenceTime, tz)) {
      continue;
    }

    const localZoned = toZonedTime(first.scheduledAt, tz);
    const localTimeStr = format(localZoned, 'hh:mm a', { timeZone: tz });

    // Determine notification type: DOSE_DUE_NOW at/after scheduled time, UPCOMING_DOSE 15 mins prior
    const isDueNow = referenceTime >= first.scheduledAt || first.status === 'SNOOZED';
    const notifType: ReminderType = isDueNow ? 'DOSE_DUE_NOW' : 'UPCOMING_DOSE';

    const entityIdentifier = first.status === 'SNOOZED'
      ? `${first.id}_snooze_${first.snoozeCount}`
      : first.id;

    const refKey = generateNotificationReferenceKey({
      profileId: profile.id,
      recipientUserId: recipient.id,
      type: notifType,
      entityId: entityIdentifier,
      scheduledAtUtc: (first as any).snoozedUntil || first.scheduledAt,
    });

    // Check if already notified
    const existingLog = await prisma.notificationLog.findUnique({
      where: { referenceKey: refKey },
    });

    if (existingLog) {
      continue; // Idempotent skip
    }

    const medicineNames = doses.map((d) => d.schedule.medication.name);
    const appBaseUrl = process.env.APP_BASE_URL || 'http://localhost:3000';

    let subject: string;
    let template: React.ReactElement;

    if (notifType === 'DOSE_DUE_NOW') {
      subject = profile.emailShowsMedicineNames
        ? `Medication Due Now: ${localTimeStr} (${medicineNames.join(', ')})`
        : `Medication Due Now: ${localTimeStr}`;

      template = React.createElement(DoseDueNowEmail, {
        displayName: profile.displayName,
        localTimeStr,
        appUrl: `${appBaseUrl}/senior`,
        emailShowsMedicineNames: profile.emailShowsMedicineNames,
        medicines: doses.map((d) => ({
          name: d.schedule.medication.name,
          strength: d.schedule.medication.strength,
          instructions: d.schedule.medication.instructions,
        })),
      });
    } else {
      const msg = composeDoseReminderMessage({
        localTimeStr,
        count: doses.length,
        emailShowsMedicineNames: profile.emailShowsMedicineNames,
        medicineNames,
      });
      subject = msg.subject;

      template = React.createElement(DoseReminderEmail, {
        displayName: profile.displayName,
        localTimeStr,
        appUrl: `${appBaseUrl}/senior`,
        emailShowsMedicineNames: profile.emailShowsMedicineNames,
        medicines: doses.map((d) => ({
          name: d.schedule.medication.name,
          strength: d.schedule.medication.strength,
          instructions: d.schedule.medication.instructions,
        })),
      });
    }

    // Record pending notification log
    const notifLog = await prisma.notificationLog.create({
      data: {
        profileId: profile.id,
        recipientUserId: recipient.id,
        type: notifType,
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

    if (sendResult.success) {
      remindersSent++;
    }
  }

  return remindersSent;
}
