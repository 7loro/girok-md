import { useCallback, useEffect, useState } from 'react';
import { api, type DeployRecord, type DeployStatus } from '../api';

export default function Deploy(): JSX.Element {
  const [status, setStatus] = useState<DeployStatus | null>(null);
  const [history, setHistory] = useState<DeployRecord[]>([]);
  const [message, setMessage] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<DeployRecord | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback((): void => {
    api.deployStatus().then(setStatus).catch((e: Error) => setError(e.message));
    api.deployHistory().then(setHistory).catch(() => undefined);
  }, []);

  useEffect(refresh, [refresh]);

  async function deploy(): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      const record = await api.deploy(message.trim());
      setResult(record);
      setConfirming(false);
      setMessage('');
      refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  const nothingToDo = status !== null && status.changedFiles.length === 0 && status.ahead === 0;

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-black">Deploy</h2>
      {error && <p className="text-err font-bold">{error}</p>}

      <div className="brutal p-4 space-y-3">
        <h3 className="font-black">Working tree {status && <span className="text-muted">({status.branch})</span>}</h3>
        {!status && <p className="text-sm text-muted">Loading…</p>}
        {status && status.changedFiles.length === 0 && <p className="text-sm text-muted">No local changes.</p>}
        {status && status.changedFiles.length > 0 && (
          <ul className="text-sm font-mono space-y-0.5">
            {status.changedFiles.map((f) => (
              <li key={f.path}>
                <span className="inline-block w-8 font-bold text-accent">{f.status}</span>
                {f.path}
              </li>
            ))}
          </ul>
        )}
        {status && status.ahead > 0 && (
          <p className="text-sm font-bold">{status.ahead} commit(s) ahead of remote.</p>
        )}

        <div className="space-y-2 pt-2 border-t-2 border-muted/30">
          <input
            className="brutal-input max-w-lg"
            placeholder="Commit message (e.g. release: new posts)"
            value={message}
            onChange={(e): void => { setMessage(e.target.value); setConfirming(false); }}
          />
          {!confirming ? (
            <button
              className="brutal-btn"
              disabled={busy || message.trim().length === 0 || nothingToDo}
              onClick={(): void => setConfirming(true)}
            >
              Deploy…
            </button>
          ) : (
            <div className="flex gap-2 items-center">
              <span className="font-bold text-sm">Commit, push, and publish to GitHub Pages?</span>
              <button className="brutal-btn" disabled={busy} onClick={(): void => void deploy()}>
                {busy ? 'Deploying…' : 'Confirm deploy'}
              </button>
              <button className="brutal-btn-ghost" disabled={busy} onClick={(): void => setConfirming(false)}>
                Cancel
              </button>
            </div>
          )}
          {nothingToDo && <p className="text-xs text-muted">Nothing to commit or push.</p>}
        </div>
      </div>

      {result && (
        <div className="brutal p-4 space-y-2">
          <h3 className="font-black">
            Result: <span className={result.ok ? 'text-ok' : 'text-err'}>{result.ok ? 'success' : 'failed'}</span>
          </h3>
          {result.steps.map((step) => (
            <div key={step.cmd} className="text-sm">
              <p className="font-mono font-bold">$ {step.cmd}</p>
              {step.output && <pre className="font-mono text-xs whitespace-pre-wrap text-muted">{step.output}</pre>}
            </div>
          ))}
          {result.error && <pre className="font-mono text-xs whitespace-pre-wrap text-err">{result.error}</pre>}
        </div>
      )}

      <div className="brutal p-4">
        <h3 className="font-black mb-3">History</h3>
        {history.length === 0 && <p className="text-sm text-muted">No deploys yet.</p>}
        <ul className="space-y-1">
          {history.map((d) => (
            <li key={d.at} className="flex gap-3 text-sm font-bold">
              <span className={d.ok ? 'text-ok' : 'text-err'}>{d.ok ? '✓' : '✗'}</span>
              <span className="text-muted">{new Date(d.at).toLocaleString()}</span>
              <span className="truncate">{d.message}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
