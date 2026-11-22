import { NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import { ZodError } from 'zod';
import { formatZodError } from '@elder-care/core';
import { logger } from './logger';

export function handleApiError(error: any, req?: Request): NextResponse {
  // 1. Zod Validation Errors -> 400 with field-level plain errors
  if (error instanceof ZodError) {
    return NextResponse.json(
      {
        success: false,
        error: 'Validation failed',
        errors: formatZodError(error),
      },
      { status: 400 }
    );
  }

  // 2. Known Domain Errors with explicit status codes (401, 403, 404, 409)
  if (error && typeof error.statusCode === 'number') {
    return NextResponse.json(
      {
        success: false,
        error: error.message,
      },
      { status: error.statusCode }
    );
  }

  // 3. Unexpected 500 Errors -> Log securely with Pino, return generic message with requestId
  const requestId = randomUUID();
  logger.error(
    {
      requestId,
      err: error,
      method: req?.method,
      url: req?.url,
    },
    'Unexpected internal API error'
  );

  return NextResponse.json(
    {
      success: false,
      error: 'An unexpected internal error occurred. Please contact support.',
      requestId,
    },
    { status: 500 }
  );
}
