import { spawn } from 'child_process';
import { randomUUID } from 'crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

export type JobType = 'sync' | 'translate' | 'build' | 'preview';
export type JobStatus = 'running' | 'succeeded' | 'failed' | 'canceled';

export interface JobOptions {
  sourcePath?: string;
}

export interface JobRecord {
  id: string;
  type: JobType;
  status: JobStatus;
  startedAt: string;
  endedAt: string | null;
  exitCode: number | null;
  options: JobOptions;
  logs: string[];
}

// Minimal child-process surface so tests can substitute a fake.
export interface ChildLike {
  stdout: { on(event: 'data', cb: (chunk: Buffer | string) => void): unknown } | null;
  stderr: { on(event: 'data', cb: (chunk: Buffer | string) => void): unknown } | null;
  on(event: 'exit', cb: (code: number | null) => void): unknown;
  kill(signal?: NodeJS.Signals): boolean;
}

export type SpawnFn = (cmd: string, args: string[], opts: { cwd: string }) => ChildLike;

export class JobLockError extends Error {}

const MAX_MEMORY_LOG_LINES = 2000;
const MAX_PERSISTED_LOG_LINES = 500;
const MAX_HISTORY = 50;

export function commandFor(type: JobType, options: JobOptions): { cmd: string; args: string[] } {
  switch (type) {
    case 'sync': {
      const args = ['scripts/sync.ts'];
      if (options.sourcePath) args.push('--source', options.sourcePath);
      return { cmd: process.execPath, args };
    }
    case 'translate':
      return { cmd: process.execPath, args: ['scripts/translate.ts'] };
    case 'build':
      return { cmd: 'npm', args: ['run', 'build'] };
    case 'preview':
      return { cmd: 'npm', args: ['run', 'preview'] };
  }
}

export interface JobManager {
  start(type: JobType, options?: JobOptions): JobRecord;
  cancel(id: string): boolean;
  list(): JobRecord[];
  get(id: string): JobRecord | undefined;
  onLog(cb: (jobId: string, line: string) => void): () => void;
}

export function createJobManager(deps: { projectRoot: string; dataDir: string; spawnFn?: SpawnFn }): JobManager {
  const spawnFn: SpawnFn = deps.spawnFn ?? ((cmd, args, opts) => spawn(cmd, args, opts));
  const historyPath = join(deps.dataDir, 'jobs.json');
  const active = new Map<string, { record: JobRecord; child: ChildLike }>();
  const canceled = new Set<string>();
  const listeners = new Set<(jobId: string, line: string) => void>();

  function loadHistory(): JobRecord[] {
    try {
      return JSON.parse(readFileSync(historyPath, 'utf-8')) as JobRecord[];
    } catch {
      return [];
    }
  }

  function persist(record: JobRecord): void {
    if (!existsSync(deps.dataDir)) mkdirSync(deps.dataDir, { recursive: true });
    const trimmed: JobRecord = { ...record, logs: record.logs.slice(-MAX_PERSISTED_LOG_LINES) };
    const history = [trimmed, ...loadHistory()].slice(0, MAX_HISTORY);
    writeFileSync(historyPath, JSON.stringify(history, null, 2), 'utf-8');
  }

  function appendLog(record: JobRecord, chunk: Buffer | string): void {
    for (const line of chunk.toString().split('\n')) {
      if (line.length === 0) continue;
      record.logs.push(line);
      if (record.logs.length > MAX_MEMORY_LOG_LINES) {
        record.logs.splice(0, record.logs.length - MAX_MEMORY_LOG_LINES);
      }
      for (const cb of listeners) cb(record.id, line);
    }
  }

  function runningOfKind(preview: boolean): JobRecord | undefined {
    for (const { record } of active.values()) {
      if ((record.type === 'preview') === preview && record.status === 'running') return record;
    }
    return undefined;
  }

  return {
    start(type: JobType, options: JobOptions = {}): JobRecord {
      const isPreview = type === 'preview';
      const conflict = runningOfKind(isPreview);
      if (conflict) {
        throw new JobLockError(`A ${conflict.type} job is already running`);
      }

      const record: JobRecord = {
        id: randomUUID(),
        type,
        status: 'running',
        startedAt: new Date().toISOString(),
        endedAt: null,
        exitCode: null,
        options,
        logs: [],
      };
      const { cmd, args } = commandFor(type, options);
      const child = spawnFn(cmd, args, { cwd: deps.projectRoot });
      active.set(record.id, { record, child });

      child.stdout?.on('data', (chunk) => appendLog(record, chunk));
      child.stderr?.on('data', (chunk) => appendLog(record, chunk));
      child.on('exit', (code) => {
        record.endedAt = new Date().toISOString();
        record.exitCode = code;
        record.status = canceled.has(record.id) ? 'canceled' : code === 0 ? 'succeeded' : 'failed';
        canceled.delete(record.id);
        active.delete(record.id);
        persist(record);
      });

      return record;
    },
    cancel(id: string): boolean {
      const entry = active.get(id);
      if (!entry) return false;
      canceled.add(id);
      entry.child.kill('SIGTERM');
      return true;
    },
    list(): JobRecord[] {
      const runningRecords = [...active.values()].map((e) => e.record);
      return [...runningRecords, ...loadHistory()];
    },
    get(id: string): JobRecord | undefined {
      return active.get(id)?.record ?? loadHistory().find((r) => r.id === id);
    },
    onLog(cb: (jobId: string, line: string) => void): () => void {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
  };
}
