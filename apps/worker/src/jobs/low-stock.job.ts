import { prisma } from '@elder-care/db';
import { sendEmail } from '../email-sender';
import { LowStockAlertEmail } from '@elder-care/email';
import React from 'react';

function escapeHtml(text?: string | null): string {
  if (!text) return '';
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export async function processLowStockAlerts(referenceTime: Date = new Date()): Promise<number> {
  let alertsSent = 0;

  // Medications at or below refill threshold (bounded batch: 100)
  const lowStockMeds = await prisma.medication.findMany({
    where: {
      isActive: true,
      stockCount: { lte: prisma.medication.fields?.refillThreshold || 5 },
    },
    take: 100, // Bounded batch
    include: {
      profile: {
        include: {
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

  const fortyEightHoursAgo = new Date(referenceTime.getTime() - 48 * 60 * 60 * 1000);
  const appBaseUrl = process.env.APP_BASE_URL || 'http://localhost:3000';

  for (const med of lowStockMeds) {
    if (med.stockCount > med.refillThreshold) continue;

    for (const membership of med.profile.memberships) {
      const recipient = membership.user;
      const refKey = `LOW_STOCK_${med.id}_${recipient.id}_${referenceTime.toISOString().slice(0, 10)}`;

      // Check if notified in last 48 hours
      const recentLog = await prisma.notificationLog.findFirst({
        where: {
          profileId: med.profileId,
          recipientUserId: recipient.id,
          type: 'LOW_STOCK',
          referenceKey: { startsWith: `LOW_STOCK_${med.id}_${recipient.id}` },
          createdAt: { gte: fortyEightHoursAgo },
          status: 'SENT',
        },
      });

      if (recentLog) continue; // Already alerted within 48h

      const showMedicine = Boolean(med.profile.emailShowsMedicineNames);
      const medName = escapeHtml(med.name);
      const elderName = escapeHtml(med.profile.displayName);
      const recipientName = escapeHtml(recipient.name);

      const subject = showMedicine
        ? `Low Stock Alert: ${medName} for ${elderName}`
        : 'A refill is needed. Open the app to see which medicine.';

      const template = React.createElement(LowStockAlertEmail, {
        caregiverName: recipientName,
        elderName: elderName,
        medicineName: `${medName} (${escapeHtml(med.strength)})`,
        showMedicineName: showMedicine,
        stockCount: med.stockCount,
        refillThreshold: med.refillThreshold,
        appUrl: `${appBaseUrl}/dashboard/medications`,
      });

      let notifLog;
      try {
        notifLog = await prisma.notificationLog.create({
          data: {
            profileId: med.profileId,
            recipientUserId: recipient.id,
            type: 'LOW_STOCK',
            referenceKey: refKey,
            channel: 'EMAIL',
            status: 'PENDING',
            attempts: 1,
          },
        });
      } catch (err: any) {
        // Gracefully handle concurrent worker unique-key race (P2002)
        if (err?.code === 'P2002' || err?.message?.includes('Unique constraint')) {
          continue;
        }
        throw err;
      }

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
        alertsSent++;
      }
    }
  }

  return alertsSent;
}
