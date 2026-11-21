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

export interface CaregiverInvitationEmailProps {
  elderName: string;
  role: string;
  invitationUrl: string;
  expiresInDays?: number;
}

export function CaregiverInvitationEmail({
  elderName = 'Kamala Devi',
  role = 'Caregiver',
  invitationUrl = 'http://localhost:3000/invite/accept?token=sample-token',
  expiresInDays = 7,
}: CaregiverInvitationEmailProps) {
  return (
    <Html>
      <Head />
      <Preview>Invitation to join {elderName}'s Care Circle</Preview>
      <Body style={main}>
        <Container style={container}>
          <Heading style={heading}>Care Circle Invitation</Heading>
          <Text style={paragraph}>
            You have been invited by <strong>{elderName}</strong> to join their Care Circle as a{' '}
            <strong>{role}</strong>.
          </Text>
          <Text style={paragraph}>
            As a care circle member, you will be able to help manage daily medicines, track
            appointments, and stay connected with family care.
          </Text>
          <Text style={note}>
            This invitation link is single-use, strictly private, and expires in {expiresInDays}{' '}
            days.
          </Text>

          <Section style={btnContainer}>
            <Button style={button} href={invitationUrl}>
              Accept Invitation
            </Button>
          </Section>

          <Hr style={hr} />
          <Text style={footer}>
            If you did not expect this invitation, you can safely ignore this email.
          </Text>
        </Container>
      </Body>
    </Html>
  );
}

const main = {
  backgroundColor: '#f8fafc',
  fontFamily: '-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif',
};

const container = {
  backgroundColor: '#ffffff',
  margin: '0 auto',
  padding: '32px 24px',
  borderRadius: '8px',
  maxWidth: '560px',
  border: '1px solid #cbd5e1',
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
  marginBottom: '16px',
};

const note = {
  fontSize: '14px',
  lineHeight: '20px',
  color: '#64748b',
  backgroundColor: '#f1f5f9',
  padding: '12px',
  borderRadius: '6px',
  margin: '16px 0',
};

const btnContainer = {
  textAlign: 'center' as const,
  margin: '28px 0',
};

const button = {
  backgroundColor: '#2563eb',
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
  color: '#94a3b8',
  textAlign: 'center' as const,
};
