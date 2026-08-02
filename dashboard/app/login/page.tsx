'use client';

import { useState } from 'react';
import { Lock } from 'lucide-react';

export default function LoginPage() {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Sign in failed');
      // Full navigation rather than a router push, so middleware re-runs with
      // the new cookie instead of serving a cached client route.
      window.location.href = '/';
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign in failed');
      setBusy(false);
    }
  };

  return (
    <main className="min-h-screen bg-neutral-950 text-white flex items-center justify-center px-5">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">ConverseIQ</h1>
          <p className="text-sm text-neutral-500">AI phone screening for hiring campaigns</p>
        </div>

        <form
          onSubmit={submit}
          className="bg-white/[0.03] border border-white/10 rounded-xl p-5 space-y-4"
        >
          <label className="block">
            <span className="block text-xs font-medium text-neutral-400 mb-1.5">Password</span>
            <div className="relative">
              <Lock
                size={14}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-600"
              />
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoFocus
                autoComplete="current-password"
                className="w-full pl-9 pr-3 py-2 bg-white/[0.04] border border-white/10 rounded-lg text-white placeholder-neutral-600 focus:outline-none focus:border-white/30 transition text-sm"
                placeholder="••••••••"
              />
            </div>
          </label>

          {error && (
            <p className="text-sm text-red-300 bg-red-500/10 border border-red-500/30 rounded-lg p-2.5">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={busy || !password}
            className="w-full px-4 py-2 rounded-lg text-sm font-medium bg-white text-black hover:bg-neutral-200 disabled:bg-neutral-700 disabled:text-neutral-500 disabled:cursor-not-allowed transition"
          >
            {busy ? 'Checking…' : 'Sign in'}
          </button>
        </form>

        <p className="text-[11px] text-neutral-600 text-center">
          This dashboard can place calls billed to your telephony account.
        </p>
      </div>
    </main>
  );
}
