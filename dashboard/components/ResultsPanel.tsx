'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { ChevronDown, Download, PhoneOff, RotateCw, Trash2 } from 'lucide-react';
import { callStore, downloadCsv, toCsv, type CallRecord, type CallStatus } from '@/lib/call-store';
import { dispatchScreeningCall } from '@/lib/dispatch-call';
import { DEFAULT_MODEL, DEFAULT_VOICE } from '@/lib/agent-options';
import {
  QUESTIONS,
  VERDICT_LABEL,
  rankCandidates,
  type CampaignCriteria,
  type ScreeningAnswers,
} from '@/lib/screening';
import { formatPhone } from '@/lib/phone';
import { Button, Card, EmptyState } from '@/components/ui';

const POLL_MS = 3000;

export default function ResultsPanel({ criteria }: { criteria: CampaignCriteria }) {
  const [calls, setCalls] = useState<CallRecord[]>([]);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [redialing, setRedialing] = useState<string | null>(null);
  const [redialError, setRedialError] = useState('');

  useEffect(() => {
    const sync = () => setCalls(callStore.list());
    sync();
    return callStore.subscribe(sync);
  }, []);

  const activeRooms = useMemo(
    () =>
      calls
        .filter((c) => c.roomName && c.status !== 'completed' && c.status !== 'failed')
        .map((c) => c.roomName!),
    [calls]
  );

  const roomsKey = activeRooms.join(',');

  const poll = useCallback(async (rooms: string) => {
    if (!rooms) return;
    try {
      const res = await fetch(`/api/status?rooms=${encodeURIComponent(rooms)}`);
      if (!res.ok) return;
      const { statuses } = (await res.json()) as {
        statuses: Record<
          string,
          { status: CallStatus; duration: number; screening?: ScreeningAnswers | null }
        >;
      };

      for (const call of callStore.list()) {
        const live = call.roomName ? statuses[call.roomName] : undefined;
        if (!live) continue;

        const updates: Partial<CallRecord> = {};

        // Copy answers across the moment they appear — the room is deleted
        // seconds later and its metadata goes with it.
        if (live.screening && !call.answers) updates.answers = live.screening;

        if (live.status === 'completed' && call.status === 'connecting') {
          updates.status = 'failed';
          updates.error = 'Ended before connecting. Check the agent worker is running.';
        } else if (live.status !== call.status) {
          updates.status = live.status;
        }
        if (live.duration && live.duration !== call.duration) updates.duration = live.duration;

        if (Object.keys(updates).length) callStore.update(call.id, updates);
      }
    } catch {
      // Next tick catches up.
    }
  }, []);

  useEffect(() => {
    if (!roomsKey) return;
    poll(roomsKey);
    const t = setInterval(() => poll(roomsKey), POLL_MS);
    return () => clearInterval(t);
  }, [roomsKey, poll]);

  const ranked = useMemo(() => rankCandidates(calls, criteria), [calls, criteria]);

  const summary = useMemo(() => {
    const screened = ranked.filter((r) => r.answers);
    return {
      total: ranked.length,
      screened: screened.length,
      strong: screened.filter((r) => r.score.verdict === 'strong').length,
      declined: screened.filter((r) => r.score.verdict === 'declined').length,
      inFlight: ranked.filter(
        (r) => r.status === 'connecting' || r.status === 'ringing' || r.status === 'connected'
      ).length,
    };
  }, [ranked]);

  const exportCsv = () => {
    const header = [
      'rank',
      'name',
      'phone',
      'score',
      'verdict',
      'status',
      ...QUESTIONS.filter((q) => criteria.questions.includes(q.id)).map((q) => q.label),
      'skills_matched',
      'skills_missing',
      'notes',
      'duration_seconds',
      'called_at',
    ];
    const rows = ranked.map((r) => [
      // Unscreened candidates sort last but aren't ranked, matching the table.
      r.answers ? r.rank : '',
      r.name ?? '',
      r.phone,
      r.score.total,
      VERDICT_LABEL[r.score.verdict],
      r.status,
      ...criteria.questions.map((id) => {
        const a = r.answers;
        if (!a) return '';
        if (id === 'experience') return a.yearsExperience ?? '';
        if (id === 'skills') return (a.topSkills ?? []).join('; ');
        if (id === 'salary') return a.expectedSalaryLpa ?? '';
        if (id === 'relocation')
          return a.openToRelocation === null || a.openToRelocation === undefined
            ? ''
            : a.openToRelocation
              ? 'Yes'
              : 'No';
        return a.noticePeriodDays ?? '';
      }),
      // Which of the role's wanted skills the candidate actually claimed.
      r.score.dimensions.find((d) => d.id === 'skills')?.skills?.matched.join('; ') ?? '',
      r.score.dimensions.find((d) => d.id === 'skills')?.skills?.missing.join('; ') ?? '',
      r.answers?.notes ?? '',
      r.duration ?? '',
      r.timestamp,
    ]);
    downloadCsv(
      `converseiq-${criteria.role.toLowerCase().replace(/\s+/g, '-')}-${new Date()
        .toISOString()
        .slice(0, 10)}.csv`,
      toCsv(header, rows)
    );
  };

  /**
   * Redial a candidate. Adds a fresh record rather than overwriting the old
   * one — a second attempt is a separate call, and the first one's outcome is
   * often why you are calling again.
   */
  const callAgain = async (call: CallRecord) => {
    setRedialError('');
    setRedialing(call.id);
    const outcome = await dispatchScreeningCall({
      name: call.name || call.phone,
      phone: call.phone,
      criteria,
      voiceId: call.voiceId || DEFAULT_VOICE,
      modelProvider: call.modelProvider || DEFAULT_MODEL,
    });
    setRedialing(null);
    if (!outcome.ok) setRedialError(outcome.error || 'Could not place the call');
    else setExpanded(outcome.record.id);
  };

  const hangup = async (call: CallRecord) => {
    if (!call.roomName) return;
    await fetch('/api/hangup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ roomName: call.roomName }),
    }).catch(() => {});
    callStore.update(call.id, { status: 'completed' });
  };

  if (calls.length === 0) {
    return <EmptyState title="No calls yet." hint="Queue candidates under Candidates to start screening." />;
  }

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Stat label="Candidates" value={summary.total} />
        <Stat label="Screened" value={summary.screened} />
        <Stat label="Strong match" value={summary.strong} accent="text-emerald-400" />
        <Stat label="In progress" value={summary.inFlight} accent="text-blue-400" />
      </div>

      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold text-white">Ranked by match</h2>
          <p className="text-[11px] text-neutral-600">
            Scored against {criteria.role} · {criteria.maxBudgetLpa} LPA ·{' '}
            {criteria.minYearsExperience}+ yrs
            {criteria.relocationRequired ? ' · must relocate' : ''}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="ghost" onClick={exportCsv}>
            <Download size={14} /> Export
          </Button>
          <Button
            variant="ghost"
            onClick={() => {
              if (confirm('Clear all results from this browser?')) callStore.clear();
            }}
          >
            <Trash2 size={14} />
          </Button>
        </div>
      </div>

      {redialError && (
        <div className="p-3 rounded-lg border bg-red-500/10 border-red-500/30 text-red-200 text-sm">
          {redialError}
        </div>
      )}

      <Card className="divide-y divide-white/5 overflow-hidden">
        {ranked.map((r) => {
          const live = r.status === 'connecting' || r.status === 'ringing' || r.status === 'connected';
          const open = expanded === r.id;
          return (
            <div key={r.id}>
              <div className="flex items-center gap-3 px-4 py-3">
                <span
                  className={`w-7 text-sm font-mono shrink-0 ${
                    r.rank <= 3 && r.answers ? 'text-white' : 'text-neutral-600'
                  }`}
                >
                  {r.answers ? r.rank : '—'}
                </span>

                <button onClick={() => setExpanded(open ? null : r.id)} className="flex-1 min-w-0 text-left">
                  <p className="text-sm text-white truncate">{r.name || formatPhone(r.phone)}</p>
                  <p className="text-[11px] text-neutral-500 font-mono">{formatPhone(r.phone)}</p>
                </button>

                <div className="hidden sm:flex items-center gap-2 shrink-0">
                  <StatusChip status={r.status} />
                </div>

                <div className="w-24 shrink-0 text-right">
                  {r.answers ? (
                    <>
                      <span className="text-sm font-semibold text-white tabular-nums">{r.score.total}</span>
                      <span className="text-[11px] text-neutral-600">/100</span>
                      <p className={`text-[10px] ${verdictColor(r.score.verdict)}`}>
                        {VERDICT_LABEL[r.score.verdict]}
                      </p>
                    </>
                  ) : (
                    <span className="text-[11px] text-neutral-600">
                      {live ? 'on call' : 'no answers'}
                    </span>
                  )}
                </div>

                {live && r.roomName ? (
                  <button
                    onClick={() => hangup(r)}
                    title="End call"
                    className="p-1.5 rounded-md text-red-400/70 hover:text-red-300 hover:bg-red-500/10 transition shrink-0"
                  >
                    <PhoneOff size={14} />
                  </button>
                ) : (
                  <button
                    onClick={() => callAgain(r)}
                    disabled={redialing === r.id}
                    title={`Call ${r.name || r.phone} again`}
                    className="p-1.5 rounded-md text-neutral-500 hover:text-white hover:bg-white/10 transition shrink-0 disabled:opacity-40"
                  >
                    <RotateCw size={14} className={redialing === r.id ? 'animate-spin' : ''} />
                  </button>
                )}

                <button onClick={() => setExpanded(open ? null : r.id)} className="p-1 shrink-0">
                  <ChevronDown
                    size={16}
                    className={`text-neutral-600 transition-transform ${open ? 'rotate-180' : ''}`}
                  />
                </button>
              </div>

              {open && (
                <div className="px-4 pb-4 pt-1 bg-black/20 space-y-3">
                  {r.answers ? (
                    <>
                      <div className="space-y-1.5">
                        {r.score.dimensions.map((d) => (
                          <div key={d.id} className="space-y-1.5">
                            <div className="flex items-center gap-3 text-xs">
                              <span className="w-28 text-neutral-500 shrink-0">{d.label}</span>
                              <div className="flex-1 h-1.5 bg-white/5 rounded-full overflow-hidden">
                                <div
                                  className="h-full bg-white/60 rounded-full transition-all"
                                  style={{ width: `${(d.ratio ?? 0) * 100}%` }}
                                />
                              </div>
                              <span className="w-40 text-neutral-400 text-right shrink-0">{d.detail}</span>
                              <span className="w-12 text-neutral-500 text-right tabular-nums shrink-0">
                                {d.points}/{d.max}
                              </span>
                            </div>

                            {d.skills && (
                              <div className="flex flex-wrap gap-1 pl-28 ml-3">
                                {d.skills.matched.map((s) => (
                                  <Chip key={`m-${s}`} tone="match">
                                    {s}
                                  </Chip>
                                ))}
                                {d.skills.missing.map((s) => (
                                  <Chip key={`x-${s}`} tone="missing">
                                    {s}
                                  </Chip>
                                ))}
                                {d.skills.extra.map((s) => (
                                  <Chip key={`e-${s}`} tone="extra">
                                    {s}
                                  </Chip>
                                ))}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>

                      {r.answers.notes && (
                        <p className="text-xs text-neutral-400 bg-white/[0.03] rounded-lg p-3">
                          {r.answers.notes}
                        </p>
                      )}

                      {r.score.noSkillOverlap && (
                        <p className="text-[11px] text-amber-400/80">
                          None of their skills matched what the role wants — capped below Strong
                          match, however well they scored elsewhere.
                        </p>
                      )}

                      {!r.score.complete && r.score.verdict !== 'declined' && (
                        <p className="text-[11px] text-amber-400/80">
                          Unanswered: {r.score.unanswered.join(', ')} — scored zero for those.
                        </p>
                      )}
                    </>
                  ) : (
                    <p className="text-xs text-neutral-500">
                      {r.error || (live ? 'Call in progress.' : 'No answers were captured on this call.')}
                    </p>
                  )}

                  <div className="flex items-center gap-4 text-[11px] text-neutral-600">
                    <span>{new Date(r.timestamp).toLocaleString()}</span>
                    {r.duration ? <span>{formatDuration(r.duration)}</span> : null}
                    {r.voiceId && <span>{r.voiceId}</span>}
                    <button
                      onClick={() => callStore.remove(r.id)}
                      className="ml-auto hover:text-red-400 transition"
                    >
                      Remove
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </Card>
    </div>
  );
}

/** Skill chips: wanted-and-claimed, wanted-and-absent, claimed-but-not-wanted. */
function Chip({ tone, children }: { tone: 'match' | 'missing' | 'extra'; children: React.ReactNode }) {
  const tones = {
    match: 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300',
    missing: 'bg-white/5 border-white/10 text-neutral-600 line-through',
    extra: 'bg-white/5 border-white/10 text-neutral-400',
  };
  return (
    <span className={`px-1.5 py-0.5 rounded text-[10px] border ${tones[tone]}`}>{children}</span>
  );
}

function Stat({ label, value, accent }: { label: string; value: number; accent?: string }) {
  return (
    <Card className="px-4 py-3">
      <p className="text-[11px] text-neutral-500">{label}</p>
      <p className={`text-xl font-semibold tabular-nums ${accent || 'text-white'}`}>{value}</p>
    </Card>
  );
}

function StatusChip({ status }: { status: CallStatus }) {
  const styles: Record<CallStatus, string> = {
    pending: 'text-neutral-500',
    connecting: 'text-blue-400',
    ringing: 'text-amber-400',
    connected: 'text-purple-300',
    completed: 'text-neutral-500',
    failed: 'text-red-400',
  };
  const pulse = status === 'ringing' || status === 'connected' || status === 'connecting';
  return (
    <span className={`text-[11px] ${styles[status]} ${pulse ? 'animate-pulse' : ''}`}>
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  );
}

function verdictColor(v: string) {
  if (v === 'strong') return 'text-emerald-400';
  if (v === 'possible') return 'text-amber-400';
  if (v === 'declined') return 'text-neutral-600';
  return 'text-neutral-500';
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}
