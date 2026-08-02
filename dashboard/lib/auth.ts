/**
 * Password gate for the dashboard.
 *
 * The API routes can spend real money — anyone who can POST to /api/dispatch
 * can place calls on the SIP trunk. Vercel's own password protection is a paid
 * feature, so the gate lives in the app and works on any plan.
 *
 * Web Crypto only: this runs in middleware on the Edge runtime, where node's
 * crypto module is unavailable.
 */

export const SESSION_COOKIE = 'converseiq_session';
const SESSION_TTL_MS = 12 * 60 * 60 * 1000; // 12h

/** True once a password is configured. Without one the deployment is closed. */
export function authConfigured(): boolean {
  return Boolean(process.env.DASHBOARD_PASSWORD);
}

/**
 * Local development stays open — the trunk is only reachable from your own
 * machine, and a password prompt on every `npm run dev` is friction with no
 * security benefit. Anything deployed is gated.
 */
export function authRequired(): boolean {
  return process.env.VERCEL === '1' || process.env.REQUIRE_AUTH === '1';
}

function signingSecret(): string {
  // AUTH_SECRET keeps sessions valid across a password change; falling back to
  // the password means changing it also logs everyone out, which is fine.
  return process.env.AUTH_SECRET || process.env.DASHBOARD_PASSWORD || '';
}

function base64url(bytes: ArrayBuffer): string {
  const b = String.fromCharCode(...new Uint8Array(bytes));
  return btoa(b).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function hmac(data: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  return base64url(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(data)));
}

/**
 * Constant-time comparison, so a wrong guess cannot be narrowed down by how
 * long the check took.
 *
 * Length is compared directly. A password's length is not the secret, and the
 * fixed delay on a failed login dominates any timing signal anyway.
 */
export function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** `<expiry>.<hmac>` — self-contained, so there is no session store to keep. */
export async function issueSession(): Promise<string> {
  const exp = String(Date.now() + SESSION_TTL_MS);
  return `${exp}.${await hmac(exp, signingSecret())}`;
}

export async function verifySession(token: string | undefined): Promise<boolean> {
  if (!token) return false;
  const dot = token.lastIndexOf('.');
  if (dot < 1) return false;

  const exp = token.slice(0, dot);
  const sig = token.slice(dot + 1);

  if (!/^\d+$/.test(exp) || Number(exp) < Date.now()) return false;

  const secret = signingSecret();
  if (!secret) return false;

  return safeEqual(sig, await hmac(exp, secret));
}

export const SESSION_MAX_AGE_SECONDS = SESSION_TTL_MS / 1000;
