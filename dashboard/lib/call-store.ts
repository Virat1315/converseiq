'use client';

/**
 * Call history, stored in the browser.
 *
 * This replaces the old filesystem-backed /api/calls route. Vercel's
 * serverless filesystem is read-only and per-invocation, so writing
 * data/calls.json silently lost every record in production. Keeping history in
 * localStorage makes the dashboard work identically on Vercel, on a VPS and on
 * localhost with no database to provision.
 *
 * Live state (ringing / connected / duration) is *not* stored here — it is read
 * from LiveKit via /api/status, which is the only source that can't go stale.
 */

import type { CampaignCriteria, ScreeningAnswers, TranscriptLine } from './screening';

export type CallStatus = 'pending' | 'connecting' | 'ringing' | 'connected' | 'completed' | 'failed';

export interface CallRecord {
  id: string;
  /** Candidate name where known, otherwise the number. */
  name?: string;
  phone: string;
  prompt: string;
  status: CallStatus;
  timestamp: string;
  roomName?: string;
  dispatchId?: string;
  voiceId?: string;
  modelProvider?: string;
  duration?: number;
  error?: string;
  /**
   * Captured by the agent during the call. Copied here from the room metadata
   * on the first poll that sees it — the room is deleted shortly afterwards and
   * takes its metadata with it.
   */
  answers?: ScreeningAnswers | null;
  /** What was actually said, copied across on the poll that first sees it. */
  transcript?: TranscriptLine[] | null;
}

const STORAGE_KEY = 'converseiq.calls.v1';
const MAX_RECORDS = 200;

/** Fired after any mutation so open components re-render. */
const CHANGE_EVENT = 'converseiq:calls-changed';

function read(): CallRecord[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    // Corrupted or unavailable storage (private mode) — degrade to empty.
    return [];
  }
}

function write(calls: CallRecord[]) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(calls.slice(0, MAX_RECORDS)));
  } catch {
    // Quota exceeded — history is a convenience, never block a call on it.
  }
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

export const callStore = {
  list(): CallRecord[] {
    return read();
  },

  add(record: Omit<CallRecord, 'id' | 'timestamp'> & Partial<Pick<CallRecord, 'id' | 'timestamp'>>): CallRecord {
    const full: CallRecord = {
      id: record.id ?? `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      timestamp: record.timestamp ?? new Date().toISOString(),
      ...record,
    } as CallRecord;

    write([full, ...read()]);
    return full;
  },

  update(id: string, updates: Partial<CallRecord>) {
    const calls = read();
    const i = calls.findIndex((c) => c.id === id);
    if (i === -1) return;
    calls[i] = { ...calls[i], ...updates };
    write(calls);
  },

  remove(id: string) {
    write(read().filter((c) => c.id !== id));
  },

  clear() {
    write([]);
  },

  /** Rooms worth polling /api/status for. */
  activeRooms(): string[] {
    return read()
      .filter((c) => c.roomName && c.status !== 'completed' && c.status !== 'failed')
      .map((c) => c.roomName!);
  },

  subscribe(fn: () => void): () => void {
    if (typeof window === 'undefined') return () => {};
    window.addEventListener(CHANGE_EVENT, fn);
    // 'storage' fires when another tab writes; keeps duplicate tabs in sync.
    window.addEventListener('storage', fn);
    return () => {
      window.removeEventListener(CHANGE_EVENT, fn);
      window.removeEventListener('storage', fn);
    };
  },

};

// ---------------------------------------------------------------------------
// Campaign criteria — the scoring rules, kept beside the call history so a
// reload doesn't reset them mid-campaign.
// ---------------------------------------------------------------------------

const CRITERIA_KEY = 'converseiq.criteria.v1';

/**
 * Exposed through useSyncExternalStore, so `cached` must keep the SAME object
 * reference until something actually changes — returning a fresh object from
 * getSnapshot on every call makes React re-render forever.
 */
let cached: CampaignCriteria | null = null;
const listeners = new Set<() => void>();

export const criteriaStore = {
  /** Server render: always the defaults, so client and server markup agree. */
  getServerSnapshot(fallback: CampaignCriteria): CampaignCriteria {
    return fallback;
  },

  getSnapshot(fallback: CampaignCriteria): CampaignCriteria {
    if (cached) return cached;
    let loaded: CampaignCriteria;
    try {
      const raw = window.localStorage.getItem(CRITERIA_KEY);
      // Merge over the fallback so a field added in a later version isn't
      // undefined for someone with older saved settings.
      loaded = raw ? { ...fallback, ...JSON.parse(raw) } : fallback;
    } catch {
      loaded = fallback;
    }
    cached = loaded;
    return loaded;
  },

  save(criteria: CampaignCriteria) {
    cached = criteria;
    try {
      window.localStorage.setItem(CRITERIA_KEY, JSON.stringify(criteria));
    } catch {
      // Storage unavailable; the in-memory value still drives this session.
    }
    listeners.forEach((fn) => fn());
  },

  subscribe(fn: () => void): () => void {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },
};

/** Shared CSV escaping — Excel needs doubled quotes, not backslashes. */
export function toCsv(header: string[], rows: unknown[][]): string {
  const escape = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  return [header.map(escape).join(','), ...rows.map((r) => r.map(escape).join(','))].join('\n');
}

export function downloadCsv(filename: string, csv: string) {
  // The BOM makes Excel read it as UTF-8 instead of the local codepage.
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
