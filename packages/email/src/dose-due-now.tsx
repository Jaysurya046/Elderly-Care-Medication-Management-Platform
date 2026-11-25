import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Html,
  Preview,
  Section,
  Text,
} from '@react-email/components';
import * as React from 'react';

interface DoseDueNowEmailProps {
  displayName: string;
  localTimeStr: string;
  appUrl: string;
  emailShowsMedicineNames?: boolean;
  medicines?: Array<{
    name: string;
    strength: string;
    instructions?: string | null;
  }>;
}

export const DoseDueNowEmail = ({
  displayName = 'Senior',
  localTimeStr = '08:00 AM',
  appUrl = 'http://localhost:3000/senior',
  emailShowsMedicineNames = false,
  medicines = [],
}: DoseDueNowEmailProps) => {
  return (
    <Html>
      <Head />
      <Preview>Medication due now for {displayName} ({localTimeStr})</Preview>
      <Body style={main}>
        <Container style={container}>
          <Heading style={heading}>Medication Due Now</Heading>
          <Text style={paragraph}>Hello {displayName},</Text>

          {emailShowsMedicineNames && medicines.length > 0 ? (
            <Section style={medBox}>
              <Text style={medTitle}>It is time for your {localTimeStr} dose:</Text>
              {medicines.map((m, idx) => (
                <Text key={idx} style={medItem}>
                  • <strong>{m.name}</strong> ({m.strength})
                  {m.instructions ? ` - ${m.instructions}` : ''}
                </Text>
              ))}
            </Section>
          ) : (
            <Text style={paragraph}>
              You have medication scheduled for <strong>{localTimeStr}</strong> that is due now.
              Please take your medication and log it in the app.
            </Text>
          )}

          <Section style={btnContainer}>
            <Button style={button} href={appUrl}>
              Confirm Dose Taken
            </Button>
          </Section>
          <Text style={footer}>
            Elder Care & Medication Management Platform • Automated notification
          </Text>
        </Container>
      </Body>
    </Html>
  );
};

export default DoseDueNowEmail;

const main = {
  backgroundColor: '#f6f9fc',
  fontFamily:
    '-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue",Ubuntu,sans-serif',
};

const container = {
  backgroundColor: '#ffffff',
  margin: '0 auto',
  padding: '20px 24px 48px',
  marginBottom: '64px',
  borderRadius: '8px',
  border: '1px solid #e2e8f0',
};

const heading = {
  fontSize: '24px',
  lineHeight: '1.3',
  fontWeight: '700',
  color: '#2b6cb0',
};

const paragraph = {
  fontSize: '16px',
  lineHeight: '1.4',
  color: '#484848',
};

const medBox = {
  backgroundColor: '#ebf8ff',
  border: '1px solid #bee3f8',
  borderRadius: '6px',
  padding: '12px 16px',
  margin: '16px 0',
};

const medTitle = {
  fontSize: '15px',
  fontWeight: '600',
  color: '#2c5282',
  marginBottom: '8px',
};

const medItem = {
  fontSize: '14px',
  lineHeight: '1.4',
  color: '#2a4365',
  margin: '4px 0',
};

const btnContainer = {
  textAlign: 'center' as const,
  marginTop: '24px',
  marginBottom: '24px',
};

const button = {
  backgroundColor: '#3182ce',
  borderRadius: '6px',
  color: '#fff',
  fontSize: '16px',
  fontWeight: 'bold',
  textDecoration: 'none',
  textAlign: 'center' as const,
  display: 'inline-block',
  padding: '12px 24px',
};

const footer = {
  color: '#8898aa',
  fontSize: '12px',
  lineHeight: '16px',
  marginTop: '32px',
};
