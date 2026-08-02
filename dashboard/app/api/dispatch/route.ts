import { NextResponse } from 'next/server';
import {
  ConfigError,
  describeError,
  dispatchCall,
  normalizePhone,
} from '@/lib/server-utils';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Place a single outbound call.
 *
 * Body: { to | phoneNumber, prompt?, callId?, modelProvider?, voiceId? }
 */
export async function POST(request: Request) {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Request body must be JSON' }, { status: 400 });
  }

  const raw = (body.to || body.phoneNumber) as string | undefined;
  if (!raw || typeof raw !== 'string') {
    return NextResponse.json({ error: 'Phone number is required' }, { status: 400 });
  }

  const phoneNumber = normalizePhone(raw);
  if (!phoneNumber) {
    return NextResponse.json(
      { error: `"${raw}" is not a valid phone number. Use international format, e.g. +919876543210.` },
      { status: 400 }
    );
  }

  try {
    const result = await dispatchCall({
      phoneNumber,
      prompt: body.prompt as string | undefined,
      callId: body.callId as string | undefined,
      modelProvider: body.modelProvider as string | undefined,
      voiceId: body.voiceId as string | undefined,
      candidateName: body.candidateName as string | undefined,
      screeningInstructions: body.screeningInstructions as string | undefined,
    });

    return NextResponse.json({
      success: true,
      phoneNumber: result.phoneNumber,
      roomName: result.roomName,
      dispatchId: result.sipCallId,
      participantIdentity: result.participantIdentity,
      callId: (body.callId as string) || result.roomName,
    });
  } catch (e) {
    if (e instanceof ConfigError) {
      // 503, not 500: the request was fine, the deployment is not configured.
      return NextResponse.json({ error: e.message, missing: e.missing }, { status: 503 });
    }
    console.error('Dispatch failed:', e);
    return NextResponse.json({ error: describeError(e) }, { status: 502 });
  }
}
