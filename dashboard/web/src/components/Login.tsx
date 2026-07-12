import { useState } from 'react';
import { api, ApiError } from '../api';

export default function Login({
  onSuccess,
}: {
  onSuccess: () => void;
}): JSX.Element {
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.login(password);
      onSuccess();
    } catch (err) {
      if (
        err instanceof ApiError &&
        err.status === 429 &&
        err.retryAfterMs !== undefined
      ) {
        setError(
          `Too many attempts. Retry in ${Math.ceil(
            err.retryAfterMs / 1000,
          )}s.`,
        );
      } else {
        setError('Invalid password.');
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <form
        onSubmit={submit}
        className="brutal p-8 w-full max-w-sm space-y-4"
      >
        <h1 className="text-2xl font-black">
          girok<span className="text-accent">.md</span> dashboard
        </h1>
        <label htmlFor="password" className="sr-only">
          Password
        </label>
        <input
          id="password"
          type="password"
          className="brutal-input"
          placeholder="Password"
          value={password}
          onChange={(e): void => setPassword(e.target.value)}
          autoFocus
        />
        {error && <p className="text-err font-bold text-sm">{error}</p>}
        <button
          type="submit"
          className="brutal-btn w-full"
          disabled={busy || password.length === 0}
        >
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </div>
  );
}
