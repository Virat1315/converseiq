'use client';

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Pause, Phone, Play, RotateCcw } from 'lucide-react';

/**
 * A generated product tour that plays like a screen recording.
 *
 * Built rather than recorded: a capture goes stale the moment the UI changes,
 * needs hosting, and has to be re-shot for every tweak. This is assembled from
 * the same states and numbers the app produces, so it stays honest for free.
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

/** Ease-out so bars and counters settle instead of stopping dead. */
const easeOut = (t: number) => 1 - Math.pow(1 - Math.min(1, Math.max(0, t)), 3);

const WANTED_SKILLS = ['product sense', 'user research', 'data analysis', 'communication', 'SQL'];

const CANDIDATES = [
  { name: 'Aarav Sharma', phone: '+91 98765 43210' },
  { name: 'Priya Menon', phone: '+91 98765 43211' },
  { name: 'Rohit Verma', phone: '+91 98765 43212' },
  { name: 'Ananya Iyer', phone: '+91 98765 43213' },
];

const DIALOGUE: Array<{ who: 'agent' | 'them'; line: string }> = [
  { who: 'agent', line: 'Hi Priya! Calling from XYZ Company about a Product Management Intern opening — English or Hindi?' },
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

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-white/[0.03] border border-white/10 rounded-lg px-3 py-2">
      <p className="text-[9px] uppercase tracking-wider text-neutral-600">{label}</p>
      <p className="text-sm text-white mt-0.5">{value}</p>
    </div>
  );
}

const SCENES: Scene[] = [
  {
    title: 'Set up the campaign',
    caption: 'Name the role and list the skills it actually needs.',
    durationMs: 7000,
    render: (p) => (
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-2">
          <Field label="Position" value="Product Management Intern" />
          <Field label="Company" value="XYZ Company" />
        </div>
        <div className="bg-white/[0.03] border border-white/10 rounded-lg px-3 py-2.5">
          <p className="text-[9px] uppercase tracking-wider text-neutral-600 mb-2">
            Skills the role wants
          </p>
          <div className="flex flex-wrap gap-1.5 min-h-[3.5rem]">
            {revealed(WANTED_SKILLS, p, 0.2, 0.9).map((s) => (
              <span
                key={s}
                className="px-2 py-1 rounded-md text-[11px] bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 animate-in fade-in zoom-in-95 duration-300"
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
    caption: 'Drop in a spreadsheet — columns detected, numbers normalised.',
    durationMs: 6500,
    render: (p) => (
      <div className="space-y-2">
        <div
          className={`text-[11px] rounded-lg py-2.5 text-center border transition-colors duration-500 ${
            p > 0.15
              ? 'border-emerald-500/30 bg-emerald-500/5 text-emerald-300'
              : 'border-dashed border-white/15 text-neutral-500'
          }`}
        >
          {p > 0.15 ? (
            <>
              candidates.xlsx — <span className="text-white">Mobile Number</span> →  phone,{' '}
              <span className="text-white">Candidate Name</span> → name
            </>
          ) : (
            'Drop a spreadsheet, or click to choose'
          )}
        </div>
        <div className="space-y-1.5 min-h-[9rem]">
          {revealed(CANDIDATES, p, 0.25, 0.95).map((c, i) => (
            <div
              key={c.phone}
              className="flex items-center gap-3 px-3 py-2 rounded-lg bg-white/[0.03] border border-white/5 animate-in fade-in slide-in-from-left-2 duration-300"
            >
              <span className="text-[10px] text-neutral-600 w-3">{i + 1}</span>
              <span className="text-sm text-white flex-1">{c.name}</span>
              <span className="text-[11px] text-neutral-500 font-mono">{c.phone}</span>
            </div>
          ))}
        </div>
      </div>
    ),
  },
  {
    title: 'The agent calls',
    caption: 'On script, on task — and it refuses to answer what it should not.',
    durationMs: 16000,
    render: (p) => {
      const status = p < 0.1 ? 'Connecting' : p < 0.19 ? 'Ringing' : 'Connected';
      const connected = status === 'Connected';
      const secs = Math.max(0, Math.floor((p - 0.19) * 95));
      const lines = revealed(DIALOGUE, p, 0.21, 0.97);

      return (
        <div className="flex flex-col sm:flex-row gap-3 h-full">
          {/* Phone mockup, so it reads as a call and not another table. */}
          <div className="w-full sm:w-32 shrink-0">
            <div className="rounded-2xl border border-white/15 bg-black/60 p-3 h-full flex sm:flex-col items-center justify-center gap-2 sm:gap-2">
              <div
                className={`w-11 h-11 rounded-full flex items-center justify-center transition-colors duration-500 ${
                  connected ? 'bg-emerald-500/20' : 'bg-white/10'
                } ${!connected ? 'animate-pulse' : ''}`}
              >
                <Phone size={17} className={connected ? 'text-emerald-400' : 'text-neutral-400'} />
              </div>
              <p className="text-[11px] text-white text-center leading-tight">Priya Menon</p>
              <p className="text-[10px] text-neutral-600 font-mono">+91 98765 43211</p>
              <p
                className={`text-[10px] ${
                  connected ? 'text-emerald-400' : status === 'Ringing' ? 'text-amber-400' : 'text-blue-400'
                }`}
              >
                {status}
              </p>
              {connected && (
                <p className="text-[11px] text-neutral-400 tabular-nums">
                  0:{String(secs).padStart(2, '0')}
                </p>
              )}
            </div>
          </div>

          {/* Newest line last; the container scrolls so long calls still fit. */}
          <div className="flex-1 space-y-1.5 overflow-hidden">
            {lines.slice(-6).map((d, i) => (
              <div
                key={`${lines.length}-${i}`}
                className={`text-[11px] leading-relaxed rounded-lg px-2.5 py-1.5 animate-in fade-in slide-in-from-bottom-1 duration-300 ${
                  d.who === 'agent'
                    ? 'bg-blue-500/10 border border-blue-500/20 text-neutral-200'
                    : 'bg-white/[0.03] border border-white/5 text-neutral-400 ml-6'
                }`}
              >
                <span
                  className={`block text-[9px] uppercase tracking-wider mb-0.5 ${
                    d.who === 'agent' ? 'text-blue-400' : 'text-neutral-600'
                  }`}
                >
                  {d.who === 'agent' ? 'Agent' : 'Priya'}
                </span>
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
    durationMs: 9500,
    render: (p) => {
      const fill = easeOut((p - 0.3) / 0.5);
      return (
        <div className="space-y-2">
          {revealed(RANKED, p, 0.12, 0.75).map((r, i) => (
            <div
              key={r.name}
              className="flex items-center gap-3 px-3 py-2.5 rounded-lg bg-white/[0.03] border border-white/5 animate-in fade-in slide-in-from-bottom-1 duration-300"
            >
              <span
                className={`text-xs w-4 tabular-nums ${i === 0 ? 'text-white' : 'text-neutral-600'}`}
              >
                {i + 1}
              </span>
              <span className="text-sm text-white flex-1 truncate">{r.name}</span>
              <div className="w-28 h-1.5 bg-white/5 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full ${
                    r.score >= 75 ? 'bg-emerald-400' : r.score >= 45 ? 'bg-amber-400' : 'bg-neutral-600'
                  }`}
                  style={{ width: `${r.score * fill}%` }}
                />
              </div>
              <span className="text-sm text-white tabular-nums w-9 text-right">
                {Math.round(r.score * fill)}
              </span>
              <span className={`text-[10px] w-24 text-right ${r.tone}`}>{r.verdict}</span>
            </div>
          ))}
        </div>
      );
    },
  },
];

const TOTAL_MS = SCENES.reduce((s, x) => s + x.durationMs, 0);

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
   * Wall-clock instant the current run started from, minus what had already
   * elapsed. Progress is measured against this rather than accumulated per
   * tick: browsers throttle timers in a background tab to about 1Hz, so adding
   * a fixed step each tick makes a 39s tour take minutes.
   */
  const startedAtRef = useRef<number | null>(null);
  const elapsedRef = useRef(0);

  const reduceMotion = useSyncExternalStore(
    subscribeToMotionPreference,
    () => window.matchMedia(REDUCED_MOTION_QUERY).matches,
    () => false // Server render: assume motion is fine, correct on hydrate.
  );

  const set = useCallback((ms: number) => {
    elapsedRef.current = ms;
    startedAtRef.current = Date.now() - ms; // Seeking re-anchors the clock.
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

  // With reduced motion the tour holds its final frame; the scrubber still works.
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
    <div className="rounded-xl border border-white/10 bg-gradient-to-b from-white/[0.04] to-transparent overflow-hidden shadow-2xl">
      {/* Browser chrome, so it reads as a screen recording rather than a widget. */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-white/10 bg-black/40">
        <div className="flex gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-white/15" />
          <span className="w-2.5 h-2.5 rounded-full bg-white/15" />
          <span className="w-2.5 h-2.5 rounded-full bg-white/15" />
        </div>
        <div className="flex-1 text-center">
          <span className="text-[10px] text-neutral-600 font-mono">converseiq.vercel.app</span>
        </div>
        <span className="text-[10px] text-neutral-700 tabular-nums">
          {active + 1}/{SCENES.length}
        </span>
      </div>

      <div className="px-5 pt-4 pb-2">
        <p className="text-sm text-white">{SCENES[active].title}</p>
        <p className="text-xs text-neutral-500">{SCENES[active].caption}</p>
      </div>

      {/* Keyed on the scene so each one animates in cleanly. Taller on phones,
          where the call scene stacks instead of sitting side by side. */}
      <div
        key={active}
        className="px-3 sm:px-5 pb-4 h-[21rem] sm:h-[17rem] overflow-hidden animate-in fade-in duration-500"
      >
        {SCENES[active].render(progressInScene)}
      </div>

      <div className="flex items-center gap-3 px-4 py-2.5 border-t border-white/10 bg-black/30">
        <button
          onClick={() => (done ? restart() : setPlaying((v) => !v))}
          className="p-1.5 rounded-md text-neutral-300 hover:text-white hover:bg-white/10 transition"
          aria-label={done ? 'Replay' : playing ? 'Pause' : 'Play'}
        >
          {done ? <RotateCcw size={14} /> : playing ? <Pause size={14} /> : <Play size={14} />}
        </button>

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

        <div className="hidden sm:flex gap-1">
          {SCENES.map((s, i) => (
            <button
              key={s.title}
              onClick={() => {
                set(SCENES.slice(0, i).reduce((a, x) => a + x.durationMs, 0));
                setPlaying(true);
              }}
              title={s.title}
              aria-label={s.title}
              className={`w-6 h-1 rounded-full transition ${
                i === active ? 'bg-white' : 'bg-white/20 hover:bg-white/40'
              }`}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
