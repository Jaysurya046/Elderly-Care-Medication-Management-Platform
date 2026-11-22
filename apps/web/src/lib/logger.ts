import pino from 'pino';

export const logger = pino({
  name: 'eldercare-web',
  level: process.env.LOG_LEVEL || (process.env.NODE_ENV === 'production' ? 'info' : 'debug'),
  redact: [
    'password',
    'passwordHash',
    'passcode',
    'passcodeHash',
    'token',
    'tokenHash',
    'totpSecret',
    'emergencyCode',
  ],
});
