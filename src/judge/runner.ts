import * as cp from 'child_process';
import * as fs from 'fs';
import { ExecutionResult, JudgeVerdict } from '../types';

export interface RunnerOptions {
  timeLimitMs: number;
  memoryLimitMb: number;
  cwd?: string;
}

export class CodeRunner {
  private static readonly MAX_OUTPUT_BYTES = 10 * 1024 * 1024; // 10MB guard

  public async run(
    command: string,
    args: string[],
    inputData: string,
    options: RunnerOptions
  ): Promise<ExecutionResult> {
    const { timeLimitMs, memoryLimitMb, cwd = process.cwd() } = options;

    return new Promise((resolve) => {
      let stdout = '';
      let stderr = '';
      let peakMemoryKb = 0;
      let timedOut = false;
      let memoryExceeded = false;
      let isFinished = false;

      const startTime = process.hrtime.bigint();

      // Launch process
      let child: cp.ChildProcess;
      try {
        child = cp.spawn(command, args, {
          cwd,
          stdio: ['pipe', 'pipe', 'pipe'],
          env: process.env,
        });
      } catch (err) {
        const elapsedNs = process.hrtime.bigint() - startTime;
        return resolve({
          verdict: 'RTE',
          stdout: '',
          stderr: `Failed to spawn process: ${(err as Error).message}`,
          executionTimeMs: Number(elapsedNs) / 1_000_000,
          memoryUsageMb: 0,
          exitCode: -1,
          signal: null,
          error: (err as Error).message,
        });
      }

      // Memory monitor timer for Linux /proc
      let memoryInterval: NodeJS.Timeout | undefined;
      const pid = child.pid;

      const checkMemory = () => {
        if (isFinished || !pid) {
          return;
        }
        try {
          const statusPath = `/proc/${pid}/status`;
          if (fs.existsSync(statusPath)) {
            const status = fs.readFileSync(statusPath, 'utf8');
            const vmHwmMatch = status.match(/VmHWM:\s+(\d+)\s+kB/);
            const vmrssMatch = status.match(/VmRSS:\s+(\d+)\s+kB/);
            const hwm = vmHwmMatch ? parseInt(vmHwmMatch[1], 10) : 0;
            const rss = vmrssMatch ? parseInt(vmrssMatch[1], 10) : 0;
            const currentKb = Math.max(hwm, rss);

            if (currentKb > peakMemoryKb) {
              peakMemoryKb = currentKb;
            }

            if (peakMemoryKb / 1024 > memoryLimitMb && memoryLimitMb > 0) {
              memoryExceeded = true;
              this.terminateChild(child);
            }
          }
        } catch {
          // Process might have terminated, ignore read error
        }
      };

      if (pid && process.platform === 'linux') {
        checkMemory();
        memoryInterval = setInterval(checkMemory, 5);
      }

      // Time Limit (TL) enforcement
      const timeoutTimer = setTimeout(() => {
        if (!isFinished) {
          timedOut = true;
          this.terminateChild(child);
        }
      }, timeLimitMs);

      // Feed input to stdin safely
      if (child.stdin) {
        child.stdin.on('error', (err: NodeJS.ErrnoException) => {
          // Swallow EPIPE or pipe write errors if child process terminates early
          if (err && err.code !== 'EPIPE') {
            // Silently swallow closed-pipe write errors
          }
        });

        try {
          child.stdin.write(inputData);
          child.stdin.end();
        } catch {
          // Process might have died before stdin write
        }
      }

      child.stdout?.on('data', (data: Buffer) => {
        if (stdout.length < CodeRunner.MAX_OUTPUT_BYTES) {
          stdout += data.toString('utf8');
        }
        if (process.platform === 'linux') {
          checkMemory();
        }
      });

      child.stderr?.on('data', (data: Buffer) => {
        if (stderr.length < CodeRunner.MAX_OUTPUT_BYTES) {
          stderr += data.toString('utf8');
        }
        if (process.platform === 'linux') {
          checkMemory();
        }
      });

      child.on('error', (err) => {
        if (isFinished) {
          return;
        }
        isFinished = true;
        clearTimeout(timeoutTimer);
        if (memoryInterval) {
          clearInterval(memoryInterval);
        }

        const elapsedNs = process.hrtime.bigint() - startTime;
        resolve({
          verdict: 'RTE',
          stdout,
          stderr: `${stderr}\nExecution error: ${err.message}`,
          executionTimeMs: Number(elapsedNs) / 1_000_000,
          memoryUsageMb: peakMemoryKb / 1024,
          exitCode: -1,
          signal: null,
          error: err.message,
        });
      });

      child.on('close', (code, signal) => {
        if (isFinished) {
          return;
        }
        isFinished = true;
        clearTimeout(timeoutTimer);
        if (memoryInterval) {
          clearInterval(memoryInterval);
        }

        const elapsedNs = process.hrtime.bigint() - startTime;
        let executionTimeMs = Math.round((Number(elapsedNs) / 1_000_000) * 10) / 10;

        // Try getting resource usage from child if supported
        try {
          const usage = (child as unknown as { resourceUsage?: () => { maxRSS: number } }).resourceUsage?.();
          if (usage && usage.maxRSS > 0) {
            // On Linux, maxRSS is in kilobytes; on macOS it's in bytes
            const rssKb = process.platform === 'darwin' ? usage.maxRSS / 1024 : usage.maxRSS;
            if (rssKb > peakMemoryKb) {
              peakMemoryKb = rssKb;
            }
          }
        } catch {
          // Ignore
        }

        const memoryUsageMb = Math.round((peakMemoryKb / 1024) * 100) / 100;

        let verdict: JudgeVerdict;
        if (timedOut) {
          verdict = 'TLE';
          executionTimeMs = Math.max(executionTimeMs, timeLimitMs);
        } else if (memoryExceeded || (memoryUsageMb > memoryLimitMb && memoryLimitMb > 0)) {
          verdict = 'MLE';
        } else if (code !== 0 || signal !== null) {
          verdict = 'RTE';
        } else {
          verdict = 'PENDING'; // Caller will compare output to set AC or WA
        }

        resolve({
          verdict,
          stdout,
          stderr,
          executionTimeMs,
          memoryUsageMb,
          exitCode: code,
          signal: signal ? String(signal) : null,
        });
      });
    });
  }

  private terminateChild(child: cp.ChildProcess): void {
    try {
      if (child.pid) {
        if (process.platform === 'win32') {
          try {
            cp.execSync(`taskkill /pid ${child.pid} /T /F`, { stdio: 'ignore' });
          } catch {
            child.kill();
          }
        } else {
          // Kill process group if possible or direct SIGKILL
          try {
            process.kill(-child.pid, 'SIGKILL');
          } catch {
            child.kill('SIGKILL');
          }
        }
      }
    } catch {
      // Process already terminated
    }
  }
}
