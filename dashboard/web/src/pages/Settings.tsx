import { useEffect, useState } from 'react';
import { api, type TomlValue } from '../api';

interface SettingsForm {
  source_root_path: string;
  blog_name: string;
  site_url: string;
  locale: string;
  translateEnabled: boolean;
  targetLangs: string;
  commentsEnabled: boolean;
  analyticsEnabled: boolean;
}

interface RawSettings {
  source_root_path?: string;
  blog_name?: string;
  site_url?: string;
  locale?: string;
  posts?: { translate?: { enabled?: boolean; target_langs?: string[] } };
  comments?: { enabled?: boolean };
  analytics?: { enabled?: boolean };
}

export default function Settings(): JSX.Element {
  const [form, setForm] = useState<SettingsForm | null>(null);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api
      .settings()
      .then((raw) => {
        const s = raw as RawSettings;
        setForm({
          source_root_path: s.source_root_path ?? '',
          blog_name: s.blog_name ?? '',
          site_url: s.site_url ?? '',
          locale: s.locale ?? 'en',
          translateEnabled: s.posts?.translate?.enabled ?? false,
          targetLangs: (s.posts?.translate?.target_langs ?? []).join(', '),
          commentsEnabled: s.comments?.enabled ?? false,
          analyticsEnabled: s.analytics?.enabled ?? false,
        });
      })
      .catch((e: Error) => setError(e.message));
  }, []);

  function set<K extends keyof SettingsForm>(key: K, value: SettingsForm[K]): void {
    setForm((prev) => (prev ? { ...prev, [key]: value } : prev));
    setSaved(false);
  }

  async function save(): Promise<void> {
    if (!form) return;
    setBusy(true);
    setError(null);
    try {
      const updates: Record<string, Record<string, TomlValue>> = {
        '': {
          source_root_path: form.source_root_path,
          blog_name: form.blog_name,
          site_url: form.site_url,
          locale: form.locale,
        },
        'posts.translate': {
          enabled: form.translateEnabled,
          target_langs: form.targetLangs
            .split(',')
            .map((s) => s.trim())
            .filter((s) => s.length > 0),
        },
        comments: { enabled: form.commentsEnabled },
        analytics: { enabled: form.analyticsEnabled },
      };
      await api.saveSettings(updates);
      setSaved(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  if (error && !form) return <p className="text-err font-bold">{error}</p>;
  if (!form) return <p className="font-bold">Loading…</p>;

  return (
    <div className="space-y-6 max-w-2xl">
      <h2 className="text-2xl font-black">Settings</h2>
      <p className="text-sm text-muted">Edits are written to setting.toml, preserving comments.</p>

      <div className="brutal p-4 space-y-4">
        {(
          [
            ['source_root_path', 'Source root path'],
            ['blog_name', 'Blog name'],
            ['site_url', 'Site URL'],
          ] as Array<[keyof SettingsForm & string, string]>
        ).map(([key, label]) => (
          <div key={key}>
            <label className="text-sm font-bold block mb-1">{label}</label>
            <input
              className="brutal-input"
              value={form[key] as string}
              onChange={(e): void => set(key, e.target.value)}
            />
          </div>
        ))}
        <div>
          <label className="text-sm font-bold block mb-1">Locale</label>
          <select
            className="brutal-input"
            value={form.locale}
            onChange={(e): void => set('locale', e.target.value)}
          >
            <option value="en">en</option>
            <option value="ko">ko</option>
          </select>
        </div>
      </div>

      <div className="brutal p-4 space-y-4">
        <label className="flex items-center gap-2 font-bold text-sm">
          <input
            type="checkbox"
            checked={form.translateEnabled}
            onChange={(e): void => set('translateEnabled', e.target.checked)}
          />
          Enable translation
        </label>
        <div>
          <label className="text-sm font-bold block mb-1">Target languages (comma-separated)</label>
          <input
            className="brutal-input max-w-xs"
            value={form.targetLangs}
            onChange={(e): void => set('targetLangs', e.target.value)}
          />
        </div>
        <label className="flex items-center gap-2 font-bold text-sm">
          <input
            type="checkbox"
            checked={form.commentsEnabled}
            onChange={(e): void => set('commentsEnabled', e.target.checked)}
          />
          Enable comments
        </label>
        <label className="flex items-center gap-2 font-bold text-sm">
          <input
            type="checkbox"
            checked={form.analyticsEnabled}
            onChange={(e): void => set('analyticsEnabled', e.target.checked)}
          />
          Enable analytics
        </label>
      </div>

      <div className="flex items-center gap-3">
        <button className="brutal-btn" disabled={busy} onClick={(): void => void save()}>
          {busy ? 'Saving…' : 'Save settings'}
        </button>
        {saved && <span className="text-ok font-bold">Saved.</span>}
        {error && form && <span className="text-err font-bold">{error}</span>}
      </div>
    </div>
  );
}
