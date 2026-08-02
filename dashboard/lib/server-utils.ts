import { AgentDispatchClient, RoomServiceClient, SipClient } from 'livekit-server-sdk';

/**
 * Must match `agent_name` in agent.py's WorkerOptions. Registering a worker
 * with an agent_name makes it explicit-dispatch only: it will never join a room
 * on its own, so every call has to request it by this exact name.
 */
export const AGENT_NAME = process.env.LIVEKIT_AGENT_NAME || 'outbound-caller';

/**
 * LiveKit clients are created lazily.
 *
 * They used to be constructed at module load, which threw during `next build`
 * (and on every cold start) whenever the environment was not fully configured.
 * On Vercel that meant a failed deployment instead of a dashboard that can tell
 * you which variables are missing.
 */

export class ConfigError extends Error {
  readonly missing: string[];

  constructor(missing: string[]) {
    const plural = missing.length > 1;
    super(
      `Missing environment variable${plural ? 's' : ''}: ${missing.join(', ')}. ` +
        `Set ${plural ? 'them' : 'it'} in dashboard/.env.local (locally) or in your Vercel project settings.`
    );
    this.name = 'ConfigError';
    this.missing = missing;
  }
}

const trunkIdFromEnv = () => process.env.VOBIZ_SIP_TRUNK_ID || process.env.OUTBOUND_TRUNK_ID;

/** Which of the required variables are present. Never throws. */
export function configStatus() {
  const required = {
    LIVEKIT_URL: process.env.LIVEKIT_URL,
    LIVEKIT_API_KEY: process.env.LIVEKIT_API_KEY,
    LIVEKIT_API_SECRET: process.env.LIVEKIT_API_SECRET,
  };

  const missingRequired = Object.entries(required)
    .filter(([, v]) => !v)
    .map(([k]) => k);
  const missingTelephony = trunkIdFromEnv() ? [] : ['VOBIZ_SIP_TRUNK_ID'];

  return {
    livekitReady: missingRequired.length === 0,
    telephonyReady: missingRequired.length === 0 && missingTelephony.length === 0,
    missingRequired,
    missingTelephony,
  };
}

function readCredentials() {
  const { missingRequired } = configStatus();
  if (missingRequired.length > 0) {
    throw new ConfigError(missingRequired);
  }
  return {
    url: process.env.LIVEKIT_URL!,
    apiKey: process.env.LIVEKIT_API_KEY!,
    apiSecret: process.env.LIVEKIT_API_SECRET!,
  };
}

let _roomService: RoomServiceClient | null = null;
let _sipClient: SipClient | null = null;
let _agentDispatch: AgentDispatchClient | null = null;

export function getRoomService(): RoomServiceClient {
  if (!_roomService) {
    const c = readCredentials();
    _roomService = new RoomServiceClient(c.url, c.apiKey, c.apiSecret);
  }
  return _roomService;
}

export function getSipClient(): SipClient {
  if (!_sipClient) {
    const c = readCredentials();
    _sipClient = new SipClient(c.url, c.apiKey, c.apiSecret);
  }
  return _sipClient;
}

export function getAgentDispatchClient(): AgentDispatchClient {
  if (!_agentDispatch) {
    const c = readCredentials();
    _agentDispatch = new AgentDispatchClient(c.url, c.apiKey, c.apiSecret);
  }
  return _agentDispatch;
}

/** The SIP trunk used for outbound calls. Throws a ConfigError if unset. */
export function getTrunkId(): string {
  const trunkId = trunkIdFromEnv();
  if (!trunkId) {
    throw new ConfigError(['VOBIZ_SIP_TRUNK_ID']);
  }
  return trunkId;
}

/** LiveKit room names allow a limited character set; keep them predictable. */
export function roomNameFor(phoneNumber: string): string {
  const digits = phoneNumber.replace(/[^0-9]/g, '');
  const suffix = Math.random().toString(36).slice(2, 8);
  return `call-${digits}-${suffix}`;
}

export function participantIdentityFor(phoneNumber: string): string {
  // agent.py reconstructs this exact identity to perform warm transfers,
  // so the `sip_<number>` shape must not change.
  return `sip_${phoneNumber}`;
}

// Re-exported so API routes keep a single import, while the browser can pull
// the same logic from lib/phone without dragging in the LiveKit server SDK.
export { normalizePhone } from './phone';

export interface DispatchOptions {
  phoneNumber: string;
  prompt?: string;
  callId?: string;
  /** "groq" | "openai" — read by agent.py from room metadata. */
  modelProvider?: string;
  /** TTS voice id, e.g. "alloy" or "anushka" — read by agent.py. */
  voiceId?: string;
  /** Candidate name, so the agent can greet them properly. */
  candidateName?: string;
  /**
   * The screening script built from the campaign criteria. Takes precedence
   * over `prompt` in agent.py — this is what keeps the bot on task.
   */
  screeningInstructions?: string;
}

export interface DispatchResult {
  phoneNumber: string;
  roomName: string;
  participantIdentity: string;
  sipCallId: string;
}

/**
 * Place one outbound call: create the room carrying the agent's instructions,
 * then invite the phone number into it over SIP.
 *
 * The agent worker (agent.py) picks the job up, reads `user_prompt` from the
 * room metadata, and starts talking once the callee answers.
 */
export async function dispatchCall(opts: DispatchOptions): Promise<DispatchResult> {
  const { phoneNumber, prompt, callId, modelProvider, voiceId, candidateName, screeningInstructions } =
    opts;

  // Report every missing variable at once — telling someone about the trunk id
  // only to fail again on the API key wastes a whole round trip.
  const { missingRequired, missingTelephony } = configStatus();
  if (missingRequired.length || missingTelephony.length) {
    throw new ConfigError([...missingRequired, ...missingTelephony]);
  }

  const trunkId = getTrunkId();
  const roomService = getRoomService();
  const sipClient = getSipClient();

  const roomName = roomNameFor(phoneNumber);
  const participantIdentity = participantIdentityFor(phoneNumber);

  const metadata = JSON.stringify({
    phone_number: phoneNumber,
    user_prompt: prompt || '',
    call_id: callId || roomName,
    model_provider: modelProvider,
    voice_id: voiceId,
    candidate_name: candidateName,
    screening_instructions: screeningInstructions,
    // We create the SIP participant below, so the agent must not dial as well —
    // otherwise the callee's phone rings twice for one requested call.
    agent_dials: false,
  });

  await roomService.createRoom({
    name: roomName,
    metadata,
    emptyTimeout: 60 * 5,
    maxParticipants: 3, // callee + agent + room for one transfer target
  });

  // Ask for the agent BEFORE dialling, so it is already in the room when the
  // callee answers. Skipping this is the classic "phone rings, then silence"
  // failure: the SIP leg connects and nothing is there to talk.
  try {
    await getAgentDispatchClient().createDispatch(roomName, AGENT_NAME, { metadata });
    // createDispatch only queues the request — the worker still has to accept
    // the job and connect, which takes several seconds on a cold process. Dial
    // before that and a quick pickup hears dead air.
    await waitForAgent(roomService, roomName);
  } catch (e) {
    // Don't dial into a room the agent can't join — the callee would answer to
    // dead air and we'd have spent a call for nothing.
    await roomService.deleteRoom(roomName).catch(() => {});
    throw new Error(
      `Could not put the "${AGENT_NAME}" agent on the call: ${describeError(e)}. ` +
        `Check that the agent worker is running (python agent.py start) and that its ` +
        `agent_name matches.`
    );
  }

  const info = await sipClient.createSipParticipant(trunkId, phoneNumber, roomName, {
    participantIdentity,
    participantName: 'Customer',
    participantMetadata: metadata,
  });

  return {
    phoneNumber,
    roomName,
    participantIdentity,
    sipCallId: info.sipCallId,
  };
}

/** Wire value from livekit_models.proto for ParticipantInfo_Kind.AGENT. */
const KIND_AGENT = 4;

/**
 * Block until the agent worker has actually joined the room.
 *
 * Throws if it never shows up, which is the honest outcome: either no worker is
 * running, or every worker is refusing jobs. Both mean the call would be silent.
 */
async function waitForAgent(
  roomService: RoomServiceClient,
  roomName: string,
  // A cold worker process measured ~10s to accept a job and connect, so a
  // 15s budget leaves almost no margin on a loaded machine.
  timeoutMs = 30_000,
  intervalMs = 500
): Promise<void> {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    try {
      const participants = await roomService.listParticipants(roomName);
      if (participants.some((p) => p.kind === KIND_AGENT)) return;
    } catch {
      // Room not queryable yet; keep waiting.
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }

  throw new Error(
    `no agent joined within ${timeoutMs / 1000}s. Start the worker with ` +
      `"python agent.py start", and if it is already running, check its log for ` +
      `"at full capacity" — that means machine load is above its threshold, so set ` +
      `LIVEKIT_LOAD_THRESHOLD=1.0`
  );
}

export function describeError(e: unknown): string {
  if (e instanceof Error) return e.message;
  return String(e);
}
