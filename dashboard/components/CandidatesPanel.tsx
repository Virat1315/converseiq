'use client';

import { useRef, useState } from 'react';
import { Loader2, Plus, Trash2, Upload, X } from 'lucide-react';
import { callStore } from '@/lib/call-store';
import { buildAgentInstructions, type CampaignCriteria } from '@/lib/screening';
import { DEFAULT_MODEL, DEFAULT_VOICE, MODELS, VOICES } from '@/lib/agent-options';
import { formatPhone, normalizePhone } from '@/lib/phone';
import { parseCandidateFile, type ImportRow } from '@/lib/import-candidates';
import { Button, Card, EmptyState, Field, Notice, inputClass } from '@/components/ui';

interface Queued {
  id: string;
  name: string;
  phone: string;
}

const BATCH_LIMIT = 50;

export default function CandidatesPanel({
  criteria,
  onDispatched,
}: {
  criteria: CampaignCriteria;
  onDispatched: () => void;
}) {
  const [queue, setQueue] = useState<Queued[]>([]);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [voiceId, setVoiceId] = useState(DEFAULT_VOICE);
  const [modelProvider, setModelProvider] = useState(DEFAULT_MODEL);

  const [error, setError] = useState('');
  const [importInfo, setImportInfo] = useState<string | null>(null);
  const [rejected, setRejected] = useState<ImportRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const addManual = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    const normalized = normalizePhone(phone);
    if (!normalized) {
      setError(`"${phone}" isn't a valid phone number. Use international format, e.g. +919876543210.`);
      return;
    }
    if (queue.some((q) => q.phone === normalized)) {
      setError(`${formatPhone(normalized)} is already in the list.`);
      return;
    }
    setQueue((q) => [...q, { id: crypto.randomUUID(), name: name.trim() || normalized, phone: normalized }]);
    setName('');
    setPhone('');
  };

  const handleFile = async (file: File) => {
    setError('');
    setImportInfo(null);
    setRejected([]);
    try {
      const result = await parseCandidateFile(file);

      // Skip anyone already queued rather than silently double-calling them.
      const existing = new Set(queue.map((q) => q.phone));
      const fresh = result.candidates.filter((c) => !existing.has(c.phone));
      const dupes = result.candidates.length - fresh.length;

      setQueue((q) => [...q, ...fresh.map((c) => ({ id: crypto.randomUUID(), ...c }))]);
      setRejected(result.rejected);

      const bits = [`Imported ${fresh.length} candidate${fresh.length === 1 ? '' : 's'}`];
      if (dupes) bits.push(`${dupes} already queued`);
      if (result.rejected.length) bits.push(`${result.rejected.length} skipped`);
      bits.push(
        `using ${result.detected.phoneColumn} for phone` +
          (result.detected.nameColumn ? ` and ${result.detected.nameColumn} for name` : '')
      );
      setImportInfo(bits.join(' · '));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not read that file.');
    } finally {
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const startScreening = async () => {
    if (queue.length === 0) return;
    setError('');
    setBusy(true);
    setProgress({ done: 0, total: queue.length });

    // One request per candidate rather than the batch endpoint: each result
    // lands in history the moment it returns, so the Results tab fills in as
    // the campaign runs instead of all at once at the end.
    let done = 0;
    for (const candidate of queue) {
      // Imported rows with no name column fall back to the phone number. Pass
      // undefined rather than let the agent read a phone number out loud.
      const spokenName = candidate.name === candidate.phone ? undefined : candidate.name;
      const screeningInstructions = buildAgentInstructions(criteria, spokenName);

      const record = callStore.add({
        name: candidate.name,
        phone: candidate.phone,
        prompt: screeningInstructions,
        status: 'pending',
        voiceId,
        modelProvider,
      });

      try {
        const res = await fetch('/api/dispatch', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            to: candidate.phone,
            callId: record.id,
            candidateName: spokenName,
            screeningInstructions,
            voiceId,
            modelProvider,
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || `Dispatch failed (${res.status})`);

        callStore.update(record.id, {
          status: 'connecting',
          roomName: data.roomName,
          dispatchId: data.dispatchId,
        });
      } catch (e) {
        const message = e instanceof Error ? e.message : 'Dispatch failed';
        callStore.update(record.id, { status: 'failed', error: message });
        // A configuration error will fail identically for everyone left —
        // stop rather than generating forty copies of the same message.
        if (message.includes('Missing environment variable')) {
          setError(message);
          break;
        }
      }

      done += 1;
      setProgress({ done, total: queue.length });
    }

    setQueue([]);
    setBusy(false);
    setProgress(null);
    onDispatched();
  };

  const overLimit = queue.length > BATCH_LIMIT;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">
      <div className="lg:col-span-2 space-y-5">
        <Card className="p-5 space-y-4">
          <h2 className="text-sm font-semibold text-white">Add candidates</h2>

          <div
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              const f = e.dataTransfer.files?.[0];
              if (f) handleFile(f);
            }}
            onClick={() => fileRef.current?.click()}
            className="border border-dashed border-white/15 rounded-lg p-6 text-center cursor-pointer hover:border-white/30 hover:bg-white/[0.02] transition"
          >
            <Upload size={18} className="mx-auto text-neutral-500 mb-2" />
            <p className="text-sm text-neutral-300">Drop a spreadsheet, or click to choose</p>
            <p className="text-[11px] text-neutral-600 mt-1">
              .xlsx or .csv — needs a phone column, name optional
            </p>
            <input
              ref={fileRef}
              type="file"
              accept=".xlsx,.csv,text/csv"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleFile(f);
              }}
            />
          </div>

          <div className="flex items-center gap-3">
            <div className="h-px bg-white/10 flex-1" />
            <span className="text-[11px] text-neutral-600">or add one</span>
            <div className="h-px bg-white/10 flex-1" />
          </div>

          <form onSubmit={addManual} className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Name">
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Optional"
                  className={inputClass}
                />
              </Field>
              <Field label="Phone">
                <input
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+919876543210"
                  className={inputClass}
                />
              </Field>
            </div>
            <Button type="submit" variant="ghost" className="w-full">
              <Plus size={15} /> Add to list
            </Button>
          </form>

          {importInfo && <Notice tone="ok">{importInfo}</Notice>}
          {error && <Notice tone="error">{error}</Notice>}

          {rejected.length > 0 && (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-xs text-neutral-400">Skipped rows</span>
                <button
                  onClick={() => setRejected([])}
                  className="text-neutral-600 hover:text-neutral-300"
                >
                  <X size={13} />
                </button>
              </div>
              <div className="max-h-32 overflow-y-auto space-y-1">
                {rejected.map((r, i) => (
                  <div key={i} className="text-[11px] text-neutral-500 flex gap-2">
                    <span className="text-neutral-600 shrink-0">row {r.rowNumber}</span>
                    <span className="font-mono truncate">{r.rawPhone || '(blank)'}</span>
                    <span className="text-amber-500/70 ml-auto shrink-0">{r.error}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </Card>

        <Card className="p-5 space-y-3">
          <h2 className="text-sm font-semibold text-white">Voice</h2>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Speaks as">
              <select value={voiceId} onChange={(e) => setVoiceId(e.target.value)} className={inputClass}>
                {VOICES.map((v) => (
                  <option key={v.id} value={v.id} className="bg-neutral-900">
                    {v.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Model">
              <select
                value={modelProvider}
                onChange={(e) => setModelProvider(e.target.value)}
                className={inputClass}
              >
                {MODELS.map((m) => (
                  <option key={m.id} value={m.id} className="bg-neutral-900">
                    {m.label}
                  </option>
                ))}
              </select>
            </Field>
          </div>
        </Card>
      </div>

      <div className="lg:col-span-3 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-white">
            Call list{' '}
            {queue.length > 0 && <span className="text-neutral-500 font-normal">({queue.length})</span>}
          </h2>
          {queue.length > 0 && (
            <button
              onClick={() => setQueue([])}
              className="text-xs text-neutral-500 hover:text-red-400 transition"
            >
              Clear
            </button>
          )}
        </div>

        {queue.length === 0 ? (
          <EmptyState title="Nobody queued yet." hint="Import a spreadsheet or add a number." />
        ) : (
          <Card className="divide-y divide-white/5 max-h-[26rem] overflow-y-auto">
            {queue.map((c, i) => (
              <div key={c.id} className="flex items-center gap-3 px-4 py-2.5">
                <span className="text-[11px] text-neutral-600 w-6 shrink-0">{i + 1}</span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-white truncate">{c.name}</p>
                  <p className="text-xs text-neutral-500 font-mono">{formatPhone(c.phone)}</p>
                </div>
                <button
                  onClick={() => setQueue((q) => q.filter((x) => x.id !== c.id))}
                  className="text-neutral-600 hover:text-red-400 transition p-1"
                  aria-label={`Remove ${c.name}`}
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </Card>
        )}

        {overLimit && (
          <Notice tone="warn">
            {queue.length} candidates queued. Calls are placed one at a time, so this will take a while —
            consider splitting into batches of {BATCH_LIMIT}.
          </Notice>
        )}

        {criteria.questions.length === 0 && (
          <Notice tone="warn">
            No questions enabled. Turn at least one on under Campaign before calling anyone.
          </Notice>
        )}

        <Button
          onClick={startScreening}
          disabled={busy || queue.length === 0 || criteria.questions.length === 0}
          className="w-full"
        >
          {busy ? (
            <>
              <Loader2 size={16} className="animate-spin" />
              Calling {progress?.done ?? 0} of {progress?.total ?? 0}…
            </>
          ) : (
            `Start screening${queue.length ? ` · ${queue.length} call${queue.length === 1 ? '' : 's'}` : ''}`
          )}
        </Button>

        <p className="text-[11px] text-neutral-600 text-center">
          Each call dials immediately. Results appear under Results as they finish.
        </p>
      </div>
    </div>
  );
}
