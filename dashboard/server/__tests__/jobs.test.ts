import { describe, it, expect } from 'vitest';
import { EventEmitter } from 'events';
import { mkdtempSync, readFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { commandFor, createJobManager, JobLockError, type SpawnFn } from '../services/jobs.ts';

class FakeChild extends EventEmitter {
  stdout = new EventEmitter();
  stderr = new EventEmitter();
  kill(): boolean {
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
});
