import { prisma } from '@elder-care/db';
import { sendEmail } from '../email-sender';
import { format, toZonedTime } from 'date-fns-tz';

export async function processAppointmentReminders(referenceTime: Date = new Date()): Promise<number> {
  let remindersSent = 0;

  // Upcoming scheduled appointments in the next 8 days
  const futureWindow = new Date(referenceTime.getTime() + 8 * 24 * 60 * 60 * 1000);
  const appointments = await prisma.appointment.findMany({
    where: {
      status: 'SCHEDULED',
      startsAt: {
        gt: referenceTime,
        lte: futureWindow,
      },
    },
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

    for (const offset of offsets) {
      const triggerTime = new Date(appt.startsAt.getTime() - offset * 60 * 1000);
      // Check if reference time has reached trigger time and is within a 30-minute window
      const diffMs = referenceTime.getTime() - triggerTime.getTime();
      if (diffMs < 0 || diffMs > 30 * 60 * 1000) {
        continue;
      }

      // Send to owner and active caregivers
      for (const membership of appt.profile.memberships) {
        const recipient = membership.user;
        const refKey = `APPT_REMINDER_${appt.id}_${offset}_${recipient.id}`;

        const existingLog = await prisma.notificationLog.findUnique({
          where: { referenceKey: refKey },
        });

        if (existingLog) continue;

        const subject = `Upcoming Appointment: ${appt.title} for ${appt.profile.displayName}`;

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
          text: `Reminder: ${appt.profile.displayName} has an appointment "${appt.title}" with ${appt.doctorName} on ${formattedDate} at ${appt.clinicName || appt.address || 'Clinic'}. View details: ${appBaseUrl}/dashboard/appointments`,
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

  return remindersSent;
}
