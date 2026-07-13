export type DocStatus = 'draft' | 'new' | 'modified' | 'synced' | 'built' | 'orphaned';

export interface DocPreview {
  title: string;
  html: string;
}

export interface DocEntry {
  slug: string;
  title: string;
  status: DocStatus;
  sourcePath: string | null;
  relPath: string | null;
  publish: boolean;
  tags: string[];
  modified: string | null;
  lastSyncAt: string | null;
  translations: string[];
  warnings: string[];
}

export type JobType = 'sync' | 'translate' | 'build' | 'preview';
export type JobStatus = 'running' | 'succeeded' | 'failed' | 'canceled';

export interface JobRecord {
  id: string;
  type: JobType;
  status: JobStatus;
  startedAt: string;
  endedAt: string | null;
  exitCode: number | null;
  options: { sourcePath?: string };
  logs: string[];
}

export interface Overview {
  counts: Record<DocStatus, number>;
  total: number;
  translatedCount: number;
  pipeline: {
    lastSyncAt: string | null;
    lastBuildAt: string | null;
    lastDeployAt: string | null;
  };
  recentJobs: JobRecord[];
}

export interface DeployStatus {
  branch: string;
  changedFiles: Array<{ status: string; path: string }>;
  ahead: number;
}

export interface DeployRecord {
  at: string;
  message: string;
  ok: boolean;
  steps: Array<{ cmd: string; output: string }>;
  error?: string;
}

export type TomlValue = string | boolean | number | string[];

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public retryAfterMs?: number,
  ) {
    super(message);
  }
}

async function request<T>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: {
      'content-type': 'application/json',
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) {
    if (res.status === 401 && path !== '/api/auth/login' && path !== '/api/auth/me') {
      window.dispatchEvent(new Event('girok:unauthorized'));
    }
    const body = (await res
      .json()
      .catch(() => ({}))) as {
      error?: string;
      retryAfterMs?: number;
    };
    throw new ApiError(
      res.status,
      body.error ?? `HTTP ${res.status}`,
      body.retryAfterMs,
    );
  }
  return res.json() as Promise<T>;
}

export const api = {
  me: (): Promise<{ ok: boolean }> => request('/api/auth/me'),
  login: (password: string): Promise<{ ok: boolean }> =>
    request('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ password }),
    }),
  logout: (): Promise<{ ok: boolean }> =>
    request('/api/auth/logout', { method: 'POST' }),
  overview: (): Promise<Overview> => request('/api/overview'),
  docs: (): Promise<{ sourceRoot: string; docs: DocEntry[] }> =>
    request('/api/docs'),
  docPreview: (slug: string): Promise<DocPreview> =>
    request(`/api/docs/${encodeURIComponent(slug)}/preview`),
  setPublish: (
    path: string,
    publish: boolean,
  ): Promise<{ ok: boolean }> =>
    request('/api/docs/publish', {
      method: 'PATCH',
      body: JSON.stringify({ path, publish }),
    }),
  jobs: (): Promise<JobRecord[]> => request('/api/jobs'),
  startJob: (
    type: JobType,
    options?: { sourcePath?: string },
  ): Promise<JobRecord> =>
    request('/api/jobs', {
      method: 'POST',
      body: JSON.stringify({ type, options }),
    }),
  cancelJob: (id: string): Promise<{ ok: boolean }> =>
    request(`/api/jobs/${id}/cancel`, { method: 'POST' }),
  deployStatus: (): Promise<DeployStatus> =>
    request('/api/deploy/status'),
  deploy: (message: string): Promise<DeployRecord> =>
    request('/api/deploy', {
      method: 'POST',
      body: JSON.stringify({ message }),
    }),
  deployHistory: (): Promise<DeployRecord[]> =>
    request('/api/deploy/history'),
  settings: (): Promise<Record<string, unknown>> =>
    request('/api/settings'),
  saveSettings: (
    updates: Record<string, Record<string, TomlValue>>,
  ): Promise<{ ok: boolean }> =>
    request('/api/settings', {
      method: 'PUT',
      body: JSON.stringify({ updates }),
    }),
};
