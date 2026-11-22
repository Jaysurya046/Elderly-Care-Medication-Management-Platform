/**
 * Guards against executing seed operations in production environments.
 * Strictly aborts execution if NODE_ENV is set to production.
 */
export function guardSeedExecution(): void {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('CRITICAL: Seed script refused to run in production environment.');
  }
}
