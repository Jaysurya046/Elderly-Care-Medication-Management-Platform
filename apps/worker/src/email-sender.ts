import nodemailer from 'nodemailer';
import { Resend } from 'resend';
import { render } from '@react-email/render';
import React from 'react';

let resendClient: Resend | null = null;
let smtpTransporter: nodemailer.Transporter | null = null;

function getEmailClient() {
  const provider = process.env.EMAIL_PROVIDER || 'mailpit';

  if (provider === 'resend' && process.env.RESEND_API_KEY) {
    if (!resendClient) {
      resendClient = new Resend(process.env.RESEND_API_KEY);
    }
    return { type: 'resend' as const, client: resendClient };
  }

  // Development: Mailpit via SMTP
  if (!smtpTransporter) {
    const host = process.env.SMTP_HOST || 'localhost';
    const port = parseInt(process.env.SMTP_PORT || '1025', 10);
    smtpTransporter = nodemailer.createTransport({
      host,
      port,
      secure: false,
      ignoreTLS: true,
    });
  }
  return { type: 'smtp' as const, client: smtpTransporter };
}

export interface SendEmailOptions {
  to: string;
  subject: string;
  template: React.ReactElement;
}

export async function sendEmail(options: SendEmailOptions): Promise<{ success: boolean; error?: string }> {
  try {
    const from = process.env.EMAIL_FROM || 'Elder Care <notifications@eldercare.local>';
    const html = await render(options.template);
    const text = await render(options.template, { plainText: true });

    const emailEngine = getEmailClient();

    if (emailEngine.type === 'resend' && emailEngine.client) {
      await emailEngine.client.emails.send({
        from,
        to: options.to,
        subject: options.subject,
        html,
        text,
      });
    } else if (emailEngine.type === 'smtp' && emailEngine.client) {
      await emailEngine.client.sendMail({
        from,
        to: options.to,
        subject: options.subject,
        html,
        text,
      });
    }

    return { success: true };
  } catch (error: any) {
    console.error(`Failed to send email to ${options.to}:`, error);
    return { success: false, error: error?.message || 'Email delivery failed' };
  }
}
