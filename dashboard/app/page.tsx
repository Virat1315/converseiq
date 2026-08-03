import Dashboard from '@/components/Dashboard';
import DemoHero from '@/components/DemoHero';
import DemoSteps from '@/components/DemoSteps';

export default function Home() {
  return (
    <main className="min-h-screen bg-neutral-950 text-white">
      <div className="max-w-6xl mx-auto px-4 sm:px-5 py-6 sm:py-10 space-y-6 sm:space-y-8">
        <header className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h1 className="text-xl sm:text-2xl font-semibold tracking-tight">ConverseIQ</h1>
            <p className="text-xs sm:text-sm text-neutral-500">
              AI phone screening for hiring campaigns
            </p>
          </div>
          <a
            href="#how-it-works"
            className="text-[11px] sm:text-xs text-neutral-600 hover:text-neutral-300 transition shrink-0 inline-flex items-center min-h-[36px] px-1"
          >
            How it works ↓
          </a>
        </header>

        {/* The tour leads, since most people arriving have never seen the tool. */}
        <DemoHero />

        <Dashboard />

        <DemoSteps />

        <footer className="text-[11px] text-neutral-700 text-center pt-2 safe-bottom">
          <a
            href="https://github.com/Virat1315/converseiq"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-neutral-500 transition inline-flex items-center justify-center min-h-[40px] px-3"
          >
            github.com/Virat1315/converseiq
          </a>
        </footer>
      </div>
    </main>
  );
}
