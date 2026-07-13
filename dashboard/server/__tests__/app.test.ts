import { describe, it, expect } from 'vitest';
import { mkdirSync, mkdtempSync, readFileSync, symlinkSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { createApp, SESSION_COOKIE, type AppDeps } from '../app.ts';
import { createSessionStore, createLoginGuard } from '../auth.ts';
import type { JobManager, JobRecord } from '../services/jobs.ts';
import { DeployLockError, type DeployService } from '../services/deploy.ts';

function stubJobs(): JobManager {
  return {
    start: (type): JobRecord => ({
      id: 'job-1', type, status: 'running', startedAt: 'now', endedAt: null, exitCode: null, options: {}, logs: [],
    }),
    cancel: () => true,
    list: () => [],
    get: () => undefined,
    onLog: () => () => undefined,
    onExit: () => () => undefined,
  };
}

// A controllable JobManager for exercising the SSE stream route.
function streamJobs(record: JobRecord): {
  manager: JobManager;
  emitLog: (line: string) => void;
  emitExit: (status: JobRecord['status']) => void;
  subscribed: Promise<void>;
} {
  const logListeners = new Set<(id: string, line: string) => void>();
  const exitListeners = new Set<(id: string, status: JobRecord['status']) => void>();
  let onSubscribe: () => void = () => undefined;
  const subscribed = new Promise<void>((resolvePromise) => {
    onSubscribe = resolvePromise;
  });
  return {
    manager: {
      start: () => record,
      cancel: () => true,
      list: () => [record],
      get: () => record,
      onLog: (cb) => {
        logListeners.add(cb);
        return () => logListeners.delete(cb);
      },
      onExit: (cb) => {
        exitListeners.add(cb);
        onSubscribe();
        return () => exitListeners.delete(cb);
      },
    },
    emitLog: (line) => {
      record.logs.push(line);
      for (const cb of logListeners) cb(record.id, line);
    },
    emitExit: (status) => {
      record.status = status;
      for (const cb of exitListeners) cb(record.id, status);
    },
    subscribed,
  };
}

function makeRecord(overrides: Partial<JobRecord> = {}): JobRecord {
  return {
    id: 'j1', type: 'sync', status: 'running', startedAt: 'now',
    endedAt: null, exitCode: null, options: {}, logs: [],
    ...overrides,
  };
}

function stubDeploy(): DeployService {
  return {
    status: () => Promise.resolve({ branch: 'main', changedFiles: [], ahead: 0 }),
    deploy: (message) => Promise.resolve({ at: 'now', message, ok: true, steps: [] }),
    history: () => [],
  };
}

function makeApp(overrides: Partial<AppDeps> = {}): ReturnType<typeof createApp> {
  const deps: AppDeps = {
    password: 'pw',
    sessions: createSessionStore(),
    guard: createLoginGuard(2, 30_000),
    jobs: stubJobs(),
    deployService: stubDeploy(),
    projectRoot: process.cwd(),
    ...overrides,
  };
  return createApp(deps);
}

async function loginCookie(app: ReturnType<typeof createApp>): Promise<string> {
  const res = await app.request('/api/auth/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ password: 'pw' }),
  });
  const setCookie = res.headers.get('set-cookie') ?? '';
  return setCookie.split(';')[0];
}

describe('auth flow', () => {
  it('should reject API calls without a session', async () => {
    const app = makeApp();
    const res = await app.request('/api/jobs');
    expect(res.status).toBe(401);
  });

  it('should login with the right password and access the API', async () => {
    const app = makeApp();
    const cookie = await loginCookie(app);
    expect(cookie).toContain(SESSION_COOKIE);
    const res = await app.request('/api/auth/me', { headers: { cookie } });
    expect(res.status).toBe(200);
  });

  it('should reject a wrong password and cool down after repeated failures', async () => {
    const app = makeApp();
    // Hono's app.request() return type is `Response | Promise<Response>`, not strictly a Promise.
    const attempt = (): Response | Promise<Response> =>
      app.request('/api/auth/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ password: 'nope' }),
      });
    expect((await attempt()).status).toBe(401);
    expect((await attempt()).status).toBe(401);
    expect((await attempt()).status).toBe(429);
  });

  it('should logout and invalidate the session', async () => {
    const app = makeApp();
    const cookie = await loginCookie(app);
    await app.request('/api/auth/logout', { method: 'POST', headers: { cookie } });
    const res = await app.request('/api/auth/me', { headers: { cookie } });
    expect(res.status).toBe(401);
  });
});

describe('jobs routes', () => {
  it('should reject an unknown job type', async () => {
    const app = makeApp();
    const cookie = await loginCookie(app);
    const res = await app.request('/api/jobs', {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({ type: 'rm-rf' }),
    });
    expect(res.status).toBe(400);
  });

  it('should start a valid job', async () => {
    const app = makeApp();
    const cookie = await loginCookie(app);
    const res = await app.request('/api/jobs', {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({ type: 'sync' }),
    });
    expect(res.status).toBe(201);
    expect(((await res.json()) as JobRecord).id).toBe('job-1');
  });
});

describe('job stream route', () => {
  it('should 404 for an unknown job', async () => {
    const app = makeApp();
    const cookie = await loginCookie(app);
    const res = await app.request('/api/jobs/nope/stream', { headers: { cookie } });
    expect(res.status).toBe(404);
  });

  it('should replay existing logs and close with done for a finished job', async () => {
    const record = makeRecord({ status: 'succeeded', endedAt: 'now', exitCode: 0, logs: ['a', 'b'] });
    const { manager } = streamJobs(record);
    const app = makeApp({ jobs: manager });
    const cookie = await loginCookie(app);
    const res = await app.request('/api/jobs/j1/stream', { headers: { cookie } });
    const text = await res.text();
    expect(text).toContain('data: a');
    expect(text).toContain('data: b');
    expect(text).toContain('event: done');
    expect(text).toContain('data: succeeded');
  });

  it('should stream live logs and finish via the exit event for a running job', async () => {
    const fake = streamJobs(makeRecord());
    const app = makeApp({ jobs: fake.manager });
    const cookie = await loginCookie(app);
    const res = await app.request('/api/jobs/j1/stream', { headers: { cookie } });
    await fake.subscribed; // route has registered its listeners
    fake.emitLog('hello');
    fake.emitExit('succeeded');
    const text = await res.text();
    expect(text).toContain('data: hello');
    expect(text).toContain('event: done');
    expect(text).toContain('data: succeeded');
  });
});

describe('deploy routes', () => {
  it('should reject an empty commit message', async () => {
    const app = makeApp();
    const cookie = await loginCookie(app);
    const res = await app.request('/api/deploy', {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({ message: '   ' }),
    });
    expect(res.status).toBe(400);
  });

  it('should return 409 when a deploy is already in flight', async () => {
    const lockedDeploy: DeployService = {
      ...stubDeploy(),
      deploy: () => Promise.reject(new DeployLockError('a deploy is already in progress')),
    };
    const app = makeApp({ deployService: lockedDeploy });
    const cookie = await loginCookie(app);
    const res = await app.request('/api/deploy', {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({ message: 'release' }),
    });
    expect(res.status).toBe(409);
  });

  it('should return the deploy record on success', async () => {
    const app = makeApp();
    const cookie = await loginCookie(app);
    const res = await app.request('/api/deploy', {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({ message: 'release: update' }),
    });
    expect(res.status).toBe(200);
    expect(((await res.json()) as { ok: boolean }).ok).toBe(true);
  });
});

describe('overview route', () => {
  it('should aggregate doc counts and pipeline timestamps', async () => {
    const syncJob = makeRecord({ id: 's1', type: 'sync', status: 'succeeded', endedAt: 'T-sync' });
    const buildJob = makeRecord({ id: 'b1', type: 'build', status: 'succeeded', endedAt: 'T-build' });
    const jobs: JobManager = { ...stubJobs(), list: () => [syncJob, buildJob] };
    const app = makeApp({ jobs });
    const cookie = await loginCookie(app);
    const res = await app.request('/api/overview', { headers: { cookie } });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      counts: Record<string, number>;
      pipeline: { lastSyncAt: string | null; lastBuildAt: string | null };
      recentJobs: unknown[];
    };
    expect(body.pipeline.lastSyncAt).toBe('T-sync');
    expect(body.pipeline.lastBuildAt).toBe('T-build');
    expect(body.counts).toHaveProperty('draft');
    expect(body.recentJobs).toHaveLength(2);
  });
});

describe('settings routes', () => {
  function makeAppWithSettings(toml: string): { app: ReturnType<typeof createApp>; settingPath: string } {
    const projectRoot = mkdtempSync(join(tmpdir(), 'girok-settings-'));
    const settingPath = join(projectRoot, 'setting.toml');
    writeFileSync(settingPath, toml, 'utf-8');
    return { app: makeApp({ projectRoot }), settingPath };
  }

  it('should return the parsed settings', async () => {
    const { app } = makeAppWithSettings('source_root_path = "/vault"\nblog_name = "My Blog"\n');
    const cookie = await loginCookie(app);
    const res = await app.request('/api/settings', { headers: { cookie } });
    expect(res.status).toBe(200);
    expect(((await res.json()) as { blog_name: string }).blog_name).toBe('My Blog');
  });

  it('should apply updates while preserving comments', async () => {
    const { app, settingPath } = makeAppWithSettings('# keep me\nsource_root_path = "/vault"\nblog_name = "Old"\n');
    const cookie = await loginCookie(app);
    const res = await app.request('/api/settings', {
      method: 'PUT',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({ updates: { '': { blog_name: 'New' } } }),
    });
    expect(res.status).toBe(200);
    const raw = readFileSync(settingPath, 'utf-8');
    expect(raw).toContain('blog_name = "New"');
    expect(raw).toContain('# keep me');
  });

  it('should reject updates for keys that do not exist', async () => {
    const { app } = makeAppWithSettings('source_root_path = "/vault"\n');
    const cookie = await loginCookie(app);
    const res = await app.request('/api/settings', {
      method: 'PUT',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({ updates: { '': { nope: 'x' } } }),
    });
    expect(res.status).toBe(400);
  });
});

describe('settings error handling', () => {
  function makeAppWithBrokenSettings(): ReturnType<typeof createApp> {
    const projectRoot = mkdtempSync(join(tmpdir(), 'girok-broken-'));
    writeFileSync(join(projectRoot, 'setting.toml'), 'source_root_path = [unclosed', 'utf-8');
    return makeApp({ projectRoot });
  }

  it.each(['/api/docs', '/api/overview', '/api/settings'])(
    'should return a JSON 500 when setting.toml is malformed (%s)',
    async (path) => {
      const app = makeAppWithBrokenSettings();
      const cookie = await loginCookie(app);
      const res = await app.request(path, { headers: { cookie } });
      expect(res.status).toBe(500);
      const body = (await res.json()) as { error: string };
      expect(body.error).toContain('settings');
    },
  );
});

describe('publish route validation', () => {
  it('should reject a path outside the source root', async () => {
    const app = makeApp();
    const cookie = await loginCookie(app);
    const res = await app.request('/api/docs/publish', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({ path: '/etc/passwd', publish: true }),
    });
    expect(res.status).toBe(400);
  });

  it('should reject a symlink that escapes the source root', async () => {
    const base = mkdtempSync(join(tmpdir(), 'girok-symlink-'));
    const sourceRoot = join(base, 'vault');
    const projectRoot = join(base, 'project');
    mkdirSync(sourceRoot, { recursive: true });
    mkdirSync(projectRoot, { recursive: true });
    writeFileSync(join(base, 'outside.md'), '---\npublish: false\n---\n', 'utf-8');
    symlinkSync(join(base, 'outside.md'), join(sourceRoot, 'link.md'));
    writeFileSync(join(projectRoot, 'setting.toml'), `source_root_path = "${sourceRoot}"\n`, 'utf-8');

    const app = makeApp({ projectRoot });
    const cookie = await loginCookie(app);
    const res = await app.request('/api/docs/publish', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({ path: join(sourceRoot, 'link.md'), publish: true }),
    });
    expect(res.status).toBe(400);
    // The file outside the vault must not have been modified.
    expect(readFileSync(join(base, 'outside.md'), 'utf-8')).not.toContain('publish: true');
  });

  it('should accept a real markdown file inside the source root', async () => {
    const base = mkdtempSync(join(tmpdir(), 'girok-publish-ok-'));
    const sourceRoot = join(base, 'vault');
    const projectRoot = join(base, 'project');
    mkdirSync(sourceRoot, { recursive: true });
    mkdirSync(projectRoot, { recursive: true });
    writeFileSync(join(sourceRoot, 'post.md'), '---\npublish: false\n---\nbody\n', 'utf-8');
    writeFileSync(join(projectRoot, 'setting.toml'), `source_root_path = "${sourceRoot}"\n`, 'utf-8');

    const app = makeApp({ projectRoot });
    const cookie = await loginCookie(app);
    const res = await app.request('/api/docs/publish', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({ path: join(sourceRoot, 'post.md'), publish: true }),
    });
    expect(res.status).toBe(200);
    expect(readFileSync(join(sourceRoot, 'post.md'), 'utf-8')).toContain('publish: true');
  });
});
