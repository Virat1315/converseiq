'use client';

import { useCallback, useState, useSyncExternalStore } from 'react';
import { ListChecks, Sliders, Users } from 'lucide-react';
import CampaignSetup from '@/components/CampaignSetup';
import CandidatesPanel from '@/components/CandidatesPanel';
import ResultsPanel from '@/components/ResultsPanel';
import SetupBanner from '@/components/SetupBanner';
import { criteriaStore } from '@/lib/call-store';
import { DEFAULT_CRITERIA, type CampaignCriteria } from '@/lib/screening';

type Tab = 'campaign' | 'candidates' | 'results';

const TABS: Array<{ id: Tab; label: string; icon: React.ReactNode }> = [
  { id: 'campaign', label: 'Campaign', icon: <Sliders size={14} /> },
  { id: 'candidates', label: 'Candidates', icon: <Users size={14} /> },
  { id: 'results', label: 'Results', icon: <ListChecks size={14} /> },
];

export default function Dashboard() {
  const [tab, setTab] = useState<Tab>('candidates');

  // Saved criteria live in localStorage, which only exists on the client.
  // useSyncExternalStore hands React a server snapshot (the defaults) and a
  // client one, so hydration matches without a setState-in-effect round trip.
  const criteria = useSyncExternalStore(
    criteriaStore.subscribe,
    useCallback(() => criteriaStore.getSnapshot(DEFAULT_CRITERIA), []),
    useCallback(() => criteriaStore.getServerSnapshot(DEFAULT_CRITERIA), [])
  );

  const updateCriteria = (c: CampaignCriteria) => criteriaStore.save(c);

  return (
    <div className="space-y-6">
      <SetupBanner />

      <nav className="flex gap-1 border-b border-white/10">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-4 py-2.5 text-sm font-medium transition flex items-center gap-2 border-b-2 -mb-px ${
              tab === t.id
                ? 'text-white border-white'
                : 'text-neutral-500 border-transparent hover:text-neutral-300'
            }`}
          >
            {t.icon}
            {t.label}
          </button>
        ))}
      </nav>

      {/* Kept mounted so switching tabs never interrupts a running campaign. */}
      <div className={tab === 'campaign' ? '' : 'hidden'}>
        <CampaignSetup criteria={criteria} onChange={updateCriteria} />
      </div>
      <div className={tab === 'candidates' ? '' : 'hidden'}>
        <CandidatesPanel criteria={criteria} onDispatched={() => setTab('results')} />
      </div>
      <div className={tab === 'results' ? '' : 'hidden'}>
        <ResultsPanel criteria={criteria} />
      </div>
    </div>
  );
}
