import { NextResponse } from 'next/server';
import {
  SESSION_COOKIE,
  SESSION_MAX_AGE_SECONDS,
  authConfigured,
  issueSession,
  safeEqual,
} from '@/lib/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Slows down anyone walking a password list. */
const WRONG_PASSWORD_DELAY_MS = 700;

export async function POST(request: Request) {
  if (!authConfigured()) {
    return NextResponse.json(
      { error: 'No DASHBOARD_PASSWORD is set on this deployment.' },
      { status: 503 }
    );
  }

  let password: string | undefined;
  let username: string | undefined;
  try {
    ({ password, username } = await request.json());
  } catch {
    return NextResponse.json({ error: 'Request body must be JSON' }, { status: 400 });
  }

  const expectedUser = process.env.DASHBOARD_USERNAME;
  const userOk = !expectedUser || safeEqual(username ?? '', expectedUser);
  const passOk = Boolean(password) && safeEqual(password!, process.env.DASHBOARD_PASSWORD!);

  // Both are checked before answering, and the message never says which half
  // was wrong — otherwise a valid username can be confirmed by guessing.
  if (!userOk || !passOk) {
    await new Promise((r) => setTimeout(r, WRONG_PASSWORD_DELAY_MS));
    return NextResponse.json(
      { error: expectedUser ? 'Incorrect username or password.' : 'Incorrect password.' },
      { status: 401 }
    );
  }

  const response = NextResponse.json({ success: true });
  response.cookies.set(SESSION_COOKIE, await issueSession(), {
    httpOnly: true, // Not readable from JS, so an XSS cannot lift the session.
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_MAX_AGE_SECONDS,
  });
  return response;
}
