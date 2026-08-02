'use client';

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Pause, Play, RotateCcw } from 'lucide-react';

/**
 * A generated product tour that plays like a video.
 *
 * Built rather than recorded: a screen capture goes stale the moment the UI
 * changes, and this stays honest because it is assembled from the same numbers
 * and states the real app produces. It also needs no hosting and no bandwidth.
 */

const TICK_MS = 50;

interface Scene {
  title: string;
  caption: string;
  durationMs: number;
  render: (p: number) => React.ReactNode; // p is 0..1 within the scene
}

/** Reveal list items one at a time as the scene progresses. */
function revealed<T>(items: T[], p: number, startAt = 0.1, endAt = 0.85): T[] {
  const span = Math.max(0.0001, endAt - startAt);
  const n = Math.round(((p - startAt) / span) * items.length);
  return items.slice(0, Math.max(0, Math.min(items.length, n)));
}

const WANTED_SKILLS = ['product sense', 'user research', 'data analysis', 'communication', 'SQL'];

const CANDIDATES = [
  { name: 'Aarav Sharma', phone: '+91 98765 43210' },
  { name: 'Priya Menon', phone: '+91 98765 43211' },
  { name: 'Rohit Verma', phone: '+91 98765 43212' },
  { name: 'Ananya Iyer', phone: '+91 98765 43213' },
];

const DIALOGUE: Array<{ who: 'agent' | 'them'; line: string }> = [
  { who: 'agent', line: 'Hi Priya! Calling from XYZ Company about a Product Management Intern role — English or Hindi?' },
  { who: 'them', line: 'English is fine.' },
  { who: 'agent', line: 'How many years of relevant experience do you have?' },
  { who: 'them', line: 'About two years, including internships.' },
  { who: 'agent', line: 'And what are the top five skills you are strongest in?' },
  { who: 'them', line: 'Product sense, user research, SQL, communication, and data analysis.' },
  { who: 'them', line: 'What does the role pay, by the way?' },
  { who: 'agent', line: "I'm only collecting a few details right now — the recruiter will cover all of that." },
  { who: 'agent', line: 'What stipend are you expecting?' },
  { who: 'them', line: 'Around five lakhs per annum.' },
];

const RANKED = [
  { name: 'Priya Menon', score: 100, verdict: 'Strong match', tone: 'text-emerald-400' },
  { name: 'Aarav Sharma', score: 83, verdict: 'Strong match', tone: 'text-emerald-400' },
  { name: 'Rohit Verma', score: 58, verdict: 'Possible', tone: 'text-amber-400' },
  { name: 'Ananya Iyer', score: 0, verdict: 'Not interested', tone: 'text-neutral-500' },
];

const SCENES: Scene[] = [
  {
    title: 'Set up the campaign',
    caption: 'Name the role and list the skills it actually needs.',
    durationMs: 7000,
    render: (p) => (
      <div className="space-y-4">
        <Row label="Position" value="Product Management Intern" />
        <Row label="Company" value="XYZ Company" />
        <div>
          <p className="text-[10px] uppercase tracking-wide text-neutral-600 mb-2">Skills the role wants</p>
          <div className="flex flex-wrap gap-1.5">
            {revealed(WANTED_SKILLS, p, 0.25, 0.9).map((s) => (
              <span
                key={s}
                className="px-2 py-0.5 rounded text-[11px] bg-white/5 border border-white/10 text-neutral-300 animate-in fade-in duration-300"
              >
                {s}
              </span>
            ))}
          </div>
        </div>
      </div>
    ),
  },
  {
    title: 'Add candidates',
    caption: 'Drop in a spreadsheet — columns are detected, numbers normalised.',
    durationMs: 6000,
    render: (p) => (
      <div className="space-y-2">
        <div className="text-[11px] text-neutral-500 border border-dashed border-white/15 rounded-lg py-3 text-center">
          candidates.xlsx — using <span className="text-neutral-300">Mobile Number</span> for phone
        </div>
        {revealed(CANDIDATES, p, 0.2, 0.95).map((c, i) => (
          <div
            key={c.phone}
            className="flex items-center gap-3 px-3 py-2 rounded-lg bg-white/[0.03] border border-white/5 animate-in fade-in slide-in-from-bottom-1 duration-300"
          >
            <span className="text-[10px] text-neutral-600 w-4">{i + 1}</span>
            <span className="text-sm text-white flex-1">{c.name}</span>
            <span className="text-[11px] text-neutral-500 font-mono">{c.phone}</span>
          </div>
        ))}
      </div>
    ),
  },
  {
    title: 'The agent calls',
    caption: 'On script, on task — and it refuses to answer what it should not.',
    durationMs: 15000,
    render: (p) => {
      const status = p < 0.12 ? 'Connecting' : p < 0.22 ? 'Ringing' : 'Connected';
      const tone =
        status === 'Connected' ? 'text-purple-300' : status === 'Ringing' ? 'text-amber-400' : 'text-blue-400';
      const secs = Math.max(0, Math.floor((p - 0.22) * 90));
      return (
        <div className="space-y-3">
          <div className="flex items-center gap-3 px-3 py-2 rounded-lg bg-white/[0.03] border border-white/5">
            <span className="text-sm text-white flex-1">Priya Menon</span>
            <span className={`text-[11px] ${tone} animate-pulse`}>{status}</span>
            {status === 'Connected' && (
              <span className="text-[11px] text-neutral-500 tabular-nums">
                0:{String(secs).padStart(2, '0')}
              </span>
            )}
          </div>
          <div className="space-y-1.5 min-h-[11rem]">
            {revealed(DIALOGUE, p, 0.24, 0.97).map((d, i) => (
              <div
                key={i}
                className={`text-xs leading-relaxed animate-in fade-in duration-300 ${
                  d.who === 'agent' ? 'text-neutral-200' : 'text-neutral-500 pl-5'
                }`}
              >
                <span className={d.who === 'agent' ? 'text-blue-400' : 'text-neutral-600'}>
                  {d.who === 'agent' ? 'Agent' : 'Priya'}
                </span>{' '}
                {d.line}
              </div>
            ))}
          </div>
        </div>
      );
    },
  },
  {
    title: 'Read the shortlist',
    caption: 'Scored out of 100 and ranked. Change the criteria, everyone re-ranks.',
    durationMs: 9000,
    render: (p) => (
      <div className="space-y-2">
        {revealed(RANKED, p, 0.15, 0.8).map((r, i) => (
          <div
            key={r.name}
            className="flex items-center gap-3 px-3 py-2.5 rounded-lg bg-white/[0.03] border border-white/5 animate-in fade-in slide-in-from-bottom-1 duration-300"
          >
            <span className="text-xs text-neutral-500 w-4 tabular-nums">{i + 1}</span>
            <span className="text-sm text-white flex-1">{r.name}</span>
            <div className="w-24 h-1 bg-white/5 rounded-full overflow-hidden">
              <div
                className="h-full bg-white/50 rounded-full transition-all duration-700"
                style={{ width: `${p > 0.35 ? r.score : 0}%` }}
              />
            </div>
            <span className="text-sm text-white tabular-nums w-9 text-right">{r.score}</span>
            <span className={`text-[10px] w-24 text-right ${r.tone}`}>{r.verdict}</span>
          </div>
        ))}
      </div>
    ),
  },
];

const TOTAL_MS = SCENES.reduce((s, x) => s + x.durationMs, 0);

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wide text-neutral-600 mb-1">{label}</p>
      <p className="text-sm text-white">{value}</p>
    </div>
  );
}

const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';

function subscribeToMotionPreference(onChange: () => void): () => void {
  const mq = window.matchMedia(REDUCED_MOTION_QUERY);
  mq.addEventListener('change', onChange);
  return () => mq.removeEventListener('change', onChange);
}

export default function DemoPlayer() {
  const [elapsed, setElapsed] = useState(0);
  const [playing, setPlaying] = useState(true);
  /**
   * Wall-clock instant the current play run started from, minus whatever had
   * already elapsed. Progress is measured against this rather than accumulated
   * per tick: browsers throttle timers in a background tab to about 1Hz, so
   * adding a fixed step each tick makes a 37s tour take minutes.
   */
  const startedAtRef = useRef<number | null>(null);

  // Read the preference rather than reacting to it with setState in an effect,
  // which would trigger a second render pass on every mount.
  const reduceMotion = useSyncExternalStore(
    subscribeToMotionPreference,
    () => window.matchMedia(REDUCED_MOTION_QUERY).matches,
    () => false // Server render: assume motion is fine, then correct on hydrate.
  );
  // Track elapsed in a ref too: the interval callback closes over state, and
  // reading it from there would restart the timer on every tick.
  const elapsedRef = useRef(0);

  const set = useCallback((ms: number) => {
    elapsedRef.current = ms;
    // Seeking re-anchors the clock, or the next tick would jump back.
    startedAtRef.current = Date.now() - ms;
    setElapsed(ms);
  }, []);

  useEffect(() => {
    if (!playing || reduceMotion) return;

    startedAtRef.current = Date.now() - elapsedRef.current;

    const id = setInterval(() => {
      const next = Date.now() - (startedAtRef.current ?? Date.now());
      if (next >= TOTAL_MS) {
        elapsedRef.current = TOTAL_MS;
        setElapsed(TOTAL_MS);
        setPlaying(false);
        return;
      }
      elapsedRef.current = next;
      setElapsed(next);
    }, TICK_MS);

    return () => clearInterval(id);
  }, [playing, reduceMotion]);

  // With reduced motion the tour holds on its final frame instead of animating,
  // while the scrubber still works for anyone who wants to step through it.
  const shown = reduceMotion && elapsed === 0 ? TOTAL_MS : elapsed;

  let acc = 0;
  let active = SCENES.length - 1;
  for (let i = 0; i < SCENES.length; i++) {
    if (shown < acc + SCENES[i].durationMs) {
      active = i;
      break;
    }
    acc += SCENES[i].durationMs;
  }
  const sceneStart = SCENES.slice(0, active).reduce((s, x) => s + x.durationMs, 0);
  const progressInScene = Math.min(1, (shown - sceneStart) / SCENES[active].durationMs);
  const done = shown >= TOTAL_MS;

  const restart = () => {
    set(0);
    setPlaying(true);
  };

  return (
    <div className="rounded-xl border border-white/10 bg-black/40 overflow-hidden">
      <div className="px-5 pt-5 pb-3">
        <p className="text-sm text-white">{SCENES[active].title}</p>
        <p className="text-xs text-neutral-500">{SCENES[active].caption}</p>
      </div>

      <div className="px-5 pb-5 min-h-[19rem]">{SCENES[active].render(progressInScene)}</div>

      <div className="flex items-center gap-3 px-4 py-2.5 border-t border-white/10 bg-white/[0.02]">
        <button
          onClick={() => (done ? restart() : setPlaying((v) => !v))}
          className="p-1.5 rounded-md text-neutral-300 hover:text-white hover:bg-white/10 transition"
          aria-label={done ? 'Replay' : playing ? 'Pause' : 'Play'}
        >
          {done ? <RotateCcw size={14} /> : playing ? <Pause size={14} /> : <Play size={14} />}
        </button>

        {/* Scrubber. A range input keeps it keyboard-accessible for free. */}
        <input
          type="range"
          min={0}
          max={TOTAL_MS}
          value={shown}
          onChange={(e) => set(Number(e.target.value))}
          aria-label="Seek"
          className="flex-1 h-1 accent-white cursor-pointer"
        />

        <span className="text-[11px] text-neutral-500 tabular-nums">
          {String(Math.floor(shown / 1000)).padStart(2, '0')}s / {Math.round(TOTAL_MS / 1000)}s
        </span>

        <div className="flex gap-1">
          {SCENES.map((s, i) => (
            <button
              key={s.title}
              onClick={() => {
                set(SCENES.slice(0, i).reduce((a, x) => a + x.durationMs, 0));
                setPlaying(true);
              }}
              title={s.title}
              aria-label={s.title}
              className={`w-5 h-1 rounded-full transition ${
                i === active ? 'bg-white' : 'bg-white/20 hover:bg-white/40'
              }`}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
