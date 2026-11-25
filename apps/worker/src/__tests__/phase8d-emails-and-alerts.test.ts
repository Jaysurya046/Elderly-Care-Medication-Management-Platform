import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@elder-care/db', () => ({
  prisma: {
    doseEvent: {
      findMany: vi.fn(),
      updateMany: vi.fn(),
    },
    doseEventAction: {
      create: vi.fn(),
    },
    appointment: {
      findMany: vi.fn(),
    },
    notificationLog: {
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
  },
}));

vi.mock('../email-sender', () => ({
  sendEmail: vi.fn().mockResolvedValue({ success: true }),
}));

import { prisma } from '@elder-care/db';
import { sendEmail } from '../email-sender';
import { processAutoMissDoses } from '../jobs/auto-miss.job';
import { processDoseReminders } from '../jobs/dose-reminders.job';
import { processAppointmentReminders } from '../jobs/appointment-reminders.job';

describe('Phase 8d-1: Missed-Dose, Due-Now, and Travel-Aware Alerts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('1. Missed-dose email to the elder', () => {
    it('sends a missed-dose email to the elder when grace period expires', async () => {
      const scheduledAt = new Date('2026-11-23T08:00:00.000Z');
      const afterGrace = new Date('2026-11-23T09:15:00.000Z'); // 75 mins later (> 60m grace)

      const mockDose = {
        id: 'dose-missed-1',
        profileId: 'prof-kamala',
        scheduledAt,
        status: 'PENDING',
        profile: {
          id: 'prof-kamala',
          displayName: 'Kamala Devi',
          timezone: 'Asia/Kolkata',
          emailShowsMedicineNames: false,
          owner: {
            id: 'user-kamala',
            name: 'Kamala Devi',
            email: 'kamala@example.com',
          },
        },
        schedule: {
          graceMinutes: 60,
          medication: {
            name: 'Metformin',
            strength: '500 mg',
            instructions: 'With breakfast',
            criticality: 'STANDARD',
            isActive: true,
          },
        },
      };

      vi.mocked(prisma.doseEvent.findMany).mockResolvedValue([mockDose as any]);
      vi.mocked(prisma.doseEvent.updateMany).mockResolvedValue({ count: 1 });
      vi.mocked(prisma.notificationLog.findUnique).mockResolvedValue(null);
      vi.mocked(prisma.notificationLog.create).mockResolvedValue({ id: 'notif-missed-1' } as any);

      const missedCount = await processAutoMissDoses(afterGrace);
      expect(missedCount).toBe(1);

      // Verify email was sent to the elder
      expect(sendEmail).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'kamala@example.com',
          subject: expect.stringMatching(/Missed Medication|Medication Reminder/i),
        })
      );

      // Verify notificationLog was recorded with DOSE_MISSED
      expect(prisma.notificationLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            profileId: 'prof-kamala',
            recipientUserId: 'user-kamala',
            type: 'DOSE_MISSED',
            referenceKey: expect.stringContaining('DOSE_MISSED_dose-missed-1'),
          }),
        })
      );
    });
  });

  describe('2. Dose-due-now email at scheduled time', () => {
    it('dispatches DOSE_DUE_NOW email when referenceTime reaches scheduledAt and status is PENDING', async () => {
      const scheduledAt = new Date('2026-11-23T08:00:00.000Z');
      const referenceTime = new Date('2026-11-23T08:01:00.000Z'); // exactly due now

      const mockDose = {
        id: 'dose-due-1',
        profileId: 'prof-kamala',
        scheduledAt,
        status: 'PENDING',
        profile: {
          id: 'prof-kamala',
          displayName: 'Kamala Devi',
          timezone: 'Asia/Kolkata',
          emailShowsMedicineNames: false,
          owner: {
            id: 'user-kamala',
            name: 'Kamala Devi',
            email: 'kamala@example.com',
          },
        },
        schedule: {
          graceMinutes: 60,
          medication: {
            name: 'Metformin',
            strength: '500 mg',
            instructions: 'With breakfast',
            criticality: 'STANDARD',
            isActive: true,
          },
        },
      };

      vi.mocked(prisma.doseEvent.findMany)
        .mockResolvedValueOnce([]) // auto-miss
        .mockResolvedValueOnce([mockDose as any]); // upcoming/due scanner
      vi.mocked(prisma.notificationLog.findUnique).mockResolvedValue(null);
      vi.mocked(prisma.notificationLog.create).mockResolvedValue({ id: 'notif-due-1' } as any);

      const sent = await processDoseReminders(referenceTime);
      expect(sent).toBe(1);

      // Verify DOSE_DUE_NOW notification was created
      expect(prisma.notificationLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            type: 'DOSE_DUE_NOW',
            referenceKey: expect.stringContaining('DOSE_DUE_NOW'),
          }),
        })
      );

      expect(sendEmail).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'kamala@example.com',
          subject: expect.stringMatching(/Due Now/i),
        })
      );
    });
  });

  describe('3. Travel-aware appointment leave-by alert', () => {
    it('dispatches leave-by alert at startsAt - travelMinutes', async () => {
      // Appointment starts at 14:00 UTC, travel time is 45 minutes
      // Leave-by time is 13:15 UTC
      const startsAt = new Date('2026-11-23T14:00:00.000Z');
      const leaveByTime = new Date('2026-11-23T13:15:00.000Z');

      const mockAppointment = {
        id: 'appt-travel-1',
        profileId: 'prof-1',
        title: 'Cardiology Checkup',
        doctorName: 'Dr. Rao',
        clinicName: 'Apollo Hospital',
        startsAt,
        travelMinutes: 45,
        reminderOffsetsMinutes: [10080, 1440, 120], // standard offsets
        isPrivate: false,
        profile: {
          id: 'prof-1',
          displayName: 'Elder John',
          timezone: 'Asia/Kolkata',
          emailShowsMedicineNames: true,
          memberships: [
            {
              role: 'OWNER',
              status: 'ACTIVE',
              user: { id: 'u1', name: 'John', email: 'john@example.com' },
            },
          ],
        },
      };

      vi.mocked(prisma.appointment.findMany).mockResolvedValue([mockAppointment as any]);
      vi.mocked(prisma.notificationLog.findUnique).mockResolvedValue(null);
      vi.mocked(prisma.notificationLog.create).mockResolvedValue({ id: 'notif-leaveby-1' } as any);

      // Run processor at leave-by time (13:15 UTC)
      const remindersSent = await processAppointmentReminders(leaveByTime);
      expect(remindersSent).toBe(1);

      // Verify notificationLog has LEAVE_BY referenceKey
      expect(prisma.notificationLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            type: 'APPOINTMENT_LEAVE_BY',
            referenceKey: 'APPT_LEAVE_BY_appt-travel-1_u1',
          }),
        })
      );

      // Verify email mentions leaving / travel time
      expect(sendEmail).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'john@example.com',
          subject: expect.stringMatching(/Time to leave/i),
          text: expect.stringMatching(/45 minutes/i),
        })
      );
    });
  });
});
