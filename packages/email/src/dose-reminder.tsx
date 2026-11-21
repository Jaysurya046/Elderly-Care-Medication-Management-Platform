import * as React from 'react';
import {
  Html,
  Head,
  Preview,
  Body,
  Container,
  Heading,
  Text,
  Button,
  Section,
  Hr,
  Link,
} from '@react-email/components';

export interface DoseReminderEmailProps {
  displayName: string;
  localTimeStr: string;
  appUrl: string;
  emailShowsMedicineNames?: boolean;
  medicines?: Array<{ name: string; strength: string; instructions?: string | null }>;
}

export function DoseReminderEmail({
  displayName = 'Kamala',
  localTimeStr = '8:00 AM',
  appUrl = 'http://localhost:3000/senior',
  emailShowsMedicineNames = false,
  medicines = [],
}: DoseReminderEmailProps) {
  const previewText = emailShowsMedicineNames
    ? `Medication Reminder for ${localTimeStr}`
    : 'You have medicines due soon.';

  return (
    <Html>
      <Head />
      <Preview>{previewText}</Preview>
      <Body style={main}>
        <Container style={container}>
          <Heading style={heading}>Hello {displayName},</Heading>

          {emailShowsMedicineNames && medicines.length > 0 ? (
            <Section>
              <Text style={paragraph}>
                Here are your scheduled medications for <strong>{localTimeStr}</strong>:
              </Text>
              <ul style={list}>
                {medicines.map((m, i) => (
                  <li key={i} style={listItem}>
                    <strong>{m.name}</strong> ({m.strength})
                    {m.instructions ? ` - ${m.instructions}` : ''}
                  </li>
                ))}
              </ul>
            </Section>
          ) : (
            <Section>
              <Text style={paragraph}>
                You have medicines due at <strong>{localTimeStr}</strong>. Open the app to view and
                confirm your doses.
              </Text>
            </Section>
          )}

          <Section style={btnContainer}>
            <Button style={button} href={appUrl}>
              Open Elder Care App
            </Button>
          </Section>

          <Hr style={hr} />
          <Text style={footer}>
            Safe privacy notification. You can adjust your email privacy settings in your profile.
            <br />
            <Link href={`${appUrl}/settings`} style={link}>
              Manage notification preferences
            </Link>
          </Text>
        </Container>
      </Body>
    </Html>
  );
}

const main = {
  backgroundColor: '#f6f9fc',
  fontFamily: '-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif',
};

const container = {
  backgroundColor: '#ffffff',
  margin: '0 auto',
  padding: '32px 24px',
  borderRadius: '8px',
  maxWidth: '560px',
  border: '1px solid #e2e8f0',
};

const heading = {
  fontSize: '22px',
  fontWeight: '700',
  color: '#0f172a',
  marginBottom: '16px',
};

const paragraph = {
  fontSize: '16px',
  lineHeight: '24px',
  color: '#334155',
  marginBottom: '20px',
};

const list = {
  paddingLeft: '20px',
  marginBottom: '24px',
};

const listItem = {
  fontSize: '15px',
  lineHeight: '22px',
  color: '#1e293b',
  marginBottom: '8px',
};

const btnContainer = {
  textAlign: 'center' as const,
  margin: '28px 0',
};

const button = {
  backgroundColor: '#059669',
  borderRadius: '8px',
  color: '#ffffff',
  fontSize: '16px',
  fontWeight: 'bold',
  textDecoration: 'none',
  textAlign: 'center' as const,
  display: 'inline-block',
  padding: '14px 28px',
};

const hr = {
  borderColor: '#e2e8f0',
  margin: '24px 0',
};

const footer = {
  fontSize: '12px',
  lineHeight: '18px',
  color: '#64748b',
  textAlign: 'center' as const,
};

const link = {
  color: '#0284c7',
  textDecoration: 'underline',
};
