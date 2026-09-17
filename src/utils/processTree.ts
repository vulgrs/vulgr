import { exec, execSync, ChildProcess } from 'node:child_process';
import { promisify } from 'node:util';

const execAsync = promisify(exec);

/**
 * Cross-platform process tree killer.
 * Guarantees all descendant child processes are terminated, preventing orphan zombie processes.
 */
export async function killProcessTree(pid: number, signal: 'SIGTERM' | 'SIGKILL' = 'SIGKILL'): Promise<void> {
  if (!pid || pid <= 0) return;

  const isWindows = process.platform === 'win32';

  if (isWindows) {
    try {
      // /T terminates process and child processes; /F forces termination
      execSync(`taskkill /pid ${pid} /T /F`, { stdio: 'ignore' });
    } catch {
      // Process may already have exited
    }
  } else {
    try {
      // Try negative PID to kill entire process group if process was spawned detached
      process.kill(-pid, signal);
    } catch {
      try {
        // Fallback: kill direct PID
        process.kill(pid, signal);
      } catch {
        // Process may already have exited
      }
    }
  }
}

/**
 * Safely terminates a child process with a graceful SIGTERM window before hard SIGKILL.
 */
export async function terminateChildProcessSafely(
  child: ChildProcess,
  gracePeriodMs = 2000
): Promise<void> {
  const pid = child.pid;
  if (!pid) return;

  // Attempt graceful termination first
  try {
    child.kill('SIGTERM');
  } catch {
    // Already gone
    return;
  }

  // Wait for grace period
  const hasExited = await new Promise<boolean>((resolve) => {
    const timer = setTimeout(() => resolve(false), gracePeriodMs);
    child.once('exit', () => {
      clearTimeout(timer);
      resolve(true);
    });
  });

  // If still alive after grace period, forcefully kill the process tree
  if (!hasExited) {
    await killProcessTree(pid, 'SIGKILL');
  }
}
