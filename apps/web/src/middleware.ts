import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export const SESSION_COOKIE_NAME = 'elder_care_session';

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Protected paths that require an active session
  const isProtectedPath =
    pathname.startsWith('/senior') ||
    pathname.startsWith('/dashboard') ||
    pathname.startsWith('/profiles');

  // Emergency medical pathways are strictly exempted for emergency responders / offline card access
  // Matches exactly /profiles/[id]/emergency (no nested sub-routes) and /api/emergency
  const isEmergencyPath =
    /^\/profiles\/[^/]+\/emergency$/.test(pathname) ||
    pathname.startsWith('/api/emergency');

  if (isProtectedPath && !isEmergencyPath) {
    const sessionCookie = request.cookies.get(SESSION_COOKIE_NAME);
    if (!sessionCookie || !sessionCookie.value) {
      const loginUrl = new URL('/login', request.url);
      loginUrl.searchParams.set('redirect', pathname);
      return NextResponse.redirect(loginUrl);
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/senior/:path*',
    '/dashboard/:path*',
    '/profiles/:path*',
  ],
};
