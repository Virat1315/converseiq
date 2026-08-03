/**
 * Options offered in the dashboard, mirroring what agent.py accepts.
 *
 * agent.py reads `model_provider` and `voice_id` from the room metadata:
 * `_build_tts()` switches to Sarvam automatically for the Indian voices, and
 * `_build_llm()` switches to Groq when the provider is "groq".
 */

export interface VoiceOption {
  id: string;
  label: string;
  provider: 'openai' | 'sarvam';
  /** Extra API key this voice needs beyond the LiveKit basics. */
  requiresKey: 'OPENAI_API_KEY' | 'SARVAM_API_KEY';
}

export const VOICES: VoiceOption[] = [
  { id: 'anushka', label: 'Anushka — Indian English/Hindi', provider: 'sarvam', requiresKey: 'SARVAM_API_KEY' },
  { id: 'aravind', label: 'Aravind — Indian English/Hindi', provider: 'sarvam', requiresKey: 'SARVAM_API_KEY' },
  { id: 'alloy', label: 'Alloy — neutral, US', provider: 'openai', requiresKey: 'OPENAI_API_KEY' },
  { id: 'echo', label: 'Echo — warm, US', provider: 'openai', requiresKey: 'OPENAI_API_KEY' },
  { id: 'shimmer', label: 'Shimmer — bright, US', provider: 'openai', requiresKey: 'OPENAI_API_KEY' },
];

export interface ModelOption {
  id: string;
  label: string;
  hint: string;
}

export const MODELS: ModelOption[] = [
  { id: 'groq', label: 'Groq — Llama 3.3 70B', hint: 'Fastest responses. Needs GROQ_API_KEY.' },
  { id: 'openai', label: 'OpenAI — GPT-4o mini', hint: 'Most consistent. Needs OPENAI_API_KEY.' },
];

// Default to the Sarvam voice + Groq model, the pair that needs no OpenAI key.
export const DEFAULT_VOICE = 'anushka';
export const DEFAULT_MODEL = 'groq';

/**
 * Sarvam speaks far more than Hindi. The agent asks which the candidate
 * prefers, so this sets what it offers as the alternative to English.
 */
export interface LanguageOption {
  /** BCP-47 tag Sarvam expects as target_language_code. */
  id: string;
  label: string;
}

export const LANGUAGES: LanguageOption[] = [
  { id: 'hi-IN', label: 'Hindi' },
  { id: 'en-IN', label: 'English only' },
  { id: 'ta-IN', label: 'Tamil' },
  { id: 'te-IN', label: 'Telugu' },
  { id: 'bn-IN', label: 'Bengali' },
  { id: 'mr-IN', label: 'Marathi' },
  { id: 'gu-IN', label: 'Gujarati' },
  { id: 'kn-IN', label: 'Kannada' },
  { id: 'ml-IN', label: 'Malayalam' },
  { id: 'pa-IN', label: 'Punjabi' },
];

export const DEFAULT_LANGUAGE = 'hi-IN';

export function languageLabel(id: string): string {
  return LANGUAGES.find((l) => l.id === id)?.label ?? id;
}

export const DEFAULT_PROMPT =
  'You are calling about a Product Manager opening. Introduce yourself, ask if they are interested, ' +
  'and offer to collect their email for follow-up.';

/** Ready-made prompts so a first-time user has something to click. */
export const PROMPT_PRESETS: Array<{ name: string; prompt: string }> = [
  {
    name: 'Recruiting outreach',
    prompt: DEFAULT_PROMPT,
  },
  {
    name: 'Appointment reminder',
    prompt:
      'You are calling to remind the customer about their appointment tomorrow. Confirm whether they can still ' +
      'make it, and offer to reschedule if not.',
  },
  {
    name: 'Post-purchase survey',
    prompt:
      'You are calling to ask about a recent purchase. Ask how satisfied they were on a scale of one to five, ' +
      'and what would have made the experience better. Keep it under a minute.',
  },
  {
    name: 'Lead qualification',
    prompt:
      'You are calling a new inbound lead. Find out what problem they are trying to solve, their team size, ' +
      'and their timeline. If they are a good fit, offer to book a call with sales.',
  },
];
