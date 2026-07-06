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
  on(event: 'error', cb: (err: Error) => void): unknown;
  kill(signal?: NodeJS.Signals): boolean;
}

export type SpawnFn = (cmd: string, args: string[], opts: { cwd: string }) => ChildLike;

export class JobLockError extends Error {}

const MAX_MEMORY_LOG_LINES = 2000;
const MAX_PERSISTED_LOG_LINES = 500;
const MAX_HISTORY = 50;
// Grace period after SIGTERM before escalating to SIGKILL for an unresponsive child.
const KILL_ESCALATION_MS = 5_000;

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

// Bookkeeping kept alongside a running job's record and child handle.
interface ActiveEntry {
  record: JobRecord;
  child: ChildLike;
  pendingStdout: string;
  pendingStderr: string;
  killTimer: NodeJS.Timeout | null;
  finalized: boolean;
}

export function createJobManager(deps: { projectRoot: string; dataDir: string; spawnFn?: SpawnFn }): JobManager {
  const spawnFn: SpawnFn = deps.spawnFn ?? ((cmd, args, opts) => spawn(cmd, args, opts));
  const historyPath = join(deps.dataDir, 'jobs.json');
  const active = new Map<string, ActiveEntry>();
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

  // Notify listeners of a completed log line, isolating each callback so a
  // throwing listener (e.g. a broken SSE subscriber) cannot break log processing
  // for the job or for other listeners.
  function notifyListeners(jobId: string, line: string): void {
    for (const cb of listeners) {
      try {
        cb(jobId, line);
      } catch {
        // Swallow: a misbehaving listener must not affect other listeners or the job.
      }
    }
  }

  function recordLine(record: JobRecord, line: string): void {
    if (line.length === 0) return;
    record.logs.push(line);
    if (record.logs.length > MAX_MEMORY_LOG_LINES) {
      record.logs.splice(0, record.logs.length - MAX_MEMORY_LOG_LINES);
    }
    notifyListeners(record.id, line);
  }

  // Append a stream chunk, buffering any trailing partial line so a line split
  // across two 'data' events is not recorded as two separate lines.
  function appendChunk(entry: ActiveEntry, stream: 'stdout' | 'stderr', chunk: Buffer | string): void {
    const pendingKey = stream === 'stdout' ? 'pendingStdout' : 'pendingStderr';
    const text = entry[pendingKey] + chunk.toString();
    const parts = text.split('\n');
    entry[pendingKey] = parts.pop() ?? '';
    for (const line of parts) {
      recordLine(entry.record, line);
    }
  }

  // Flush any buffered partial line (e.g. a final chunk without a trailing newline).
  function flushPending(entry: ActiveEntry): void {
    if (entry.pendingStdout.length > 0) {
      recordLine(entry.record, entry.pendingStdout);
      entry.pendingStdout = '';
    }
    if (entry.pendingStderr.length > 0) {
      recordLine(entry.record, entry.pendingStderr);
      entry.pendingStderr = '';
    }
  }

  // Shared terminal bookkeeping for both the 'exit' and 'error' child events.
  // Guarded so it runs at most once per job, since both events can fire for the same child.
  function finalize(entry: ActiveEntry, status: JobStatus, exitCode: number | null): void {
    if (entry.finalized) return;
    entry.finalized = true;

    if (entry.killTimer) {
      clearTimeout(entry.killTimer);
      entry.killTimer = null;
    }

    flushPending(entry);

    entry.record.endedAt = new Date().toISOString();
    entry.record.exitCode = exitCode;
    entry.record.status = status;
    canceled.delete(entry.record.id);
    active.delete(entry.record.id);
    persist(entry.record);
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
      const entry: ActiveEntry = {
        record,
        child,
        pendingStdout: '',
        pendingStderr: '',
        killTimer: null,
        finalized: false,
      };
      active.set(record.id, entry);

      child.stdout?.on('data', (chunk) => appendChunk(entry, 'stdout', chunk));
      child.stderr?.on('data', (chunk) => appendChunk(entry, 'stderr', chunk));
      child.on('exit', (code) => {
        const status: JobStatus = canceled.has(record.id) ? 'canceled' : code === 0 ? 'succeeded' : 'failed';
        finalize(entry, status, code);
      });
      // A spawn-time failure (e.g. ENOENT) surfaces as an 'error' event, sometimes
      // without a following 'exit'. Without this handler Node throws uncaught and
      // the job's lock would never be released.
      child.on('error', (err) => {
        recordLine(entry.record, err.message);
        finalize(entry, 'failed', null);
      });

      return record;
    },
    cancel(id: string): boolean {
      const entry = active.get(id);
      if (!entry) return false;
      canceled.add(id);
      entry.child.kill('SIGTERM');

      // If the child already terminated synchronously in response to SIGTERM
      // (as fakes in tests do), there is nothing left to escalate.
      if (!active.has(id)) return true;

      const timer = setTimeout(() => {
        if (active.has(id)) {
          entry.child.kill('SIGKILL');
        }
      }, KILL_ESCALATION_MS);
      timer.unref();
      entry.killTimer = timer;
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
