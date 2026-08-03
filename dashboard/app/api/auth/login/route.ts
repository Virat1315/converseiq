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

/**
 * Per-IP throttle.
 *
 * Best effort only: serverless instances do not share memory, so a distributed
 * attacker gets one budget per warm instance. It still turns a fast local
 * script into a slow one, which is the common case. A shared store (Upstash,
 * Redis) is the real fix once this guards anything valuable.
 */
const MAX_ATTEMPTS = 8;
const WINDOW_MS = 5 * 60 * 1000;
const attempts = new Map<string, { count: number; resetAt: number }>();

function rateLimit(ip: string): { allowed: boolean; retryAfterSec: number } {
  const now = Date.now();
  const entry = attempts.get(ip);

  if (!entry || now > entry.resetAt) {
    attempts.set(ip, { count: 1, resetAt: now + WINDOW_MS });
    // Opportunistic cleanup — no timer, and the map cannot grow unbounded.
    if (attempts.size > 5000) {
      for (const [k, v] of attempts) if (now > v.resetAt) attempts.delete(k);
    }
    return { allowed: true, retryAfterSec: 0 };
  }

  entry.count += 1;
  return {
    allowed: entry.count <= MAX_ATTEMPTS,
    retryAfterSec: Math.ceil((entry.resetAt - now) / 1000),
  };
}

function clientIp(request: Request): string {
  const fwd = request.headers.get('x-forwarded-for');
  return fwd?.split(',')[0].trim() || request.headers.get('x-real-ip') || 'unknown';
}

export async function POST(request: Request) {
  if (!authConfigured()) {
    return NextResponse.json(
      { error: 'No DASHBOARD_PASSWORD is set on this deployment.' },
      { status: 503 }
    );
  }

  const limit = rateLimit(clientIp(request));
  if (!limit.allowed) {
    return NextResponse.json(
      { error: `Too many attempts. Try again in ${limit.retryAfterSec}s.` },
      { status: 429, headers: { 'Retry-After': String(limit.retryAfterSec) } }
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
