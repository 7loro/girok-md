import { describe, it, expect, vi } from 'vitest';
import { EventEmitter } from 'events';
import { mkdtempSync, readFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { commandFor, createJobManager, JobLockError, type SpawnFn } from '../services/jobs.ts';

class FakeChild extends EventEmitter {
  stdout = new EventEmitter();
  stderr = new EventEmitter();
  pid?: number;
  killSignals: Array<NodeJS.Signals | undefined> = [];
  // When true, kill() records the signal but does not terminate the child,
  // simulating a process that ignores SIGTERM.
  ignoreKill = false;

  kill(signal?: NodeJS.Signals): boolean {
    this.killSignals.push(signal);
    if (this.ignoreKill) return true;
    this.emit('exit', null);
    return true;
  }
}

function setup(): { manager: ReturnType<typeof createJobManager>; children: FakeChild[]; dataDir: string } {
  const children: FakeChild[] = [];
  const spawnFn: SpawnFn = () => {
    const child = new FakeChild();
    children.push(child);
    return child;
  };
  const dataDir = mkdtempSync(join(tmpdir(), 'girok-jobs-'));
  return { manager: createJobManager({ projectRoot: '/proj', dataDir, spawnFn }), children, dataDir };
}

describe('commandFor', () => {
  it('should run sync via node with optional --source', () => {
    expect(commandFor('sync', {})).toEqual({ cmd: process.execPath, args: ['scripts/sync.ts'] });
    expect(commandFor('sync', { sourcePath: '/vault' })).toEqual({
      cmd: process.execPath,
      args: ['scripts/sync.ts', '--source', '/vault'],
    });
  });

  it('should run build and preview via npm', () => {
    expect(commandFor('build', {})).toEqual({ cmd: 'npm', args: ['run', 'build'] });
    expect(commandFor('preview', {})).toEqual({ cmd: 'npm', args: ['run', 'preview'] });
  });
});

describe('createJobManager', () => {
  it('should collect stdout/stderr lines into logs and notify listeners', () => {
    const { manager, children } = setup();
    const seen: string[] = [];
    manager.onLog((_id, line) => seen.push(line));
    const job = manager.start('sync', {});
    children[0].stdout.emit('data', Buffer.from('line one\nline two\n'));
    children[0].stderr.emit('data', Buffer.from('warn\n'));
    expect(manager.get(job.id)!.logs).toEqual(['line one', 'line two', 'warn']);
    expect(seen).toEqual(['line one', 'line two', 'warn']);
  });

  it('should reject a second non-preview job while one runs', () => {
    const { manager } = setup();
    manager.start('sync', {});
    expect(() => manager.start('build', {})).toThrow(JobLockError);
  });

  it('should allow preview alongside a regular job, but not two previews', () => {
    const { manager } = setup();
    manager.start('preview', {});
    expect(() => manager.start('preview', {})).toThrow(JobLockError);
    expect(() => manager.start('sync', {})).not.toThrow();
  });

  it('should mark success/failure from exit code and persist history', () => {
    const { manager, children, dataDir } = setup();
    const job = manager.start('sync', {});
    children[0].emit('exit', 0);
    expect(manager.get(job.id)!.status).toBe('succeeded');
    const saved = JSON.parse(readFileSync(join(dataDir, 'jobs.json'), 'utf-8')) as Array<{ id: string }>;
    expect(saved[0].id).toBe(job.id);

    const job2 = manager.start('build', {});
    children[1].emit('exit', 1);
    expect(manager.get(job2.id)!.status).toBe('failed');
  });

  it('should mark canceled jobs', () => {
    const { manager, children } = setup();
    const job = manager.start('sync', {});
    // FakeChild.kill() emits exit(null) synchronously.
    expect(manager.cancel(job.id)).toBe(true);
    expect(manager.get(job.id)!.status).toBe('canceled');
  });

  it('should release the lock after a job ends', () => {
    const { manager, children } = setup();
    manager.start('sync', {});
    children[0].emit('exit', 0);
    expect(() => manager.start('build', {})).not.toThrow();
  });

  it('should treat a spawn "error" event like a failed exit and release the lock', () => {
    const { manager, children, dataDir } = setup();
    const job = manager.start('sync', {});
    children[0].emit('error', new Error('spawn ENOENT'));

    const record = manager.get(job.id)!;
    expect(record.status).toBe('failed');
    expect(record.exitCode).toBeNull();
    expect(record.logs).toContain('spawn ENOENT');

    // Lock should be released so a new non-preview job can start.
    expect(() => manager.start('build', {})).not.toThrow();

    const saved = JSON.parse(readFileSync(join(dataDir, 'jobs.json'), 'utf-8')) as Array<{ id: string }>;
    expect(saved.filter((r) => r.id === job.id)).toHaveLength(1);
  });

  it('should finalize only once when both "error" and "exit" fire for the same child', () => {
    const { manager, children, dataDir } = setup();
    const job = manager.start('sync', {});
    children[0].emit('error', new Error('boom'));
    children[0].emit('exit', 1);

    expect(manager.get(job.id)!.status).toBe('failed');
    const saved = JSON.parse(readFileSync(join(dataDir, 'jobs.json'), 'utf-8')) as Array<{ id: string }>;
    expect(saved.filter((r) => r.id === job.id)).toHaveLength(1);
  });

  it('should isolate a throwing listener so other listeners and logging continue', () => {
    const { manager, children } = setup();
    const seen: string[] = [];
    manager.onLog(() => {
      throw new Error('listener boom');
    });
    manager.onLog((_id, line) => seen.push(line));
    const job = manager.start('sync', {});

    expect(() => children[0].stdout.emit('data', Buffer.from('a\nb\n'))).not.toThrow();
    expect(manager.get(job.id)!.logs).toEqual(['a', 'b']);
    expect(seen).toEqual(['a', 'b']);
  });

  it('should buffer a partial line split across chunks', () => {
    const { manager, children } = setup();
    const job = manager.start('sync', {});
    children[0].stdout.emit('data', Buffer.from('hel'));
    children[0].stdout.emit('data', Buffer.from('lo\nworld\n'));
    expect(manager.get(job.id)!.logs).toEqual(['hello', 'world']);
  });

  it('should flush a trailing partial line without a newline on finalize', () => {
    const { manager, children } = setup();
    const job = manager.start('sync', {});
    children[0].stdout.emit('data', Buffer.from('no newline at end'));
    children[0].emit('exit', 0);
    expect(manager.get(job.id)!.logs).toEqual(['no newline at end']);
  });

  it('should escalate to SIGKILL if the child ignores SIGTERM, then mark it canceled', () => {
    vi.useFakeTimers();
    try {
      const { manager, children } = setup();
      const job = manager.start('sync', {});
      children[0].ignoreKill = true;

      expect(manager.cancel(job.id)).toBe(true);
      expect(children[0].killSignals).toEqual(['SIGTERM']);
      expect(manager.get(job.id)!.status).toBe('running');

      vi.advanceTimersByTime(5_000);
      expect(children[0].killSignals).toEqual(['SIGTERM', 'SIGKILL']);

      // Simulate the child actually dying in response to SIGKILL.
      children[0].emit('exit', null);
      expect(manager.get(job.id)!.status).toBe('canceled');
    } finally {
      vi.useRealTimers();
    }
  });

  it('should notify exit listeners with the final status when a job ends', () => {
    const { manager, children } = setup();
    const seen: Array<{ id: string; status: string }> = [];
    manager.onExit((id, status) => seen.push({ id, status }));
    const job = manager.start('sync', {});
    children[0].emit('exit', 0);
    expect(seen).toEqual([{ id: job.id, status: 'succeeded' }]);
  });

  it('should notify exit listeners on a spawn error and only once', () => {
    const { manager, children } = setup();
    const seen: string[] = [];
    manager.onExit((_id, status) => seen.push(status));
    manager.start('sync', {});
    children[0].emit('error', new Error('boom'));
    children[0].emit('exit', 1);
    expect(seen).toEqual(['failed']);
  });

  it('should kill the whole process group when the child exposes a pid', () => {
    const killSpy = vi.spyOn(process, 'kill').mockImplementation(() => true);
    try {
      const { manager, children } = setup();
      const job = manager.start('sync', {});
      children[0].pid = 123;

      expect(manager.cancel(job.id)).toBe(true);
      expect(killSpy).toHaveBeenCalledWith(-123, 'SIGTERM');
    } finally {
      killSpy.mockRestore();
    }
  });

  it('should fall back to child.kill when the group kill fails', () => {
    const killSpy = vi.spyOn(process, 'kill').mockImplementation(() => {
      throw new Error('ESRCH');
    });
    try {
      const { manager, children } = setup();
      const job = manager.start('sync', {});
      children[0].pid = 123;

      expect(manager.cancel(job.id)).toBe(true);
      // Group kill threw, so the plain child.kill path must have been used.
      expect(children[0].killSignals).toEqual(['SIGTERM']);
      // FakeChild.kill emits exit synchronously, so the job ends canceled.
      expect(manager.get(job.id)!.status).toBe('canceled');
    } finally {
      killSpy.mockRestore();
    }
  });
});
