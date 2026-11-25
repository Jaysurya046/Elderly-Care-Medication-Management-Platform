import { prisma } from '@elder-care/db';
import {
  generateNotificationReferenceKey,
  composeDoseReminderMessage,
  isWithinQuietHours,
  ReminderType,
} from '@elder-care/core';
import { format, toZonedTime } from 'date-fns-tz';
import { sendEmail } from '../email-sender';
import { DoseReminderEmail } from '@elder-care/email';
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
    take: 100, // Take the scan in bounded batches
    include: {
      schedule: true,
      profile: true,
    },
  });

  for (const dose of pendingDoses) {
    const graceMs = (dose.schedule.graceMinutes || 60) * 60 * 1000;
    const expiryTime = new Date(dose.scheduledAt.getTime() + graceMs);

    if (referenceTime >= expiryTime) {
      // Worker auto-miss must be conditional updateMany and only write DoseEventAction row if count === 1
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

  // 2. Scan for doses due soon (window: from now to now + 15 minutes) or currently due, plus snoozed doses
  const upcomingWindow = new Date(referenceTime.getTime() + 15 * 60 * 1000);
  const eligibleDoses = await prisma.doseEvent.findMany({
    where: {
      schedule: { medication: { isActive: true } },
      OR: [
        {
          status: 'PENDING',
          scheduledAt: {
            gte: new Date(referenceTime.getTime() - 5 * 60 * 1000), // recent window
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

    // Quiet hours check
    if (!hasCritical && isWithinQuietHours(first.scheduledAt, tz)) {
      continue; // Deferred until 06:30
    }

    const localZoned = toZonedTime(first.scheduledAt, tz);
    const localTimeStr = format(localZoned, 'hh:mm a', { timeZone: tz });

    // Derive deterministic referenceKey for idempotency across repeated runs
    const refKey = generateNotificationReferenceKey({
      profileId: profile.id,
      recipientUserId: recipient.id,
      type: 'UPCOMING_DOSE',
      entityId: first.status === 'SNOOZED' ? `${first.id}_snooze_${first.snoozeCount}` : first.id,
      scheduledAtUtc: (first as any).snoozedUntil || first.scheduledAt,
    });

    // Check if already notified
    const existingLog = await prisma.notificationLog.findUnique({
      where: { referenceKey: refKey },
    });

    if (existingLog) {
      continue; // Idempotent skip
    }

    // Compose message following privacy rules (Section 1, Principle 5)
    const medicineNames = doses.map((d) => d.schedule.medication.name);
    const { subject } = composeDoseReminderMessage({
      localTimeStr,
      count: doses.length,
      emailShowsMedicineNames: profile.emailShowsMedicineNames,
      medicineNames,
    });

    const appBaseUrl = process.env.APP_BASE_URL || 'http://localhost:3000';
    const template = React.createElement(DoseReminderEmail, {
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

    // Record pending notification log
    const notifLog = await prisma.notificationLog.create({
      data: {
        profileId: profile.id,
        recipientUserId: recipient.id,
        type: 'UPCOMING_DOSE',
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
