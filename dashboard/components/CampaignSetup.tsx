'use client';

import { useMemo } from 'react';
import {
  MAX_QUESTIONS,
  QUESTIONS,
  SAMPLE_CANDIDATE_NAME,
  buildAgentInstructions,
  type CampaignCriteria,
  type QuestionId,
} from '@/lib/screening';
import { Card, Field, Notice, Toggle, inputClass } from '@/components/ui';

/**
 * The campaign defines two things at once: what the agent asks on the call,
 * and how the answers are scored afterwards. Keeping them on one screen is
 * deliberate — a budget of 30 LPA only means something next to the question
 * that asks for it.
 */
export default function CampaignSetup({
  criteria,
  onChange,
}: {
  criteria: CampaignCriteria;
  onChange: (c: CampaignCriteria) => void;
}) {
  const set = <K extends keyof CampaignCriteria>(key: K, value: CampaignCriteria[K]) =>
    onChange({ ...criteria, [key]: value });

  const toggleQuestion = (id: QuestionId, on: boolean) => {
    const next = on
      ? [...criteria.questions, id].filter((q, i, a) => a.indexOf(q) === i)
      : criteria.questions.filter((q) => q !== id);
    // Preserve the canonical order so the call always flows the same way.
    set(
      'questions',
      QUESTIONS.filter((q) => next.includes(q.id))
        .map((q) => q.id)
        .slice(0, MAX_QUESTIONS)
    );
  };

  const script = useMemo(
    () => buildAgentInstructions(criteria, SAMPLE_CANDIDATE_NAME),
    [criteria]
  );
  const atLimit = criteria.questions.length >= MAX_QUESTIONS;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
      <div className="space-y-5">
        <Card className="p-5 space-y-4">
          <h2 className="text-sm font-semibold text-white">Role</h2>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Position">
              <input
                value={criteria.role}
                onChange={(e) => set('role', e.target.value)}
                className={inputClass}
                placeholder="Product Manager"
              />
            </Field>
            <Field label="Company">
              <input
                value={criteria.company}
                onChange={(e) => set('company', e.target.value)}
                className={inputClass}
                placeholder="Acme Inc"
              />
            </Field>
          </div>
        </Card>

        <Card className="p-5 space-y-4">
          <div className="flex items-baseline justify-between">
            <h2 className="text-sm font-semibold text-white">Questions</h2>
            <span className="text-[11px] text-neutral-500">
              {criteria.questions.length} of {MAX_QUESTIONS}
            </span>
          </div>
          <p className="text-xs text-neutral-500">
            The agent asks only these, one at a time, and refuses to answer anything else.
          </p>
          <div className="space-y-2.5">
            {QUESTIONS.map((q) => {
              const on = criteria.questions.includes(q.id);
              return (
                <div key={q.id} className="flex items-start gap-3">
                  <div className="pt-0.5">
                    <Toggle
                      checked={on}
                      onChange={(v) => toggleQuestion(q.id, v)}
                      label=""
                    />
                  </div>
                  <div className={on ? '' : 'opacity-40'}>
                    <p className="text-sm text-white">{q.label}</p>
                    <p className="text-xs text-neutral-500">&ldquo;{q.ask}&rdquo;</p>
                  </div>
                </div>
              );
            })}
          </div>
          {atLimit && (
            <p className="text-[11px] text-neutral-600">
              Four is the cap — screening calls that run longer get hung up on.
            </p>
          )}
          {criteria.questions.length === 0 && (
            <Notice tone="warn">Enable at least one question, or there is nothing to score.</Notice>
          )}
        </Card>

        {criteria.questions.includes('skills') && (
          <Card className="p-5 space-y-3">
            <h2 className="text-sm font-semibold text-white">Skills the role wants</h2>
            <p className="text-xs text-neutral-500">
              The candidate&rsquo;s answer is matched against these. They are never read out on
              the call, so nobody can just repeat them back.
            </p>
            <input
              value={criteria.desiredSkills.join(', ')}
              onChange={(e) =>
                set(
                  'desiredSkills',
                  e.target.value
                    .split(',')
                    .map((s) => s.trim())
                    .filter(Boolean)
                )
              }
              placeholder="product sense, user research, SQL"
              className={inputClass}
            />
            <div className="flex flex-wrap gap-1.5">
              {criteria.desiredSkills.map((s) => (
                <span
                  key={s}
                  className="px-2 py-0.5 rounded text-[11px] bg-white/5 border border-white/10 text-neutral-300"
                >
                  {s}
                </span>
              ))}
            </div>
            {criteria.desiredSkills.length === 0 && (
              <Notice tone="warn">
                No skills listed, so everyone scores full marks on that question. Add some, or turn
                the question off.
              </Notice>
            )}
          </Card>
        )}

        <Card className="p-5 space-y-4">
          <h2 className="text-sm font-semibold text-white">Scoring thresholds</h2>
          <p className="text-xs text-neutral-500">
            Enabled questions split 100 points evenly. Changing these re-ranks everyone instantly —
            no one needs to be called again.
          </p>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Minimum experience" hint="Full marks at or above">
              <div className="relative">
                <input
                  type="number"
                  min={0}
                  value={criteria.minYearsExperience}
                  onChange={(e) => set('minYearsExperience', Number(e.target.value))}
                  className={inputClass}
                />
                <span className="absolute right-3 top-2 text-xs text-neutral-600">yrs</span>
              </div>
            </Field>

            <Field label="Salary budget" hint="Zero marks at 1.5×">
              <div className="relative">
                <input
                  type="number"
                  min={0}
                  value={criteria.maxBudgetLpa}
                  onChange={(e) => set('maxBudgetLpa', Number(e.target.value))}
                  className={inputClass}
                />
                <span className="absolute right-3 top-2 text-xs text-neutral-600">LPA</span>
              </div>
            </Field>

            <Field label="Acceptable notice" hint="Zero marks at 2×">
              <div className="relative">
                <input
                  type="number"
                  min={0}
                  value={criteria.maxNoticeDays}
                  onChange={(e) => set('maxNoticeDays', Number(e.target.value))}
                  className={inputClass}
                />
                <span className="absolute right-3 top-2 text-xs text-neutral-600">days</span>
              </div>
            </Field>

            <div className="flex items-end pb-2">
              <Toggle
                checked={criteria.relocationRequired}
                onChange={(v) => set('relocationRequired', v)}
                label="Relocation required"
              />
            </div>
          </div>

          {!criteria.relocationRequired && criteria.questions.includes('relocation') && (
            <Notice tone="info">
              Relocation is still asked, but everyone scores full marks on it since the role
              doesn&rsquo;t require moving.
            </Notice>
          )}
        </Card>
      </div>

      <Card className="p-5 space-y-3 lg:sticky lg:top-4 h-fit">
        <div className="flex items-baseline justify-between">
          <h2 className="text-sm font-semibold text-white">Agent script</h2>
          <span className="text-[11px] text-neutral-600">generated</span>
        </div>
        <p className="text-xs text-neutral-500">
          Sent with every call in this campaign — this is what the agent is bound to.
          &ldquo;{SAMPLE_CANDIDATE_NAME}&rdquo; is a placeholder; each call gets that
          candidate&rsquo;s real name.
        </p>
        <pre className="text-[11px] leading-relaxed text-neutral-400 bg-black/40 border border-white/5 rounded-lg p-3 overflow-auto max-h-[28rem] whitespace-pre-wrap font-mono">
          {script}
        </pre>
      </Card>
    </div>
  );
}
