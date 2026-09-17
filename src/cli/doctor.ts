import pc from 'picocolors';
import { execSync } from 'node:child_process';
import { ClaudeAdapter } from '../adapters/claude.js';
import { GeminiAdapter } from '../adapters/gemini.js';
import { GitUtils } from '../git/gitUtils.js';
import { logger } from '../utils/logger.js';

interface CheckItem {
  name: string;
  ok: boolean;
  version?: string;
  details?: string;
  actionRequired?: string;
}

export async function runDoctorCheck(cwd: string = process.cwd()): Promise<boolean> {
  logger.banner('ORCHESTRATOR SYSTEM DIAGNOSTICS', 'Checking local environment, CLI tools & git repository');

  const checks: CheckItem[] = [];

  // 1. Node.js check
  const nodeVer = process.version;
  const nodeMajor = parseInt(nodeVer.replace('v', '').split('.')[0], 10);
  checks.push({
    name: 'Node.js Runtime',
    ok: nodeMajor >= 20,
    version: nodeVer,
    details: nodeMajor >= 20 ? 'Modern ESM supported' : 'Node 20+ required for native ESM',
    actionRequired: nodeMajor >= 20 ? undefined : 'Upgrade Node.js to version >= 20.0.0',
  });

  // 2. Git check
  let gitOk = false;
  let gitVer = '';
  try {
    gitVer = execSync('git --version', { encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    gitOk = true;
  } catch {
    gitOk = false;
  }

  checks.push({
    name: 'Git Version Control',
    ok: gitOk,
    version: gitVer || undefined,
    details: gitOk ? 'Available in PATH' : 'Git not found',
    actionRequired: gitOk ? undefined : 'Install Git and add to system PATH',
  });

  // 3. Git Worktree check
  const gitUtils = new GitUtils(cwd);
  const isRepo = gitUtils.isGitRepo();
  checks.push({
    name: 'Git Repository Context',
    ok: isRepo,
    details: isRepo ? 'Valid git repository detected' : 'Current directory is not a git repo',
    actionRequired: isRepo ? undefined : 'Run "git init" to enable patch tracking and rollback',
  });

  // 4. Claude CLI check
  const claudeAdapter = new ClaudeAdapter();
  const claudeAvail = await claudeAdapter.isAvailable();
  const claudeVer = claudeAvail ? await claudeAdapter.getVersion() : null;
  checks.push({
    name: 'Claude CLI (Anthropic)',
    ok: claudeAvail,
    version: claudeVer || undefined,
    details: claudeAvail ? 'Official binary found' : 'claude command not found in PATH',
    actionRequired: claudeAvail ? undefined : 'Install Claude Code (e.g. npm install -g @anthropic-ai/claude-code)',
  });

  // 5. Gemini CLI check
  const geminiAdapter = new GeminiAdapter();
  const geminiAvail = await geminiAdapter.isAvailable();
  const geminiVer = geminiAvail ? await geminiAdapter.getVersion() : null;
  checks.push({
    name: 'Gemini CLI (Google)',
    ok: geminiAvail,
    version: geminiVer || undefined,
    details: geminiAvail ? 'Official binary found' : 'gemini command not found in PATH (Mock available)',
    actionRequired: geminiAvail ? undefined : 'Install official Gemini CLI or run with --reviewer mock',
  });

  // Render diagnostics table
  console.log();
  for (const c of checks) {
    const icon = c.ok ? pc.green('✔ PASS') : pc.yellow('⚠ WARN');
    const verStr = c.version ? pc.dim(` (${c.version})`) : '';
    console.log(` ${icon}  ${pc.bold(c.name.padEnd(26))}${verStr}`);
    if (c.details) {
      console.log(`       ${pc.dim(c.details)}`);
    }
    if (c.actionRequired) {
      console.log(`       ${pc.cyan('↳ Action:')} ${c.actionRequired}`);
    }
    console.log();
  }

  const allPassed = checks.filter((c) => !c.ok).length === 0;
  if (allPassed) {
    logger.success('All diagnostic checks passed. System is fully operational!');
  } else {
    logger.info('System is usable, but please review the warnings above for full multi-model capability.');
  }

  return allPassed;
}
