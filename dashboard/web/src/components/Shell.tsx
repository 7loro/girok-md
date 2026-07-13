import { useState } from 'react';
import { api } from '../api';
import Overview from '../pages/Overview';
import Documents from '../pages/Documents';
import Jobs from '../pages/Jobs';
import Deploy from '../pages/Deploy';
import Settings from '../pages/Settings';

type Page = 'overview' | 'documents' | 'jobs' | 'deploy' | 'settings';

const NAV: Array<{ id: Page; label: string }> = [
  { id: 'overview', label: 'Overview' },
  { id: 'documents', label: 'Documents' },
  { id: 'jobs', label: 'Jobs' },
  { id: 'deploy', label: 'Deploy' },
  { id: 'settings', label: 'Settings' },
];

export default function Shell({
  onLogout,
}: {
  onLogout: () => void;
}): JSX.Element {
  const [page, setPage] = useState<Page>('overview');

  async function logout(): Promise<void> {
    await api.logout().catch(() => undefined);
    onLogout();
  }

  return (
    <div className="min-h-screen flex">
      <aside className="w-56 shrink-0 border-r-4 border-ink p-4 flex flex-col gap-2">
        <h1 className="text-xl font-black mb-4">
          girok<span className="text-accent">.md</span>
        </h1>
        {NAV.map((item) => (
          <button
            key={item.id}
            onClick={(): void => setPage(item.id)}
            aria-current={page === item.id ? 'page' : undefined}
            className={`text-left font-bold px-3 py-2 border-[3px] ${
              page === item.id
                ? 'brutal bg-accent text-white'
                : 'border-transparent hover:border-ink'
            }`}
          >
            {item.label}
          </button>
        ))}
        <button
          onClick={(): void => void logout()}
          className="brutal-btn-ghost mt-auto text-sm"
        >
          Sign out
        </button>
      </aside>
      <main className="flex-1 p-8 overflow-x-auto">
        {page === 'overview' && <Overview />}
        {page === 'documents' && <Documents />}
        {page === 'jobs' && <Jobs />}
        {page === 'deploy' && <Deploy />}
        {page === 'settings' && <Settings />}
      </main>
    </div>
  );
}
