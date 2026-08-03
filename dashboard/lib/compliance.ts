/**
 * Guards that run before any number is dialled.
 *
 * India's TRAI rules restrict unsolicited commercial calls: they must not go to
 * numbers on the DND registry, and are limited to daytime hours. Nothing in the
 * dashboard previously stopped a 2am campaign, and a suppression list is the
 * only way to honour "do not call me again" once someone says it.
 *
 * These are enforced in the dispatch path, not the UI, so an API client cannot
 * skip them.
 */

export interface CallingWindow {
  /** Inclusive start hour, 0-23, in the window's timezone. */
  startHour: number;
  /** Exclusive end hour, 0-23. */
  endHour: number;
  /** IANA zone the hours are interpreted in. */
  timeZone: string;
  /** 0=Sunday. Days on which calling is allowed at all. */
  days: number[];
}

/**
 * TRAI's permitted window for commercial calls is 09:00-21:00. Defaulting
 * tighter than the legal maximum is deliberate: 9pm calls about a job are
 * legal and still a bad idea.
 */
export const DEFAULT_WINDOW: CallingWindow = {
  startHour: 9,
  endHour: 20,
  timeZone: 'Asia/Kolkata',
  days: [1, 2, 3, 4, 5, 6], // Mon-Sat
};

export function callingWindow(): CallingWindow {
  const parseHour = (v: string | undefined, fallback: number) => {
    const n = Number(v);
    return Number.isInteger(n) && n >= 0 && n <= 23 ? n : fallback;
  };
  // Drop blanks BEFORE converting: Number('') is 0, not NaN, so an unset
  // CALLING_DAYS would otherwise parse to [0] — Sunday only — and quietly
  // block every call for six days a week.
  const days = (process.env.CALLING_DAYS || '')
    .split(',')
    .map((d) => d.trim())
    .filter(Boolean)
    .map(Number)
    .filter((d) => Number.isInteger(d) && d >= 0 && d <= 6);

  return {
    startHour: parseHour(process.env.CALLING_START_HOUR, DEFAULT_WINDOW.startHour),
    endHour: parseHour(process.env.CALLING_END_HOUR, DEFAULT_WINDOW.endHour),
    timeZone: process.env.CALLING_TIMEZONE || DEFAULT_WINDOW.timeZone,
    days: days.length ? days : DEFAULT_WINDOW.days,
  };
}

/** Hour and weekday right now in the window's timezone. */
export function localNow(window: CallingWindow, now = new Date()): { hour: number; day: number } {
  // Intl is the only way to get another zone's wall clock without a tz library,
  // and it handles DST for zones that observe it.
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: window.timeZone,
    hour: 'numeric',
    hour12: false,
    weekday: 'short',
  }).formatToParts(now);

  const hour = Number(parts.find((p) => p.type === 'hour')?.value ?? '0');
  const weekday = parts.find((p) => p.type === 'weekday')?.value ?? 'Sun';
  const day = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(weekday);

  // Intl renders midnight as 24 in some environments.
  return { hour: hour === 24 ? 0 : hour, day: day === -1 ? 0 : day };
}

export interface WindowCheck {
  allowed: boolean;
  reason?: string;
  /** Local time used for the decision, for the message. */
  localHour: number;
}

export function checkCallingWindow(now = new Date()): WindowCheck {
  const w = callingWindow();

  if (process.env.IGNORE_CALLING_HOURS === '1') {
    return { allowed: true, localHour: localNow(w, now).hour };
  }

  const { hour, day } = localNow(w, now);

  if (!w.days.includes(day)) {
    const names = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    return {
      allowed: false,
      localHour: hour,
      reason: `Calling is not permitted on ${names[day]} (${w.timeZone}). Adjust CALLING_DAYS to change this.`,
    };
  }

  if (hour < w.startHour || hour >= w.endHour) {
    return {
      allowed: false,
      localHour: hour,
      reason:
        `It is ${String(hour).padStart(2, '0')}:00 in ${w.timeZone}. Calls are only placed between ` +
        `${String(w.startHour).padStart(2, '0')}:00 and ${String(w.endHour).padStart(2, '0')}:00. ` +
        `Set IGNORE_CALLING_HOURS=1 to override.`,
    };
  }

  return { allowed: true, localHour: hour };
}

// ---------------------------------------------------------------------------
// Suppression list
// ---------------------------------------------------------------------------

/**
 * Numbers never to call, from DO_NOT_CALL (comma or newline separated).
 *
 * Matching is on digits only, so the list tolerates whatever format it was
 * pasted in.
 */
function suppressionSet(): Set<string> {
  const raw = process.env.DO_NOT_CALL || '';
  return new Set(
    raw
      .split(/[\n,;]+/)
      .map((s) => s.replace(/\D/g, ''))
      .filter(Boolean)
  );
}

export function isSuppressed(e164: string): boolean {
  const digits = e164.replace(/\D/g, '');
  if (!digits) return false;

  const list = suppressionSet();
  if (list.has(digits)) return true;

  // A list entry without a country code should still match the full number,
  // and vice versa — people paste 10-digit mobiles.
  for (const entry of list) {
    if (entry.length >= 7 && (digits.endsWith(entry) || entry.endsWith(digits))) return true;
  }
  return false;
}

export function suppressionCount(): number {
  return suppressionSet().size;
}
