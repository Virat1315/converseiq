import { NextResponse, type NextRequest } from 'next/server';
import { SESSION_COOKIE, authConfigured, authRequired, verifySession } from '@/lib/auth';

/**
 * Gate every page and API route behind the dashboard password.
 *
 * Deliberately fails CLOSED: a deployment with no DASHBOARD_PASSWORD set
 * refuses everything rather than serving an open dispatch endpoint. Leaving the
 * trunk reachable is worse than the site being unusable for a minute.
 */
export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // The login screen and its endpoint must stay reachable, or there is no way in.
  if (pathname.startsWith('/api/auth') || pathname === '/login') {
    return NextResponse.next();
  }

  if (!authRequired()) return NextResponse.next();

  const isApi = pathname.startsWith('/api');

  if (!authConfigured()) {
    const message =
      'This deployment has no DASHBOARD_PASSWORD set, so it is locked. ' +
      'Set it in your Vercel project settings and redeploy.';
    return isApi
      ? NextResponse.json({ error: message }, { status: 503 })
      : new NextResponse(message, { status: 503, headers: { 'content-type': 'text/plain' } });
  }

  if (await verifySession(request.cookies.get(SESSION_COOKIE)?.value)) {
    return NextResponse.next();
  }

  // 401 for the API so a stale tab surfaces the error instead of parsing an
  // HTML login page as JSON; a redirect for anything a human is looking at.
  if (isApi) {
    return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });
  }

  const login = request.nextUrl.clone();
  login.pathname = '/login';
  login.search = '';
  return NextResponse.redirect(login);
}

export const config = {
  // Everything except Next's own assets and the icon.
  matcher: ['/((?!_next/static|_next/image|icon.svg|favicon.ico).*)'],
};
