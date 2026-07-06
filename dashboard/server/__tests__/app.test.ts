import { describe, it, expect } from 'vitest';
import { createApp, SESSION_COOKIE, type AppDeps } from '../app.ts';
import { createSessionStore, createLoginGuard } from '../auth.ts';
import type { JobManager, JobRecord } from '../services/jobs.ts';
import type { DeployService } from '../services/deploy.ts';

function stubJobs(): JobManager {
  return {
    start: (type): JobRecord => ({
      id: 'job-1', type, status: 'running', startedAt: 'now', endedAt: null, exitCode: null, options: {}, logs: [],
    }),
    cancel: () => true,
    list: () => [],
    get: () => undefined,
    onLog: () => () => undefined,
  };
}

function stubDeploy(): DeployService {
  return {
    status: () => Promise.resolve({ branch: 'main', changedFiles: [], ahead: 0 }),
    deploy: (message) => Promise.resolve({ at: 'now', message, ok: true, steps: [] }),
    history: () => [],
  };
}

function makeApp(): ReturnType<typeof createApp> {
  const deps: AppDeps = {
    password: 'pw',
    sessions: createSessionStore(),
    guard: createLoginGuard(2, 30_000),
    jobs: stubJobs(),
    deployService: stubDeploy(),
    projectRoot: process.cwd(),
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
});
