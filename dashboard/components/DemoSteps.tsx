'use client';

import { DEMO_STEPS } from '@/lib/demo-video';

/**
 * The written walkthrough that sits under the player. Separate from it so the
 * page can put the demo up top and the explanation at the bottom.
 */
export default function DemoSteps() {
  return (
    <section id="how-it-works" className="space-y-4 scroll-mt-6">
      <div className="text-center space-y-1">
        <h2 className="text-sm font-semibold text-white">How it works</h2>
        <p className="text-xs text-neutral-600">Four steps, from an empty campaign to a shortlist.</p>
      </div>

      <ol className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {DEMO_STEPS.map((step, i) => (
          <li
            key={step.title}
            className="bg-white/[0.03] border border-white/10 rounded-xl p-4 space-y-2"
          >
            <span className="w-5 h-5 rounded-full bg-white/10 text-[11px] text-neutral-300 flex items-center justify-center tabular-nums">
              {i + 1}
            </span>
            <p className="text-sm text-white">{step.title}</p>
            <p className="text-xs text-neutral-500 leading-relaxed">{step.body}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}
