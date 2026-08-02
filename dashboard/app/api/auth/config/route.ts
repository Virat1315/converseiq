import { NextResponse } from 'next/server';
import { authConfigured, usernameRequired } from '@/lib/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * What the login form should ask for.
 *
 * Reachable without a session — it has to be, since the login page renders
 * before one exists. It returns only whether a username is expected, never the
 * username itself or anything else.
 */
export async function GET() {
  return NextResponse.json({
    usernameRequired: usernameRequired(),
    authConfigured: authConfigured(),
  });
}
