import { useEffect, useState } from 'react';
import { api } from './api';
import Login from './components/Login';
import Shell from './components/Shell';

type AuthState = 'loading' | 'anon' | 'authed';

export default function App(): JSX.Element {
  const [auth, setAuth] = useState<AuthState>('loading');

  useEffect(() => {
    api
      .me()
      .then(() => setAuth('authed'))
      .catch(() => setAuth('anon'));
  }, []);

  if (auth === 'loading') return <div className="p-10 font-bold">Loading…</div>;
  if (auth === 'anon')
    return <Login onSuccess={(): void => setAuth('authed')} />;
  return <Shell onLogout={(): void => setAuth('anon')} />;
}
