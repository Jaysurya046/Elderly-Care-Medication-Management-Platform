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

export interface LowStockAlertEmailProps {
  caregiverName: string;
  elderName: string;
  medicineName: string;
  stockCount: number;
  refillThreshold: number;
  appUrl: string;
}

export function LowStockAlertEmail({
  caregiverName = 'Rajesh',
  elderName = 'Kamala Devi',
  medicineName = 'Metformin 500mg',
  stockCount = 4,
  refillThreshold = 10,
  appUrl = 'http://localhost:3000/dashboard/medications',
}: LowStockAlertEmailProps) {
  return (
    <Html>
      <Head />
      <Preview>Low stock alert: {medicineName} for {elderName}</Preview>
      <Body style={main}>
        <Container style={container}>
          <Heading style={heading}>Refill Needed</Heading>
          <Text style={paragraph}>Hello {caregiverName},</Text>
          <Text style={paragraph}>
            The inventory for <strong>{medicineName}</strong> for <strong>{elderName}</strong> has
            fallen to <strong>{stockCount}</strong> remaining units (threshold: {refillThreshold}).
          </Text>
          <Text style={paragraph}>
            Please order or arrange a prescription refill promptly to ensure daily medication is
            not interrupted.
          </Text>

          <Section style={btnContainer}>
            <Button style={button} href={appUrl}>
              Manage Medication Stock
            </Button>
          </Section>

          <Hr style={hr} />
          <Text style={footer}>
            Automated refill alert from Elder Care Platform. Sent once every 48 hours while below
            threshold.
          </Text>
        </Container>
      </Body>
    </Html>
  );
}

const main = {
  backgroundColor: '#fffbeb',
  fontFamily: '-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif',
};

const container = {
  backgroundColor: '#ffffff',
  margin: '0 auto',
  padding: '32px 24px',
  borderRadius: '8px',
  maxWidth: '560px',
  border: '1px solid #fde68a',
};

const heading = {
  fontSize: '22px',
  fontWeight: '700',
  color: '#b45309',
  marginBottom: '16px',
};

const paragraph = {
  fontSize: '16px',
  lineHeight: '24px',
  color: '#334155',
  marginBottom: '16px',
};

const btnContainer = {
  textAlign: 'center' as const,
  margin: '28px 0',
};

const button = {
  backgroundColor: '#d97706',
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
  borderColor: '#fef3c7',
  margin: '24px 0',
};

const footer = {
  fontSize: '12px',
  lineHeight: '18px',
  color: '#92400e',
  textAlign: 'center' as const,
};
