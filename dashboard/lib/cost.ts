/**
 * Rough per-call cost, so "what does screening 200 people cost?" has an answer.
 *
 * Four providers bill separately and none of them shows up in this dashboard,
 * which makes the economics invisible until the invoice arrives. These are
 * published list prices, not metered usage — treat the number as an estimate,
 * and override the rates when your contracts differ.
 */

export interface Rates {
  /** Telephony, per minute. */
  sipPerMin: number;
  /** Speech-to-text, per minute. */
  sttPerMin: number;
  /** Text-to-speech, per minute of speech. */
  ttsPerMin: number;
  /** LLM, per call. Screening turns are short and bounded, so per-call is
   *  closer than per-token guesswork. */
  llmPerCall: number;
  /** LiveKit participant minutes. */
  livekitPerMin: number;
  currency: string;
  /** Multiplier from USD, for display. */
  fxToDisplay: number;
}

/**
 * Defaults in INR, since the trunk and voices here are Indian. Figures are
 * order-of-magnitude: Vobiz-style domestic termination, Deepgram nova pay-as-you-go,
 * Sarvam TTS, Groq Llama 3.3, LiveKit Cloud.
 */
export const DEFAULT_RATES: Rates = {
  sipPerMin: 0.6,
  sttPerMin: 0.36,
  ttsPerMin: 1.2,
  llmPerCall: 0.15,
  livekitPerMin: 0.25,
  currency: '₹',
  fxToDisplay: 1,
};

export interface CostBreakdown {
  total: number;
  currency: string;
  parts: Array<{ label: string; amount: number }>;
  /** Minutes billed — telephony rounds up, so 61s costs two minutes. */
  billedMinutes: number;
}

export function estimateCallCost(durationSeconds: number, rates: Rates = DEFAULT_RATES): CostBreakdown {
  // No connection, no charge: an unanswered call has no billable leg here.
  if (!durationSeconds || durationSeconds <= 0) {
    return { total: 0, currency: rates.currency, parts: [], billedMinutes: 0 };
  }

  const billedMinutes = Math.ceil(durationSeconds / 60);
  // The agent speaks for roughly a third of a screening call; the rest is the
  // candidate talking or silence, which TTS is not billed for.
  const speakingMinutes = (durationSeconds / 60) * 0.35;

  const parts = [
    { label: 'Telephony', amount: billedMinutes * rates.sipPerMin },
    { label: 'Transcription', amount: (durationSeconds / 60) * rates.sttPerMin },
    { label: 'Voice', amount: speakingMinutes * rates.ttsPerMin },
    { label: 'Model', amount: rates.llmPerCall },
    { label: 'LiveKit', amount: (durationSeconds / 60) * rates.livekitPerMin },
  ].map((p) => ({ ...p, amount: Math.round(p.amount * 100) / 100 }));

  return {
    total: Math.round(parts.reduce((s, p) => s + p.amount, 0) * 100) / 100,
    currency: rates.currency,
    parts,
    billedMinutes,
  };
}

export function formatMoney(amount: number, currency = DEFAULT_RATES.currency): string {
  return `${currency}${amount.toFixed(2)}`;
}
