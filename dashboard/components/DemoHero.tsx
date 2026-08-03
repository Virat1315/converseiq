'use client';

import { useState } from 'react';
import { ChevronDown, ExternalLink } from 'lucide-react';
import DemoPlayer from '@/components/DemoPlayer';
import { resolveDemoSource } from '@/lib/demo-video';

/**
 * The demo, at the top of the page.
 *
 * Collapsible, and the choice is remembered: it earns its place the first time
 * someone lands here, and gets in the way every time after that.
 */
const HIDDEN_KEY = 'converseiq.demo.hidden.v1';

export default function DemoHero() {
  const [open, setOpen] = useState<boolean | null>(null);
  const demo = resolveDemoSource(process.env.NEXT_PUBLIC_DEMO_VIDEO_URL);

  // Read on first render on the client only; `null` keeps server and client
  // markup identical until then.
  if (open === null && typeof window !== 'undefined') {
    setOpen(window.localStorage.getItem(HIDDEN_KEY) !== '1');
  }

  const toggle = () => {
    const next = !open;
    setOpen(next);
    try {
      window.localStorage.setItem(HIDDEN_KEY, next ? '0' : '1');
    } catch {
      // Storage unavailable — the choice just won't persist.
    }
  };

  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between">
        <button
          onClick={toggle}
          className="flex items-center gap-1.5 text-xs text-neutral-500 hover:text-white transition min-h-[36px] pr-2"
        >
          <ChevronDown
            size={13}
            className={`transition-transform ${open ? '' : '-rotate-90'}`}
          />
          {open ? 'Hide demo' : 'Show demo'}
        </button>

        {demo.href && (
          <a
            href={demo.href}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[11px] text-neutral-600 hover:text-white transition inline-flex items-center gap-1 min-h-[36px] pl-2"
          >
            Open original <ExternalLink size={10} />
          </a>
        )}
      </div>

      {open && (
        <>
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

          {demo.kind === 'none' && <DemoPlayer />}
        </>
      )}
    </section>
  );
}
