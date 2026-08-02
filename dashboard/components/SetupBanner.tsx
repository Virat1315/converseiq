'use client';

import { useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, Loader2 } from 'lucide-react';

interface Health {
  livekitReady: boolean;
  telephonyReady: boolean;
  missingRequired: string[];
  missingTelephony: string[];
  livekitHost: string | null;
  outboundNumber: string | null;
}

/**
 * Tells you exactly what is missing before you try to call someone.
 *
 * Without this the first "Make Call" click just failed with a generic error,
 * which is indistinguishable from a broken trunk.
 */
export default function SetupBanner({ onReady }: { onReady?: (ready: boolean) => void }) {
  const [health, setHealth] = useState<Health | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    fetch('/api/health')
      .then((r) => r.json())
      .then((h: Health) => {
        setHealth(h);
        onReady?.(h.telephonyReady);
      })
      .catch(() => setFailed(true));
  }, [onReady]);

  if (failed) {
    return (
      <Shell tone="error">
        <AlertTriangle size={18} className="mt-0.5 shrink-0" />
        <div>Could not reach the dashboard API. Is the server running?</div>
      </Shell>
    );
  }

  if (!health) {
    return (
      <Shell tone="neutral">
        <Loader2 size={18} className="mt-0.5 shrink-0 animate-spin" />
        <div>Checking configuration…</div>
      </Shell>
    );
  }

  if (health.telephonyReady) {
    return (
      <Shell tone="ok">
        <CheckCircle2 size={18} className="mt-0.5 shrink-0" />
        <div>
          Connected to <span className="font-mono text-white">{health.livekitHost}</span>
          {health.outboundNumber && (
            <>
              {' · calling from '}
              <span className="font-mono text-white">{health.outboundNumber}</span>
            </>
          )}
          . Make sure <code className="font-mono text-white">python agent.py start</code> is running, or the agent
          will never join the call.
        </div>
      </Shell>
    );
  }

  const missing = [...health.missingRequired, ...health.missingTelephony];

  return (
    <Shell tone="warn">
      <AlertTriangle size={18} className="mt-0.5 shrink-0" />
      <div className="space-y-2">
        <p className="font-semibold text-amber-200">Calling is disabled — {missing.length} variable(s) not set.</p>
        <div className="flex flex-wrap gap-2">
          {missing.map((k) => (
            <code key={k} className="px-2 py-0.5 rounded bg-black/40 border border-amber-500/30 text-xs font-mono">
              {k}
            </code>
          ))}
        </div>
        <p className="text-amber-200/70 text-xs">
          Add them to <code className="font-mono">dashboard/.env.local</code> and restart, or set them under
          Settings → Environment Variables in your Vercel project and redeploy.
        </p>
      </div>
    </Shell>
  );
}

function Shell({ tone, children }: { tone: 'ok' | 'warn' | 'error' | 'neutral'; children: React.ReactNode }) {
  const tones = {
    ok: 'bg-emerald-500/10 border-emerald-500/30 text-emerald-200',
    warn: 'bg-amber-500/10 border-amber-500/30 text-amber-100',
    error: 'bg-red-500/10 border-red-500/30 text-red-200',
    neutral: 'bg-white/5 border-white/10 text-gray-300',
  };
  return (
    <div className={`w-full flex gap-3 items-start p-4 rounded-xl border text-sm ${tones[tone]}`}>{children}</div>
  );
}
