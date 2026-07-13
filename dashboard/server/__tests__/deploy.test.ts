import { describe, it, expect } from 'vitest';
import { mkdtempSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { createDeployService, DeployLockError, type ExecFn } from '../services/deploy.ts';

interface Call {
  cmd: string;
  args: string[];
}

function setup(responses: Record<string, string | Error>): {
  service: ReturnType<typeof createDeployService>;
  calls: Call[];
} {
  const calls: Call[] = [];
  const execFn: ExecFn = (cmd, args) => {
    calls.push({ cmd, args });
    const key = args.join(' ');
    const found = Object.entries(responses).find(([prefix]) => key.startsWith(prefix));
    if (found && found[1] instanceof Error) return Promise.reject(found[1]);
    return Promise.resolve({ stdout: (found?.[1] as string | undefined) ?? '', stderr: '' });
  };
  const dataDir = mkdtempSync(join(tmpdir(), 'girok-deploy-'));
  return { service: createDeployService({ projectRoot: '/proj', dataDir, execFn }), calls };
}

describe('deploy status', () => {
  it('should report branch, changed files, and ahead count', async () => {
    const { service } = setup({
      'rev-parse': 'main\n',
      'status': ' M src/a.ts\n?? new.md\n',
      'rev-list': '2\n',
    });
    const status = await service.status();
    expect(status.branch).toBe('main');
    expect(status.changedFiles).toEqual([
      { status: 'M', path: 'src/a.ts' },
      { status: '??', path: 'new.md' },
    ]);
    expect(status.ahead).toBe(2);
  });

  it('should report ahead 0 when there is no upstream', async () => {
    const { service } = setup({
      'rev-parse': 'main\n',
      'status': '',
      'rev-list': new Error('no upstream'),
    });
    expect((await service.status()).ahead).toBe(0);
  });

  it('should parse renamed and copied files correctly', async () => {
    const { service } = setup({
      'rev-parse': 'main\n',
      'status': 'R  old.md -> new.md\n M src/a.ts\nC  original.txt -> duplicate.txt\n',
      'rev-list': '0\n',
    });
    const status = await service.status();
    expect(status.changedFiles).toEqual([
      { status: 'R', path: 'new.md' },
      { status: 'M', path: 'src/a.ts' },
      { status: 'C', path: 'duplicate.txt' },
    ]);
  });
});

describe('deploy', () => {
  it('should add, commit, and push when there are changes', async () => {
    const { service, calls } = setup({
      'rev-parse': 'main\n',
      'status': ' M src/a.ts\n',
      'rev-list': '0\n',
    });
    const record = await service.deploy('release: update');
    expect(record.ok).toBe(true);
    const gitArgs = calls.map((c) => c.args[0]);
    // Assert strict sequence of add, commit, push in deploy steps (last 3 calls after status reads)
    expect(gitArgs.slice(-3)).toEqual(['add', 'commit', 'push']);
    expect(service.history()[0].message).toBe('release: update');
  });

  it('should skip commit when there is nothing to commit but still push', async () => {
    const { service, calls } = setup({
      'rev-parse': 'main\n',
      'status': '',
      'rev-list': '1\n',
    });
    const record = await service.deploy('push only');
    expect(record.ok).toBe(true);
    const gitArgs = calls.map((c) => c.args[0]);
    expect(gitArgs).not.toContain('commit');
    expect(gitArgs).toContain('push');
  });

  it('should record a failed deploy with the error message', async () => {
    const { service } = setup({
      'rev-parse': 'main\n',
      'status': '',
      'rev-list': '0\n',
      'push': new Error('remote rejected'),
    });
    const record = await service.deploy('will fail');
    expect(record.ok).toBe(false);
    expect(record.error).toContain('remote rejected');
    expect(service.history()[0].ok).toBe(false);
  });
});

describe('deploy concurrency lock', () => {
  function setupSlowPush(): {
    service: ReturnType<typeof createDeployService>;
    nextPush: () => Promise<() => void>;
  } {
    const waiters: Array<(release: () => void) => void> = [];
    const execFn: ExecFn = (_cmd, args) => {
      if (args[0] === 'push') {
        return new Promise((resolvePromise) => {
          const release = (): void => resolvePromise({ stdout: '', stderr: '' });
          const waiter = waiters.shift();
          if (waiter) waiter(release);
          else release();
        });
      }
      if (args[0] === 'rev-parse') return Promise.resolve({ stdout: 'main\n', stderr: '' });
      return Promise.resolve({ stdout: '', stderr: '' });
    };
    const dataDir = mkdtempSync(join(tmpdir(), 'girok-deploy-'));
    const service = createDeployService({ projectRoot: '/proj', dataDir, execFn });
    // Resolves once a push begins, yielding the function that completes that push.
    const nextPush = (): Promise<() => void> => new Promise((resolvePromise) => waiters.push(resolvePromise));
    return { service, nextPush };
  }

  it('should reject a second deploy while one is in flight', async () => {
    const { service, nextPush } = setupSlowPush();
    const pushStarted = nextPush();
    const first = service.deploy('first');
    const releasePush = await pushStarted; // first deploy is now mid-push
    await expect(service.deploy('second')).rejects.toBeInstanceOf(DeployLockError);
    releasePush();
    expect((await first).ok).toBe(true);
  });

  it('should allow a new deploy after the previous one settles', async () => {
    const { service } = setupSlowPush(); // pushes resolve immediately when un-awaited
    expect((await service.deploy('first')).ok).toBe(true);
    expect((await service.deploy('second')).ok).toBe(true);
  });

  it('should release the lock even when a deploy fails', async () => {
    const { service } = setup({
      'rev-parse': 'main\n',
      'status': '',
      'rev-list': '0\n',
      'push': new Error('remote rejected'),
    });
    const failed = await service.deploy('will fail');
    expect(failed.ok).toBe(false);
    // The failed run must not leave the lock held.
    const next = await service.deploy('retry');
    expect(next.ok).toBe(false); // push still fails, but no DeployLockError
  });
});
