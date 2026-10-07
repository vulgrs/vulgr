import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Tests written from the user's goal: when no test command is given, the
 * checker agent first writes tests for the goal and names the command that
 * runs them, and the writer then works until those tests pass.
 */

/** Prompt for the agent that writes the tests before anything is implemented. */
export function buildTestPlanPrompt(goal: string, extra: string[] = []): string {
  return [
    `Another coding agent will implement this goal next: "${goal}"`,
    '',
    'Before they start, write the automated tests that prove the goal is met. Do not implement the goal itself.',
    "Use the test setup this project already has (package.json scripts, existing test files, pytest, go test, cargo test...). If there is none, use the language's built-in runner, for JavaScript node:test run with `node --test`.",
    'Cover the behaviour the goal asks for, including the edge cases it mentions. These tests are expected to fail until the goal is implemented.',
    'Do not ask questions; make reasonable assumptions about names and signatures and state them in a comment at the top of the test file.',
    'Finish your reply with exactly one line: "TEST_COMMAND: <shell command that runs these tests>".',
    ...extra.filter(Boolean),
  ].join('\n');
}

/** The command from the agent's last `TEST_COMMAND:` line, if it gave one. */
export function parseTestCommand(output: string): string | null {
  // Terminal output may carry colour codes and \r; the line must start with the
  // marker so an echo of the instruction itself never counts.
  const clean = output.replace(/\x1b\[[0-9;?]*[a-zA-Z]/g, '').replace(/\r/g, '');
  const matches = [...clean.matchAll(/^[\s*>-]*TEST_COMMAND:\s*`*([^`\n]+?)`*[\s*]*$/gim)];
  const cmd = matches.length ? matches[matches.length - 1][1].trim() : '';
  return cmd && !/^<.*>$/.test(cmd) ? cmd : null;
}

/** The project's own test command, for when no agent named one. */
export function detectTestCommand(cwd: string): string | null {
  const has = (f: string) => existsSync(join(cwd, f));
  try {
    const pkg = JSON.parse(readFileSync(join(cwd, 'package.json'), 'utf-8'));
    const script: string | undefined = pkg.scripts?.test;
    if (script && !/no test specified/.test(script)) {
      const pm = has('pnpm-lock.yaml') ? 'pnpm' : has('yarn.lock') ? 'yarn' : has('bun.lockb') || has('bun.lock') ? 'bun' : 'npm';
      return `${pm} test`;
    }
    return 'node --test';
  } catch {
    // Not a Node project.
  }
  if (has('pyproject.toml') || has('pytest.ini') || has('setup.py') || has('requirements.txt')) return 'python -m pytest';
  if (has('go.mod')) return 'go test ./...';
  if (has('Cargo.toml')) return 'cargo test';
  return null;
}
