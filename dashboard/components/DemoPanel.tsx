'use client';

import { ExternalLink } from 'lucide-react';
import { DEMO_STEPS, resolveDemoSource } from '@/lib/demo-video';
import { Card } from '@/components/ui';
import DemoPlayer from '@/components/DemoPlayer';

/**
 * Walkthrough tab.
 *
 * Falls back to a generated tour rather than an empty frame, so the tab works
 * before anyone records anything. Setting NEXT_PUBLIC_DEMO_VIDEO_URL to a real
 * recording takes precedence.
 */
export default function DemoPanel() {
  const demo = resolveDemoSource(process.env.NEXT_PUBLIC_DEMO_VIDEO_URL);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">
      <div className="lg:col-span-3 space-y-3">
        <div className="flex items-baseline justify-between">
          <h2 className="text-sm font-semibold text-white">Demo</h2>
          {demo.href && (
            <a
              href={demo.href}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[11px] text-neutral-500 hover:text-white transition inline-flex items-center gap-1"
            >
              Open original <ExternalLink size={11} />
            </a>
          )}
        </div>

        {demo.kind === 'iframe' && (
          <div className="relative w-full rounded-xl overflow-hidden border border-white/10 bg-black aspect-video">
            <iframe
              src={demo.src}
              title="ConverseIQ demo"
              className="absolute inset-0 w-full h-full"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
              allowFullScreen
            />
          </div>
        )}

        {demo.kind === 'video' && (
          <video
            src={demo.src}
            controls
            playsInline
            preload="metadata"
            className="w-full rounded-xl border border-white/10 bg-black aspect-video"
          />
        )}

        {demo.kind === 'none' && (
          <>
            <DemoPlayer />
            <p className="text-[11px] text-neutral-600">
              Generated walkthrough — it cannot go stale, because it is built from the same states
              the app produces. To show a real recording instead, set{' '}
              <code className="font-mono text-neutral-500">NEXT_PUBLIC_DEMO_VIDEO_URL</code> to a
              YouTube, Loom, Vimeo or <code className="font-mono text-neutral-500">.mp4</code> link.
            </p>
          </>
        )}
      </div>

      <div className="lg:col-span-2 space-y-3">
        <h2 className="text-sm font-semibold text-white">How it works</h2>
        <ol className="space-y-2.5">
          {DEMO_STEPS.map((step, i) => (
            <li key={step.title}>
              <Card className="p-4 flex gap-3">
                <span className="shrink-0 w-5 h-5 rounded-full bg-white/10 text-[11px] text-neutral-300 flex items-center justify-center tabular-nums">
                  {i + 1}
                </span>
                <div className="space-y-1">
                  <p className="text-sm text-white">{step.title}</p>
                  <p className="text-xs text-neutral-500 leading-relaxed">{step.body}</p>
                </div>
              </Card>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}
