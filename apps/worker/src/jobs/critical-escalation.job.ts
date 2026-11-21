import { prisma } from '@elder-care/db';
import { generateNotificationReferenceKey, Scopes } from '@elder-care/core';
import { sendEmail } from '../email-sender';
import { CriticalEscalationEmail } from '@elder-care/email';
import { format, toZonedTime } from 'date-fns-tz';
import React from 'react';

export async function processCriticalEscalations(referenceTime: Date = new Date()): Promise<number> {
  let escalationsDispatched = 0;

  // 1. Find all critical missed doses
  const missedCriticalDoses = await prisma.doseEvent.findMany({
    where: {
      status: 'MISSED',
      schedule: {
        escalateToCaregivers: true,
        medication: {
          criticality: 'CRITICAL',
        },
      },
    },
    include: {
      profile: true,
      schedule: {
        include: { medication: true },
      },
    },
  });

  for (const dose of missedCriticalDoses) {
    const graceMs = (dose.schedule.graceMinutes || 60) * 60 * 1000;
    const escalationDelayMs = 60 * 60 * 1000; // 60 minutes past MISSED (Goal.md Section 6.3)
    const escalationEligibleAt = new Date(dose.scheduledAt.getTime() + graceMs + escalationDelayMs);

    if (referenceTime < escalationEligibleAt) {
      continue; // Not yet eligible for escalation
    }

    // 2. Find eligible caregivers with receive_missed_dose_alerts enabled
    const members = await prisma.membership.findMany({
      where: {
        profileId: dose.profileId,
        status: 'ACTIVE',
      },
      include: {
        user: true,
      },
    });

    const eligibleCaregivers = members.filter((m) => {
      const scopes = (m.scopes || {}) as Partial<Scopes>;
      return Boolean(scopes.receive_missed_dose_alerts);
    });

    const tz = dose.profile.timezone || 'Asia/Kolkata';
    const localZoned = toZonedTime(dose.scheduledAt, tz);
    const localTimeStr = format(localZoned, 'hh:mm a', { timeZone: tz });
    const appBaseUrl = process.env.APP_BASE_URL || 'http://localhost:3000';

    for (const caregiver of eligibleCaregivers) {
      const refKey = generateNotificationReferenceKey({
        profileId: dose.profileId,
        recipientUserId: caregiver.user.id,
        type: 'CRITICAL_ESCALATION',
        entityId: dose.id,
        scheduledAtUtc: dose.scheduledAt,
      });

      // Idempotency check
      const existing = await prisma.notificationLog.findUnique({
        where: { referenceKey: refKey },
      });
      if (existing) continue;

      const template = React.createElement(CriticalEscalationEmail, {
        caregiverName: caregiver.user.name,
        elderName: dose.profile.displayName,
        scheduledTimeStr: localTimeStr,
        appUrl: `${appBaseUrl}/dashboard`,
      });

      const notifLog = await prisma.notificationLog.create({
        data: {
          profileId: dose.profileId,
          recipientUserId: caregiver.user.id,
          type: 'CRITICAL_ESCALATION',
          referenceKey: refKey,
          channel: 'EMAIL',
          status: 'PENDING',
          attempts: 1,
        },
      });

      const sendResult = await sendEmail({
        to: caregiver.user.email,
        subject: `URGENT: Critical medication missed for ${dose.profile.displayName}`,
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
        escalationsDispatched++;
      }
    }
  }

  return escalationsDispatched;
}
