import { readFileSync, realpathSync, writeFileSync } from 'fs';
import { join, resolve, sep } from 'path';
import { Hono } from 'hono';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import { streamSSE } from 'hono/streaming';
import { parse } from 'smol-toml';
import { verifyPassword, type LoginGuard, type SessionStore } from './auth.ts';
import { scanDocuments, type DocEntry, type DocStatus } from './services/docStatus.ts';
import { setPublishFlag } from './services/publishToggle.ts';
import { updateTomlContent, type TomlValue } from './services/settingsFile.ts';
import { JobLockError, type JobManager, type JobType } from './services/jobs.ts';
import { DeployLockError, type DeployService } from './services/deploy.ts';

export const SESSION_COOKIE = 'girok_session';

const JOB_TYPES: JobType[] = ['sync', 'translate', 'build', 'preview'];

export interface AppDeps {
  password: string;
  sessions: SessionStore;
  guard: LoginGuard;
  jobs: JobManager;
  deployService: DeployService;
  projectRoot: string;
}

interface SettingsShape {
  source_root_path: string;
  [key: string]: unknown;
}

export function createApp(deps: AppDeps): Hono {
  const app = new Hono();
  const settingPath = join(deps.projectRoot, 'setting.toml');
  const postsDir = join(deps.projectRoot, 'src', 'content', 'posts');
  const distDir = join(deps.projectRoot, 'dist');

  // A full vault scan (parse + per-doc image search) is too slow to run on every request that
  // touches doc status; cache the result briefly so a burst of requests (e.g. overview + docs
  // loading together) reuses one scan.
  let docsCache: { at: number; sourceRoot: string; docs: DocEntry[] } | null = null;
  const DOCS_CACHE_TTL_MS = 3_000;

  function loadSettings(): SettingsShape {
    return parse(readFileSync(settingPath, 'utf-8')) as unknown as SettingsShape;
  }

  function getDocs(): { sourceRoot: string; docs: DocEntry[] } {
    const settings = loadSettings();
    const sourceRoot = resolve(settings.source_root_path);
    const fresh =
      docsCache && docsCache.sourceRoot === sourceRoot && Date.now() - docsCache.at < DOCS_CACHE_TTL_MS;
    if (fresh) return { sourceRoot, docs: docsCache!.docs };
    const docs = scanDocuments(sourceRoot, postsDir, distDir);
    docsCache = { at: Date.now(), sourceRoot, docs };
    return { sourceRoot, docs };
  }

  app.use('/api/*', async (c, next) => {
    if (c.req.path === '/api/auth/login') return next();
    const token = getCookie(c, SESSION_COOKIE);
    if (!token || !deps.sessions.has(token)) {
      return c.json({ error: 'unauthorized' }, 401);
    }
    return next();
  });

  app.post('/api/auth/login', async (c) => {
    const check = deps.guard.canAttempt(Date.now());
    if (!check.allowed) {
      return c.json({ error: 'too many attempts', retryAfterMs: check.retryAfterMs }, 429);
    }
    const body = (await c.req.json().catch(() => ({}))) as { password?: string };
    if (typeof body.password !== 'string' || !verifyPassword(body.password, deps.password)) {
      deps.guard.recordFailure(Date.now());
      return c.json({ error: 'invalid password' }, 401);
    }
    deps.guard.reset();
    const token = deps.sessions.create();
    setCookie(c, SESSION_COOKIE, token, { httpOnly: true, sameSite: 'Strict', path: '/' });
    return c.json({ ok: true });
  });

  app.post('/api/auth/logout', (c) => {
    const token = getCookie(c, SESSION_COOKIE);
    if (token) deps.sessions.destroy(token);
    deleteCookie(c, SESSION_COOKIE, { path: '/' });
    return c.json({ ok: true });
  });

  app.get('/api/auth/me', (c) => c.json({ ok: true }));

  app.get('/api/docs', (c) => {
    try {
      return c.json(getDocs());
    } catch (error) {
      return c.json({ error: 'failed to load settings or scan documents', detail: String(error) }, 500);
    }
  });

  app.patch('/api/docs/publish', async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as { path?: string; publish?: boolean };
    if (typeof body.path !== 'string' || typeof body.publish !== 'boolean') {
      return c.json({ error: 'path and publish are required' }, 400);
    }
    let sourceRoot: string;
    try {
      sourceRoot = resolve(loadSettings().source_root_path);
    } catch (error) {
      return c.json({ error: 'failed to load settings', detail: String(error) }, 500);
    }
    const target = resolve(body.path);
    if (!target.startsWith(sourceRoot + sep) || !target.endsWith('.md')) {
      return c.json({ error: 'path must be a markdown file inside the source root' }, 400);
    }
    // resolve() normalizes ".." but not symlinks: a link inside the vault can point
    // at a file outside it. Compare canonical paths when the target exists.
    try {
      const realTarget = realpathSync(target);
      const realRoot = realpathSync(sourceRoot);
      if (!realTarget.startsWith(realRoot + sep)) {
        return c.json({ error: 'path must be a markdown file inside the source root' }, 400);
      }
    } catch {
      // Target does not exist; fall through and let setPublishFlag report it.
    }
    try {
      setPublishFlag(target, body.publish);
      // The toggle changes scan results (draft/pending/etc.); drop the cache so the UI's
      // post-toggle refresh reflects the new state instead of a stale cached scan.
      docsCache = null;
      return c.json({ ok: true });
    } catch (error) {
      return c.json({ error: 'failed to update publish flag', detail: String(error) }, 500);
    }
  });

  app.get('/api/overview', (c) => {
    let docs: DocEntry[];
    try {
      ({ docs } = getDocs());
    } catch (error) {
      return c.json({ error: 'failed to load settings or scan documents', detail: String(error) }, 500);
    }
    const counts: Record<DocStatus, number> = { draft: 0, new: 0, modified: 0, synced: 0, built: 0, orphaned: 0 };
    for (const doc of docs) counts[doc.status] += 1;
    const jobs = deps.jobs.list();
    const lastOf = (type: JobType): string | null =>
      jobs.find((j) => j.type === type && j.status === 'succeeded')?.endedAt ?? null;
    const lastDeploy = deps.deployService.history().find((d) => d.ok) ?? null;
    return c.json({
      counts,
      total: docs.length,
      translatedCount: docs.filter((d) => d.translations.length > 0).length,
      pipeline: {
        lastSyncAt: lastOf('sync'),
        lastBuildAt: lastOf('build'),
        lastDeployAt: lastDeploy ? lastDeploy.at : null,
      },
      recentJobs: jobs.slice(0, 10),
    });
  });

  app.post('/api/jobs', async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as {
      type?: string;
      options?: { sourcePath?: string };
    };
    if (!JOB_TYPES.includes(body.type as JobType)) {
      return c.json({ error: `type must be one of: ${JOB_TYPES.join(', ')}` }, 400);
    }
    try {
      const record = deps.jobs.start(body.type as JobType, body.options ?? {});
      return c.json(record, 201);
    } catch (error) {
      if (error instanceof JobLockError) return c.json({ error: error.message }, 409);
      return c.json({ error: 'failed to start job', detail: String(error) }, 500);
    }
  });

  app.get('/api/jobs', (c) => c.json(deps.jobs.list()));

  app.post('/api/jobs/:id/cancel', (c) => c.json({ ok: deps.jobs.cancel(c.req.param('id')) }));

  app.get('/api/jobs/:id/stream', (c) => {
    const id = c.req.param('id');
    const job = deps.jobs.get(id);
    if (!job) return c.json({ error: 'job not found' }, 404);
    return streamSSE(c, async (stream) => {
      // A client can disconnect at any moment; a rejected write must not become
      // an unhandled rejection, so every SSE write swallows its own failure.
      const writeLog = (line: string): Promise<void> =>
        stream.writeSSE({ event: 'log', data: line }).catch(() => undefined);
      const writeDone = (status: string): Promise<void> =>
        stream.writeSSE({ event: 'done', data: status }).catch(() => undefined);

      if (job.status !== 'running') {
        // Copy: the record's log array is mutated (trimmed) by the manager.
        for (const line of [...job.logs]) await writeLog(line);
        await writeDone(job.status);
        return;
      }

      await new Promise<void>((resolveWait) => {
        // Subscribe before replaying the snapshot; live lines that arrive during
        // replay are buffered so they are neither dropped nor interleaved.
        let replaying = true;
        let finished = false;
        const buffered: string[] = [];
        let exitStatus: string | null = null;

        const cleanup = (): void => {
          unsubscribeLog();
          unsubscribeExit();
        };
        const finish = (status: string): void => {
          if (finished) return;
          finished = true;
          cleanup();
          void writeDone(status).then(() => resolveWait());
        };

        const unsubscribeLog = deps.jobs.onLog((jobId, line) => {
          if (jobId !== id || finished) return;
          if (replaying) buffered.push(line);
          else void writeLog(line);
        });
        const unsubscribeExit = deps.jobs.onExit((jobId, status) => {
          if (jobId !== id || finished) return;
          if (replaying) exitStatus = status;
          else finish(status);
        });
        stream.onAbort(() => {
          finished = true;
          cleanup();
          resolveWait();
        });

        const snapshot = [...job.logs];
        void (async () => {
          for (const line of snapshot) await writeLog(line);
          while (buffered.length > 0) await writeLog(buffered.shift() as string);
          replaying = false;
          if (finished) return;
          if (exitStatus !== null) {
            finish(exitStatus);
            return;
          }
          // The job may have ended before our exit listener was registered.
          const current = deps.jobs.get(id);
          if (!current || current.status !== 'running') {
            finish(current ? current.status : 'failed');
          }
        })();
      });
    });
  });

  app.get('/api/deploy/status', async (c) => {
    try {
      return c.json(await deps.deployService.status());
    } catch (error) {
      return c.json({ error: 'git status failed', detail: String(error) }, 500);
    }
  });

  app.post('/api/deploy', async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as { message?: string };
    if (typeof body.message !== 'string' || body.message.trim().length === 0) {
      return c.json({ error: 'commit message is required' }, 400);
    }
    try {
      return c.json(await deps.deployService.deploy(body.message.trim()));
    } catch (error) {
      if (error instanceof DeployLockError) return c.json({ error: error.message }, 409);
      return c.json({ error: 'deploy failed', detail: String(error) }, 500);
    }
  });

  app.get('/api/deploy/history', (c) => c.json(deps.deployService.history()));

  app.get('/api/settings', (c) => {
    try {
      return c.json(loadSettings());
    } catch (error) {
      return c.json({ error: 'failed to load settings', detail: String(error) }, 500);
    }
  });

  app.put('/api/settings', async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as {
      updates?: Record<string, Record<string, TomlValue>>;
    };
    if (!body.updates || typeof body.updates !== 'object') {
      return c.json({ error: 'updates object is required' }, 400);
    }
    try {
      const raw = readFileSync(settingPath, 'utf-8');
      writeFileSync(settingPath, updateTomlContent(raw, body.updates), 'utf-8');
      return c.json({ ok: true });
    } catch (error) {
      return c.json({ error: 'failed to update settings', detail: String(error) }, 400);
    }
  });

  return app;
}
