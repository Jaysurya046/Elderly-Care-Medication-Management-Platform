import { prisma } from '@elder-care/db';
import { sendEmail } from '../email-sender';
import { format, toZonedTime } from 'date-fns-tz';

function escapeHtml(text?: string | null): string {
  if (!text) return '';
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export async function processAppointmentReminders(referenceTime: Date = new Date()): Promise<number> {
  let remindersSent = 0;

  // Upcoming scheduled appointments in the next 8 days (bounded query)
  const futureWindow = new Date(referenceTime.getTime() + 8 * 24 * 60 * 60 * 1000);
  const appointments = await prisma.appointment.findMany({
    where: {
      status: 'SCHEDULED',
      startsAt: {
        gt: referenceTime,
        lte: futureWindow,
      },
    },
    take: 100, // Bounded batch
    include: {
      profile: {
        include: {
          owner: true,
          memberships: {
            where: {
              status: 'ACTIVE',
              role: { in: ['OWNER', 'CAREGIVER'] },
            },
            include: { user: true },
          },
        },
      },
    },
  });

  const appBaseUrl = process.env.APP_BASE_URL || 'http://localhost:3000';

  for (const appt of appointments) {
    const offsets = (appt.reminderOffsetsMinutes as number[]) || [10080, 1440, 120];
    const tz = appt.profile.timezone || 'Asia/Kolkata';
    const localZoned = toZonedTime(appt.startsAt, tz);
    const formattedDate = format(localZoned, 'EEEE, MMM d, yyyy h:mm a', { timeZone: tz });

    // 1. Standard offset reminders (7 days, 1 day, 2 hours)
    for (const offset of offsets) {
      const triggerTime = new Date(appt.startsAt.getTime() - offset * 60 * 1000);
      const diffMs = referenceTime.getTime() - triggerTime.getTime();
      if (diffMs < 0 || diffMs > 30 * 60 * 1000) {
        continue;
      }

      // Filter recipients based on appointment privacy:
      // If appointment is private, exclude members without view_private_items scope
      const eligibleMembers = appt.profile.memberships.filter((m) => {
        if (!appt.isPrivate) return true;
        if (m.role === 'OWNER') return true;
        const scopes = (m.scopes as any) || {};
        return Array.isArray(scopes) ? scopes.includes('view_private_items') : Boolean(scopes.view_private_items);
      });

      for (const membership of eligibleMembers) {
        const recipient = membership.user;
        const refKey = `APPT_REMINDER_${appt.id}_${offset}_${recipient.id}`;

        const existingLog = await prisma.notificationLog.findUnique({
          where: { referenceKey: refKey },
        });

        if (existingLog) continue;

        const showDetails = appt.profile.emailShowsMedicineNames !== false;
        const elderName = escapeHtml(appt.profile.displayName);
        const apptTitle = escapeHtml(appt.title);
        const doctorName = escapeHtml(appt.doctorName);
        const locationName = escapeHtml(appt.clinicName || appt.address || 'Clinic');

        const subject = showDetails
          ? `Upcoming Appointment: ${apptTitle} for ${elderName}`
          : `Upcoming Medical Appointment for ${elderName}`;

        const textContent = showDetails
          ? `Reminder: ${elderName} has an appointment "${apptTitle}" with ${doctorName} on ${formattedDate} at ${locationName}. View details: ${appBaseUrl}/dashboard/appointments`
          : `Reminder: ${elderName} has an upcoming medical appointment scheduled on ${formattedDate}. Open the app to view doctor and location details: ${appBaseUrl}/dashboard/appointments`;

        const notifLog = await prisma.notificationLog.create({
          data: {
            profileId: appt.profileId,
            recipientUserId: recipient.id,
            type: 'APPOINTMENT_REMINDER',
            referenceKey: refKey,
            channel: 'EMAIL',
            status: 'PENDING',
            attempts: 1,
          },
        });

        const sendResult = await sendEmail({
          to: recipient.email,
          subject,
          text: textContent,
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
    }

    // 2. Travel-aware 'leave by' alert
    if (appt.travelMinutes && appt.travelMinutes > 0) {
      const leaveByTime = new Date(appt.startsAt.getTime() - appt.travelMinutes * 60 * 1000);
      const leaveDiffMs = referenceTime.getTime() - leaveByTime.getTime();

      // Trigger if referenceTime has reached leaveByTime within 30-minute window
      if (leaveDiffMs >= 0 && leaveDiffMs <= 30 * 60 * 1000) {
        const eligibleMembers = appt.profile.memberships.filter((m) => {
          if (!appt.isPrivate) return true;
          if (m.role === 'OWNER') return true;
          const scopes = (m.scopes as any) || {};
          return Array.isArray(scopes) ? scopes.includes('view_private_items') : Boolean(scopes.view_private_items);
        });

        for (const membership of eligibleMembers) {
          const recipient = membership.user;
          const refKey = `APPT_LEAVE_BY_${appt.id}_${recipient.id}`;

          const existingLog = await prisma.notificationLog.findUnique({
            where: { referenceKey: refKey },
          });

          if (existingLog) continue;

          const showDetails = appt.profile.emailShowsMedicineNames !== false;
          const elderName = escapeHtml(appt.profile.displayName);
          const apptTitle = escapeHtml(appt.title);
          const doctorName = escapeHtml(appt.doctorName);
          const locationName = escapeHtml(appt.clinicName || appt.address || 'Clinic');

          const subject = showDetails
            ? `Time to leave: Appointment with ${doctorName} for ${elderName}`
            : `Time to leave for upcoming medical appointment for ${elderName}`;

          const textContent = showDetails
            ? `Time to leave for appointment "${apptTitle}" with ${doctorName} at ${locationName}. Estimated travel time is ${appt.travelMinutes} minutes. View details: ${appBaseUrl}/dashboard/appointments`
            : `Time to leave for upcoming medical appointment for ${elderName}. Estimated travel time is ${appt.travelMinutes} minutes. Open the app to view doctor and location details: ${appBaseUrl}/dashboard/appointments`;

          const notifLog = await prisma.notificationLog.create({
            data: {
              profileId: appt.profileId,
              recipientUserId: recipient.id,
              type: 'APPOINTMENT_LEAVE_BY',
              referenceKey: refKey,
              channel: 'EMAIL',
              status: 'PENDING',
              attempts: 1,
            },
          });

          const sendResult = await sendEmail({
            to: recipient.email,
            subject,
            text: textContent,
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
      }
    }
  }

  return remindersSent;
}
