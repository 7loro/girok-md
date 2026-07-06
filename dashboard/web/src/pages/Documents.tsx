import { useEffect, useMemo, useState } from 'react';
import { api, type DocEntry, type DocStatus } from '../api';
import StatusBadge from '../components/StatusBadge';

const FILTERS: Array<DocStatus | 'all'> = ['all', 'draft', 'pending', 'synced', 'built', 'orphaned'];

export default function Documents(): JSX.Element {
  const [docs, setDocs] = useState<DocEntry[]>([]);
  const [filter, setFilter] = useState<DocStatus | 'all'>('all');
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<DocEntry | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [toggling, setToggling] = useState(false);

  function load(): Promise<void> {
    return api
      .docs()
      .then((res) => {
        setDocs(res.docs);
        setSelected((prev) => (prev ? res.docs.find((d) => d.slug === prev.slug) ?? null : null));
      })
      .catch((e: Error) => setError(e.message));
  }

  useEffect(() => { void load(); }, []);

  const visible = useMemo(() => {
    const q = query.toLowerCase();
    return docs
      .filter((d) => filter === 'all' || d.status === filter)
      .filter(
        (d) =>
          q.length === 0 ||
          d.title.toLowerCase().includes(q) ||
          d.tags.some((t) => t.toLowerCase().includes(q)),
      )
      .sort((a, b) => (b.modified ?? '').localeCompare(a.modified ?? ''));
  }, [docs, filter, query]);

  async function togglePublish(doc: DocEntry): Promise<void> {
    if (!doc.sourcePath) return;
    setToggling(true);
    setError(null);
    try {
      await api.setPublish(doc.sourcePath, !doc.publish);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setToggling(false);
    }
  }

  return (
    <div className="space-y-4">
      <h2 className="text-2xl font-black">Documents</h2>
      {error && <p className="text-err font-bold">{error}</p>}

      <div className="flex flex-wrap gap-2 items-center">
        {FILTERS.map((f) => (
          <button
            key={f}
            onClick={(): void => setFilter(f)}
            className={`px-3 py-1 border-2 border-ink text-sm font-bold ${
              filter === f ? 'bg-ink text-paper' : ''
            }`}
          >
            {f}
          </button>
        ))}
        <input
          className="brutal-input max-w-xs ml-auto"
          placeholder="Search title or tag…"
          value={query}
          onChange={(e): void => setQuery(e.target.value)}
        />
      </div>

      <div className="flex gap-4 items-start">
        <div className="brutal flex-1 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b-[3px] border-ink text-left">
                <th className="p-3">Title</th>
                <th className="p-3">Status</th>
                <th className="p-3">Tags</th>
                <th className="p-3">Modified</th>
                <th className="p-3">Langs</th>
                <th className="p-3">⚠</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((doc) => (
                <tr
                  key={doc.slug}
                  onClick={(): void => setSelected(doc)}
                  className={`border-b border-muted/30 cursor-pointer hover:bg-accent/10 ${
                    selected?.slug === doc.slug ? 'bg-accent/20' : ''
                  }`}
                >
                  <td className="p-3 font-bold">{doc.title}</td>
                  <td className="p-3">
                    <StatusBadge status={doc.status} />
                  </td>
                  <td className="p-3 text-muted">{doc.tags.join(', ')}</td>
                  <td className="p-3 text-muted">
                    {doc.modified ? new Date(doc.modified).toLocaleDateString() : '—'}
                  </td>
                  <td className="p-3 text-muted">{doc.translations.join(', ')}</td>
                  <td className="p-3 font-bold text-warn">
                    {doc.warnings.length > 0 ? doc.warnings.length : ''}
                  </td>
                </tr>
              ))}
              {visible.length === 0 && (
                <tr>
                  <td className="p-4 text-muted" colSpan={6}>
                    No documents.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {selected && (
          <aside className="brutal p-4 w-80 shrink-0 space-y-3">
            <h3 className="font-black break-all">{selected.title}</h3>
            <StatusBadge status={selected.status} />
            <dl className="text-sm space-y-1">
              <div>
                <dt className="font-bold inline">slug: </dt>
                <dd className="inline break-all">{selected.slug}</dd>
              </div>
              <div>
                <dt className="font-bold inline">source: </dt>
                <dd className="inline break-all">{selected.relPath ?? '(removed)'}</dd>
              </div>
              <div>
                <dt className="font-bold inline">last sync: </dt>
                <dd className="inline">{selected.lastSyncAt ?? '—'}</dd>
              </div>
              <div>
                <dt className="font-bold inline">translations: </dt>
                <dd className="inline">{selected.translations.join(', ') || '—'}</dd>
              </div>
            </dl>
            {selected.warnings.length > 0 && (
              <div>
                <p className="font-bold text-sm text-warn">Warnings</p>
                <ul className="text-xs space-y-1">
                  {selected.warnings.map((w) => (
                    <li key={w}>⚠ {w}</li>
                  ))}
                </ul>
              </div>
            )}
            {selected.sourcePath ? (
              <button
                className="brutal-btn w-full"
                disabled={toggling}
                onClick={(): void => void togglePublish(selected)}
              >
                {selected.publish ? 'Unpublish' : 'Publish'}
              </button>
            ) : (
              <p className="text-xs text-muted">
                Source file is gone — this post will be removed on next sync.
              </p>
            )}
          </aside>
        )}
      </div>
    </div>
  );
}
