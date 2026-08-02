/**
 * Phone helpers, shared by the browser and the API routes.
 *
 * Kept out of server-utils.ts because that module imports the LiveKit server
 * SDK, which must never be pulled into a client bundle.
 */

/** Default country code applied to bare local numbers from a spreadsheet. */
export const DEFAULT_COUNTRY_CODE = '91';

/**
 * Normalise to E.164, or null if it cannot be one.
 *
 * Spreadsheets are the messy case: Excel stores phone columns as numbers, so
 * "+91 98765 43210" arrives as 919876543210, and a 10-digit Indian mobile
 * arrives as 9876543210 with the country code silently dropped.
 */
export function normalizePhone(raw: string, defaultCc: string = DEFAULT_COUNTRY_CODE): string | null {
  if (!raw) return null;

  let s = String(raw).trim();

  // Excel renders large numbers in scientific notation (9.19877E+11).
  if (/^\d+(\.\d+)?e\+?\d+$/i.test(s)) {
    const n = Number(s);
    if (!Number.isFinite(n)) return null;
    s = n.toFixed(0);
  }

  const hadPlus = s.trim().startsWith('+');
  let digits = s.replace(/\D/g, '');
  if (!digits) return null;

  // 00 is the international prefix in much of the world.
  if (!hadPlus && digits.startsWith('00')) digits = digits.slice(2);

  // A bare local number: assume the default country.
  if (!hadPlus && digits.length <= 10) digits = defaultCc + digits;

  const candidate = `+${digits}`;
  return /^\+[1-9]\d{7,14}$/.test(candidate) ? candidate : null;
}

/**
 * Display form, e.g. +919876543210 -> +91 98765 43210.
 *
 * The country code is whatever precedes the last 10 digits. A greedy match on
 * the code instead splits +91 9876543210 as "+919 876543210".
 */
export function formatPhone(e164: string): string {
  const m = /^\+(\d+?)(\d{10})$/.exec(e164);
  if (!m) return e164;
  const [, cc, local] = m;
  return `+${cc} ${local.slice(0, 5)} ${local.slice(5)}`;
}
