import { execFile } from 'child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

export interface ExecResult {
  stdout: string;
  stderr: string;
}

export type ExecFn = (cmd: string, args: string[], opts: { cwd: string }) => Promise<ExecResult>;

const defaultExec: ExecFn = (cmd, args, opts) =>
  new Promise((resolvePromise, reject) => {
    execFile(cmd, args, { cwd: opts.cwd, maxBuffer: 10 * 1024 * 1024 }, (error, stdout, stderr) => {
      if (error) {
        reject(new Error(`${cmd} ${args.join(' ')} failed: ${stderr || error.message}`));
      } else {
        resolvePromise({ stdout, stderr });
      }
    });
  });

export interface ChangedFile {
  status: string;
  path: string;
}

export interface DeployStatus {
  branch: string;
  changedFiles: ChangedFile[];
  ahead: number;
}

export interface DeployStep {
  cmd: string;
  output: string;
}

export interface DeployRecord {
  at: string;
  message: string;
  ok: boolean;
  steps: DeployStep[];
  error?: string;
}

export interface DeployService {
  status(): Promise<DeployStatus>;
  deploy(message: string): Promise<DeployRecord>;
  history(): DeployRecord[];
}

const MAX_HISTORY = 20;

export function createDeployService(deps: { projectRoot: string; dataDir: string; execFn?: ExecFn }): DeployService {
  const execFn = deps.execFn ?? defaultExec;
  const historyPath = join(deps.dataDir, 'deploys.json');

  function git(...args: string[]): Promise<ExecResult> {
    return execFn('git', args, { cwd: deps.projectRoot });
  }

  function loadHistory(): DeployRecord[] {
    try {
      return JSON.parse(readFileSync(historyPath, 'utf-8')) as DeployRecord[];
    } catch {
      return [];
    }
  }

  function persist(record: DeployRecord): void {
    if (!existsSync(deps.dataDir)) mkdirSync(deps.dataDir, { recursive: true });
    writeFileSync(
      historyPath,
      JSON.stringify([record, ...loadHistory()].slice(0, MAX_HISTORY), null, 2),
      'utf-8',
    );
  }

  async function status(): Promise<DeployStatus> {
    const { stdout: branchOut } = await git('rev-parse', '--abbrev-ref', 'HEAD');
    const { stdout: porcelain } = await git('status', '--porcelain');
    const changedFiles = porcelain
      .split('\n')
      .filter((line) => line.trim().length > 0)
      .map((line) => {
        const statusCode = line.slice(0, 2).trim();
        let pathPart = line.slice(3);
        // For renamed/copied files, git outputs "R  old.md -> new.md"
        // Extract only the target path (after " -> ")
        if ((statusCode === 'R' || statusCode === 'C') && pathPart.includes(' -> ')) {
          const parts = pathPart.split(' -> ');
          pathPart = parts[parts.length - 1];
        }
        return { status: statusCode, path: pathPart };
      });
    let ahead = 0;
    try {
      const { stdout } = await git('rev-list', '--count', '@{u}..HEAD');
      ahead = parseInt(stdout.trim(), 10) || 0;
    } catch {
      ahead = 0;
    }
    return { branch: branchOut.trim(), changedFiles, ahead };
  }

  return {
    status,
    async deploy(message: string): Promise<DeployRecord> {
      const record: DeployRecord = { at: new Date().toISOString(), message, ok: false, steps: [] };
      try {
        const current = await status();
        const commands: string[][] = [];
        if (current.changedFiles.length > 0) {
          commands.push(['add', '-A'], ['commit', '-m', message]);
        }
        commands.push(['push']);
        for (const args of commands) {
          const { stdout, stderr } = await git(...args);
          record.steps.push({ cmd: `git ${args.join(' ')}`, output: `${stdout}${stderr}`.trim() });
        }
        record.ok = true;
      } catch (error) {
        record.error = error instanceof Error ? error.message : String(error);
      }
      persist(record);
      return record;
    },
    history(): DeployRecord[] {
      return loadHistory();
    },
  };
}
