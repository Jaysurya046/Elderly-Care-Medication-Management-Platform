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
} from '@react-email/components';

export interface CriticalEscalationEmailProps {
  caregiverName: string;
  elderName: string;
  scheduledTimeStr: string;
  appUrl: string;
}

export function CriticalEscalationEmail({
  caregiverName = 'Rajesh',
  elderName = 'Kamala Devi',
  scheduledTimeStr = '8:00 AM',
  appUrl = 'http://localhost:3000/dashboard',
}: CriticalEscalationEmailProps) {
  return (
    <Html>
      <Head />
      <Preview>URGENT: Critical medication missed for {elderName}</Preview>
      <Body style={main}>
        <Container style={container}>
          <Heading style={heading}>⚠️ Urgent Care Circle Alert</Heading>
          <Text style={paragraph}>Hello {caregiverName},</Text>
          <Text style={paragraph}>
            A <strong>CRITICAL</strong> medication scheduled for <strong>{elderName}</strong> at{' '}
            <strong>{scheduledTimeStr}</strong> has not been recorded as taken, and the grace period
            has expired.
          </Text>
          <Text style={callout}>
            Please check in with {elderName} to verify that their medicine was taken safely.
          </Text>

          <Section style={btnContainer}>
            <Button style={button} href={appUrl}>
              Open Care Dashboard
            </Button>
          </Section>

          <Hr style={hr} />
          <Text style={footer}>
            You are receiving this alert because you are a designated caregiver for {elderName} with
            missed-dose alerts enabled.
          </Text>
        </Container>
      </Body>
    </Html>
  );
}

const main = {
  backgroundColor: '#fef2f2',
  fontFamily: '-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif',
};

const container = {
  backgroundColor: '#ffffff',
  margin: '0 auto',
  padding: '32px 24px',
  borderRadius: '8px',
  maxWidth: '560px',
  border: '2px solid #ef4444',
};

const heading = {
  fontSize: '22px',
  fontWeight: '700',
  color: '#dc2626',
  marginBottom: '16px',
};

const paragraph = {
  fontSize: '16px',
  lineHeight: '24px',
  color: '#334155',
  marginBottom: '16px',
};

const callout = {
  fontSize: '16px',
  lineHeight: '24px',
  fontWeight: '600',
  color: '#991b1b',
  backgroundColor: '#fee2e2',
  padding: '16px',
  borderRadius: '6px',
  margin: '20px 0',
};

const btnContainer = {
  textAlign: 'center' as const,
  margin: '28px 0',
};

const button = {
  backgroundColor: '#dc2626',
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
  borderColor: '#fca5a5',
  margin: '24px 0',
};

const footer = {
  fontSize: '12px',
  lineHeight: '18px',
  color: '#64748b',
  textAlign: 'center' as const,
};
