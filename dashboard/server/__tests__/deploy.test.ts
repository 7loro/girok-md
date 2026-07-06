import { describe, it, expect } from 'vitest';
import { mkdtempSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { createDeployService, type ExecFn } from '../services/deploy.ts';

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
    expect(gitArgs).toContain('add');
    expect(gitArgs).toContain('commit');
    expect(gitArgs).toContain('push');
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
