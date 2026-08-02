import { NextResponse } from 'next/server';
import { ConfigError, describeError, getRoomService } from '@/lib/server-utils';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * End a call in progress.
 *
 * Body: { roomName }
 *
 * Deleting the room disconnects the agent and the SIP leg, which hangs up the
 * phone. Deleting an already-gone room is a no-op, so this is safe to retry.
 */
export async function POST(request: Request) {
  let roomName: string | undefined;
  try {
    ({ roomName } = await request.json());
  } catch {
    return NextResponse.json({ error: 'Request body must be JSON' }, { status: 400 });
  }

  if (!roomName) {
    return NextResponse.json({ error: 'roomName is required' }, { status: 400 });
  }

  try {
    await getRoomService().deleteRoom(roomName);
    return NextResponse.json({ success: true, roomName });
  } catch (e) {
    if (e instanceof ConfigError) {
      return NextResponse.json({ error: e.message, missing: e.missing }, { status: 503 });
    }
    console.error('Hangup failed:', e);
    return NextResponse.json({ error: describeError(e) }, { status: 502 });
  }
}
