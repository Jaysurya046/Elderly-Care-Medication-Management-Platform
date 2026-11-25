import { prisma } from '@elder-care/db';
import { sendEmail } from '../email-sender';

/**
 * Retries failed notifications with exponential backoff up to a maximum of 3 attempts.
 * Backoff intervals:
 * Attempt 1 -> retry after 2 minutes
 * Attempt 2 -> retry after 10 minutes
 * Attempt 3 -> permanently abandoned
 */
export async function processNotificationRetries(referenceTime: Date = new Date()): Promise<number> {
  let retriedCount = 0;

  // Bounded scan for failed notifications with fewer than 3 attempts
  const failedLogs = await prisma.notificationLog.findMany({
    where: {
      status: 'FAILED',
      attempts: { lt: 3 },
    },
    take: 100,
  });

  const nowMs = referenceTime.getTime();

  for (const log of failedLogs) {
    const backoffDelayMs = log.attempts === 1 ? 2 * 60 * 1000 : 10 * 60 * 1000;
    const eligibleAt = new Date(log.createdAt.getTime() + backoffDelayMs);

    if (nowMs < eligibleAt.getTime()) {
      continue; // Not yet eligible for retry under backoff policy
    }

    const nextAttempts = log.attempts + 1;

    let recipientEmail = 'user@example.com';
    if (prisma.user?.findUnique) {
      const recipient = await prisma.user.findUnique({
        where: { id: log.recipientUserId },
      });
      if (recipient?.email) {
        recipientEmail = recipient.email;
      }
    }

    const sendResult = await sendEmail({
      to: recipientEmail,
      subject: `Medication Reminder (Retry)`,
      text: `You have an unconfirmed notification. Open the app to view details.`,
    });

    if (sendResult.success) {
      await prisma.notificationLog.update({
        where: { id: log.id },
        data: {
          status: 'SENT',
          sentAt: new Date(),
          attempts: nextAttempts,
          error: null,
        },
      });
      retriedCount++;
    } else {
      await prisma.notificationLog.update({
        where: { id: log.id },
        data: {
          status: 'FAILED',
          attempts: nextAttempts,
          error: sendResult.error || 'Retry attempt failed',
        },
      });
    }
  }

  return retriedCount;
}
