export interface CsrfValidationResult {
  valid: boolean;
  status?: number;
  error?: string;
}

/**
 * Validates CSRF protection on state-changing requests (POST, PUT, PATCH, DELETE).
 * Performs origin/host comparison and rejects cross-origin state changes with 403 Forbidden.
 */
export function validateCsrfRequest(req: Request): CsrfValidationResult {
  const method = req.method.toUpperCase();
  const safeMethods = ['GET', 'HEAD', 'OPTIONS'];

  if (safeMethods.includes(method)) {
    return { valid: true };
  }

  const hostHeader = req.headers.get('x-forwarded-host') || req.headers.get('host');
  const originHeader = req.headers.get('origin');
  const refererHeader = req.headers.get('referer');

  if (originHeader) {
    try {
      const originUrl = new URL(originHeader);
      if (hostHeader && originUrl.host.toLowerCase() !== hostHeader.toLowerCase()) {
        return {
          valid: false,
          status: 403,
          error: 'Cross-origin request rejected (CSRF protection)',
        };
      }
    } catch {
      return {
        valid: false,
        status: 403,
        error: 'Invalid origin header (CSRF protection)',
      };
    }
  } else if (refererHeader) {
    try {
      const refererUrl = new URL(refererHeader);
      if (hostHeader && refererUrl.host.toLowerCase() !== hostHeader.toLowerCase()) {
        return {
          valid: false,
          status: 403,
          error: 'Cross-origin referer rejected (CSRF protection)',
        };
      }
    } catch {
      return {
        valid: false,
        status: 403,
        error: 'Invalid referer header (CSRF protection)',
      };
    }
  }

  return { valid: true };
}
