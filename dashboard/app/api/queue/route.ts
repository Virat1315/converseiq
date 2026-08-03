import { NextResponse } from 'next/server';
import {
  ComplianceError,
  ConfigError,
  describeError,
  dispatchCall,
  normalizePhone,
} from '@/lib/server-utils';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Serverless functions have a hard wall-clock limit; keep batches inside it. */
const MAX_BATCH = 50;
const GAP_MS = 250;

/**
 * Dispatch a batch of outbound calls.
 *
 * Body: { numbers: string[], prompt?, modelProvider?, voiceId? }
 *
 * Numbers are dialled sequentially with a short gap so the SIP trunk is not
 * flooded. A failure on one number does not abort the rest of the batch.
 */
export async function POST(request: Request) {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Request body must be JSON' }, { status: 400 });
  }

  // Accepts plain numbers, or { phone, name } candidate objects from an import.
  const numbers = body.numbers;
  if (!Array.isArray(numbers) || numbers.length === 0) {
    return NextResponse.json({ error: 'A non-empty list of phone numbers is required' }, { status: 400 });
  }
  if (numbers.length > MAX_BATCH) {
    return NextResponse.json(
      { error: `Batch too large: ${numbers.length} numbers. Split into batches of ${MAX_BATCH} or fewer.` },
      { status: 400 }
    );
  }

  const results: Array<{
    phoneNumber: string;
    name?: string;
    status: 'dispatched' | 'failed';
    roomName?: string;
    id?: string;
    error?: string;
  }> = [];

  for (const entry of numbers) {
    const isObject = entry && typeof entry === 'object';
    const raw = String(isObject ? (entry as Record<string, unknown>).phone ?? '' : entry);
    const name = isObject ? ((entry as Record<string, unknown>).name as string | undefined) : undefined;
    const phoneNumber = normalizePhone(raw);

    if (!phoneNumber) {
      results.push({ phoneNumber: raw, name, status: 'failed', error: 'Invalid phone number format' });
      continue;
    }

    try {
      const result = await dispatchCall({
        phoneNumber,
        prompt: body.prompt as string | undefined,
        modelProvider: body.modelProvider as string | undefined,
        voiceId: body.voiceId as string | undefined,
        candidateName: name,
        screeningInstructions: body.screeningInstructions as string | undefined,
      });
      results.push({
        phoneNumber,
        name,
        status: 'dispatched',
        roomName: result.roomName,
        id: result.sipCallId,
      });
    } catch (e) {
      if (e instanceof ConfigError) {
        // Nothing in the batch can succeed; fail fast rather than N times.
        return NextResponse.json({ error: e.message, missing: e.missing }, { status: 503 });
      }
      if (e instanceof ComplianceError) {
        // A closed calling window applies to the whole batch, but a suppressed
        // number is specific to one entry — only the former should abort.
        if (!e.message.includes('do-not-call')) {
          return NextResponse.json({ error: e.message, compliance: true }, { status: 403 });
        }
        results.push({ phoneNumber, name, status: 'failed', error: e.message });
        continue;
      }
      console.error(`Failed to dispatch ${phoneNumber}:`, e);
      results.push({ phoneNumber, name, status: 'failed', error: describeError(e) });
    }

    await new Promise((r) => setTimeout(r, GAP_MS));
  }

  const dispatched = results.filter((r) => r.status === 'dispatched').length;

  return NextResponse.json({
    success: true,
    message: `Dispatched ${dispatched} of ${numbers.length} calls`,
    dispatched,
    total: numbers.length,
    results,
  });
}
