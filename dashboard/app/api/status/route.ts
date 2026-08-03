import { NextRequest, NextResponse } from 'next/server';
import { ConfigError, describeError, getRoomService } from '@/lib/server-utils';
import type { CallAssessment, ScreeningAnswers, TranscriptLine } from '@/lib/screening';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Wire values from livekit_models.proto — kept local so this route does not
// depend on a transitive package.
const KIND_SIP = 3;
const KIND_AGENT = 4;
const STATE_ACTIVE = 2;

export type LiveStatus = 'connecting' | 'ringing' | 'connected' | 'completed';

/**
 * Pull the agent's screening answers out of the room metadata.
 *
 * The room is torn down shortly after the call ends and its metadata goes with
 * it, so the dashboard copies these into its own history the first time it sees
 * them. The agent deliberately keeps the line open for a few seconds after
 * submitting, which leaves several polls' worth of margin.
 */
function readRoomData(metadata: string | undefined): {
  screening: ScreeningAnswers | null;
  transcript: TranscriptLine[] | null;
  assessment: CallAssessment | null;
} {
  const empty = { screening: null, transcript: null, assessment: null };
  if (!metadata) return empty;
  try {
    const parsed = JSON.parse(metadata);
    return {
      screening: parsed?.screening ?? null,
      transcript: Array.isArray(parsed?.transcript) ? parsed.transcript : null,
      assessment: parsed?.assessment ?? null,
    };
  } catch {
    return empty;
  }
}

/**
 * Live state for one or more calls.
 *
 * GET /api/status?rooms=call-91...-ab12,call-91...-cd34
 *
 * A room that no longer exists means the call ended — LiveKit tears the room
 * down once every participant has left.
 */
export async function GET(request: NextRequest) {
  const roomsParam = request.nextUrl.searchParams.get('rooms');
  const wanted = (roomsParam || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  if (wanted.length === 0) {
    return NextResponse.json({ statuses: {} });
  }

  try {
    const roomService = getRoomService();
    const rooms = await roomService.listRooms(wanted);
    const live = new Map(rooms.map((r) => [r.name, r]));

    const statuses: Record<
      string,
      {
        status: LiveStatus;
        duration: number;
        participants: number;
        agentPresent: boolean;
        screening?: ScreeningAnswers | null;
        transcript?: TranscriptLine[] | null;
        assessment?: CallAssessment | null;
      }
    > = {};

    await Promise.all(
      wanted.map(async (name) => {
        const room = live.get(name);
        if (!room) {
          statuses[name] = {
            status: 'completed',
            duration: 0,
            participants: 0,
            agentPresent: false,
          };
          return;
        }

        let participants: Awaited<ReturnType<typeof roomService.listParticipants>> = [];
        try {
          participants = await roomService.listParticipants(name);
        } catch {
          // Room vanished between the two calls; treat as still connecting.
        }

        const sip = participants.find((p) => p.kind === KIND_SIP);
        const agentPresent = participants.some((p) => p.kind === KIND_AGENT);
        const answered = sip?.state === STATE_ACTIVE;

        const joinedAt = sip?.joinedAt ? Number(sip.joinedAt) : 0;
        const duration = answered && joinedAt ? Math.max(0, Math.floor(Date.now() / 1000) - joinedAt) : 0;

        statuses[name] = {
          status: !sip ? 'connecting' : answered ? 'connected' : 'ringing',
          duration,
          participants: participants.length,
          agentPresent,
          // The agent writes answers and the transcript back onto the room
          // metadata, so both arrive on this poll with no extra plumbing.
          ...readRoomData(room.metadata),
        };
      })
    );

    return NextResponse.json({ statuses });
  } catch (e) {
    if (e instanceof ConfigError) {
      return NextResponse.json({ error: e.message, missing: e.missing }, { status: 503 });
    }
    console.error('Status lookup failed:', e);
    return NextResponse.json({ error: describeError(e) }, { status: 502 });
  }
}
