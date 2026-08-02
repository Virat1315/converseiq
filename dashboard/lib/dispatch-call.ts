'use client';

import { callStore, type CallRecord } from './call-store';
import { buildAgentInstructions, type CampaignCriteria } from './screening';

/**
 * Place one screening call and record it.
 *
 * Shared by the Candidates panel and the "Call again" button in Results, so a
 * redial is identical to a first attempt — same script, same campaign, same
 * history shape.
 */
export interface DispatchArgs {
  name: string;
  phone: string;
  criteria: CampaignCriteria;
  voiceId: string;
  modelProvider: string;
}

export interface DispatchOutcome {
  record: CallRecord;
  ok: boolean;
  error?: string;
  /** True when the failure will repeat for every candidate — stop the batch. */
  fatal?: boolean;
}

export async function dispatchScreeningCall(args: DispatchArgs): Promise<DispatchOutcome> {
  const { name, phone, criteria, voiceId, modelProvider } = args;

  // Imported rows with no name column fall back to the phone number. Pass
  // undefined rather than let the agent read a phone number out loud.
  const spokenName = name === phone ? undefined : name;
  const screeningInstructions = buildAgentInstructions(criteria, spokenName);

  const record = callStore.add({
    name,
    phone,
    prompt: screeningInstructions,
    status: 'pending',
    voiceId,
    modelProvider,
  });

  try {
    const res = await fetch('/api/dispatch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        to: phone,
        callId: record.id,
        candidateName: spokenName,
        screeningInstructions,
        voiceId,
        modelProvider,
      }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || `Dispatch failed (${res.status})`);

    callStore.update(record.id, {
      status: 'connecting',
      roomName: data.roomName,
      dispatchId: data.dispatchId,
    });

    return { record, ok: true };
  } catch (e) {
    const error = e instanceof Error ? e.message : 'Dispatch failed';
    callStore.update(record.id, { status: 'failed', error });
    // A misconfigured deployment fails identically for everyone left in the
    // queue — no point generating forty copies of the same message.
    return { record, ok: false, error, fatal: error.includes('Missing environment variable') };
  }
}
