import { useCallback, useEffect, useRef, useState } from 'react';
import { api, ApiError, type JobRecord, type JobType } from '../api';
import LogView from '../components/LogView';

const JOB_TYPES: Array<{ type: JobType; label: string; hint: string }> = [
  { type: 'sync', label: 'Sync', hint: 'Vault → posts' },
  { type: 'translate', label: 'Translate', hint: 'Auto-translate posts' },
  { type: 'build', label: 'Build', hint: 'astro build + pagefind' },
  { type: 'preview', label: 'Preview', hint: 'Serve dist at :4321' },
];

export default function Jobs(): JSX.Element {
  const [history, setHistory] = useState<JobRecord[]>([]);
  const [sourcePath, setSourcePath] = useState('');
  const [activeJob, setActiveJob] = useState<JobRecord | null>(null);
  const [logs, setLogs] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);

  const refresh = useCallback((): void => {
    api.jobs().then(setHistory).catch((e: Error) => setError(e.message));
  }, []);

  useEffect(() => {
    refresh();
    return (): void => eventSourceRef.current?.close();
  }, [refresh]);

  function watch(job: JobRecord): void {
    setError(null);
    eventSourceRef.current?.close();
    setActiveJob(job);
    setLogs([]);
    const es = new EventSource(`/api/jobs/${job.id}/stream`);
    es.addEventListener('log', (e): void => {
      if (eventSourceRef.current !== es) return;
      setLogs((prev) => [...prev, (e as MessageEvent<string>).data]);
    });
    es.addEventListener('done', (e): void => {
      if (eventSourceRef.current !== es) return;
      setActiveJob((prev) =>
        prev ? { ...prev, status: (e as MessageEvent<string>).data as JobRecord['status'] } : prev,
      );
      es.close();
      eventSourceRef.current = null;
      refresh();
    });
    es.onerror = (): void => {
      if (eventSourceRef.current !== es) return;
      es.close();
      eventSourceRef.current = null;
      // EventSource failures bypass the fetch 401 interceptor in api.ts, so re-check
      // the session and route an expired session to the login screen explicitly.
      void api.me().catch((err) => {
        if (err instanceof ApiError && err.status === 401) {
          window.dispatchEvent(new Event('girok:unauthorized'));
        }
      });
      setError('Log stream disconnected. Reopen the job from History to re-attach.');
      refresh();
    };
    eventSourceRef.current = es;
  }

  async function start(type: JobType): Promise<void> {
    setError(null);
    try {
      const options =
        type === 'sync' && sourcePath.trim().length > 0 ? { sourcePath: sourcePath.trim() } : undefined;
      const job = await api.startJob(type, options);
      watch(job);
      refresh();
    } catch (e) {
      setError(e instanceof ApiError && e.status === 409 ? `Blocked: ${e.message}` : String(e));
    }
  }

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-black">Jobs</h2>
      {error && <p className="text-err font-bold">{error}</p>}

      <div className="brutal p-4 space-y-4">
        <div className="flex flex-wrap gap-3">
          {JOB_TYPES.map((jt) => (
            <button
              key={jt.type}
              className="brutal-btn"
              onClick={(): void => void start(jt.type)}
              title={jt.hint}
            >
              {jt.label}
            </button>
          ))}
        </div>
        <div>
          <label className="text-sm font-bold block mb-1">
            Source folder override (sync only — empty = setting.toml)
          </label>
          <input
            className="brutal-input max-w-lg"
            placeholder="/path/to/obsidian/vault"
            value={sourcePath}
            onChange={(e): void => setSourcePath(e.target.value)}
          />
        </div>
      </div>

      {activeJob && (
        <div className="space-y-2">
          <div className="flex items-center gap-3">
            <h3 className="font-black uppercase">{activeJob.type}</h3>
            <span
              className={`font-bold text-sm ${
                activeJob.status === 'succeeded'
                  ? 'text-ok'
                  : activeJob.status === 'failed'
                    ? 'text-err'
                    : 'text-muted'
              }`}
            >
              {activeJob.status}
            </span>
            {activeJob.status === 'running' && (
              <button
                className="brutal-btn-ghost text-sm"
                onClick={(): void => {
                  // Optimistically flip status so the UI reflects the cancel immediately.
                  setActiveJob((prev) => (prev ? { ...prev, status: 'canceled' } : prev));
                  void api.cancelJob(activeJob.id).then(refresh);
                }}
              >
                Cancel
              </button>
            )}
          </div>
          {activeJob.type === 'preview' && activeJob.status === 'running' && (
            <p className="text-sm text-muted">
              Preview server running at http://localhost:4321 — cancel to stop it.
            </p>
          )}
          <LogView lines={logs} />
        </div>
      )}

      <div className="brutal p-4">
        <h3 className="font-black mb-3">History</h3>
        {history.length === 0 && <p className="text-sm text-muted">No jobs yet.</p>}
        <ul className="space-y-1">
          {history.map((job) => (
            <li key={job.id}>
              <button
                className="w-full text-left flex gap-3 text-sm font-bold hover:bg-accent/10 px-2 py-1"
                onClick={(): void => {
                  setError(null);
                  if (job.status === 'running') {
                    // watch() resets logs and re-attaches the stream; skip setLogs to avoid flicker.
                    watch(job);
                  } else {
                    eventSourceRef.current?.close();
                    eventSourceRef.current = null;
                    setActiveJob(job);
                    setLogs(job.logs);
                  }
                }}
              >
                <span className="uppercase w-20">{job.type}</span>
                <span
                  className={
                    job.status === 'succeeded'
                      ? 'text-ok'
                      : job.status === 'failed'
                        ? 'text-err'
                        : 'text-muted'
                  }
                >
                  {job.status}
                </span>
                <span className="text-muted">{new Date(job.startedAt).toLocaleString()}</span>
                {job.options.sourcePath && <span className="text-muted truncate">({job.options.sourcePath})</span>}
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
