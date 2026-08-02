import Dashboard from '@/components/Dashboard';

export default function Home() {
  return (
    <main className="min-h-screen bg-neutral-950 text-white">
      <div className="max-w-6xl mx-auto px-5 py-10 space-y-8">
        <header className="flex items-baseline justify-between flex-wrap gap-2">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">ConverseIQ</h1>
            <p className="text-sm text-neutral-500">AI phone screening for hiring campaigns</p>
          </div>
          <a
            href="https://github.com/Virat1315/converseiq"
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-neutral-600 hover:text-neutral-400 transition"
          >
            github.com/Virat1315/converseiq
          </a>
        </header>

        <Dashboard />
      </div>
    </main>
  );
}
