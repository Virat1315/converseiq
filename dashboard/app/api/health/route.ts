import { NextResponse } from 'next/server';
import { configStatus } from '@/lib/server-utils';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * What this deployment can actually do right now.
 *
 * The dashboard calls this on load so it can show a precise setup banner
 * instead of letting the first call fail with a generic error. Only variable
 * *names* are returned — never any values.
 */
export async function GET() {
  const status = configStatus();

  return NextResponse.json({
    ...status,
    // Non-secret hints the setup panel can display.
    livekitHost: process.env.LIVEKIT_URL ? new URL(process.env.LIVEKIT_URL).host : null,
    outboundNumber: process.env.VOBIZ_OUTBOUND_NUMBER || null,
    transferNumber: process.env.DEFAULT_TRANSFER_NUMBER || null,
  });
}
