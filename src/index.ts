#!/usr/bin/env node

import { Command } from 'commander';
import pc from 'picocolors';
import { OrchestrationEngine } from './engine/orchestrator.js';
import { AgentMesh } from './engine/agentMesh.js';
import { Orchestra } from './engine/orchestra.js';
import { runDoctorCheck } from './cli/doctor.js';
import { ContextBus } from './bus/contextBus.js';
import { logger } from './utils/logger.js';

const program = new Command();

program
  .name('orchestrate')
  .description('Multi-CLI Orchestrator & Autonomous Agent Mesh')
  .version('1.0.0');

// Subcommand: mesh (Autonomous A2A Communication)
program
  .command('mesh')
  .description('Run autonomous inter-CLI agent mesh (CLIs talk to each other without manual intervention)')
  .argument('<goal>', 'High-level engineering goal')
  .option('-b, --builder <cli>', 'Builder CLI (claude, agy, codex, opencode, cursor, gemini, mock)', 'claude')
  .option('-v, --verifier <cli>', 'Verifier CLI (same choices)', 'agy')
  .option('-a, --auditor <cli>', 'Auditor CLI (same choices)', 'claude')
  .option('--verify-cmd <cmd>', 'Command that must pass (e.g. "npm test"). Omit it and the verifier writes tests from the goal first')
  .option('--max-rounds <number>', 'Maximum autonomous repair rounds', '3')
  .action(async (goal: string, options) => {
    try {
      const mesh = new AgentMesh({
        builder: options.builder,
        verifier: options.verifier,
        auditor: options.auditor,
        verifyCmd: options.verifyCmd,
        maxRounds: parseInt(options.maxRounds, 10) || 3,
        cwd: process.cwd(),
        // Progress lines, so a long agent turn doesn't look like a hang.
        onStatus: (status) => {
          if (status.stage === 'done') logger.success(status.text);
          else if (status.stage !== 'failed') logger.info(status.text);
        },
      });
      const result = await mesh.runMesh(goal);
      if (result.auditNotes) {
        logger.divider();
        console.log(result.auditNotes);
      }
      if (!result.success || result.audit === 'rejected') {
        process.exit(1);
      }
    } catch (err: any) {
      logger.error('Autonomous mesh failed:', err.message || err);
      process.exit(1);
    }
  });

// Subcommand: orchestra (planner splits the goal, workers run the parts in parallel)
program
  .command('orchestra')
  .description('Split a big goal into tasks that several agents do at the same time, then combine and review them')
  .argument('<goal>', 'High-level engineering goal')
  .option('-p, --planner <cli>', 'Agent that plans the tasks and resolves conflicts', 'claude')
  .option('-w, --workers <clis>', 'Comma-separated agents that do the tasks', 'claude')
  .option('-r, --reviewer <cli>', 'Agent that reviews the combined change', 'claude')
  .option('--verify-cmd <cmd>', "Command that must pass (default: the project's test command)")
  .option('--parallel <n>', 'Agents working at the same time', '3')
  .option('--max-rounds <n>', 'Attempts per task while its tests fail', '2')
  .action(async (goal: string, options) => {
    const orchestra = new Orchestra({
      planner: options.planner,
      workers: String(options.workers).split(',').map((w: string) => w.trim()).filter(Boolean),
      reviewer: options.reviewer,
      verifyCmd: options.verifyCmd,
      maxParallel: parseInt(options.parallel, 10) || 3,
      maxRounds: parseInt(options.maxRounds, 10) || 2,
      cwd: process.cwd(),
      onEvent: (e) => {
        if (e.type === 'status' && e.phase !== 'done' && e.phase !== 'failed') logger.info(e.text);
        else if (e.type === 'plan') e.tasks.forEach((t) => logger.info(`  [${t.id}] ${t.title} → ${t.agent}${t.dependsOn.length ? ` (${t.dependsOn.join(', ')})` : ''}`));
        else if (e.type === 'task' && ['done', 'failed', 'skipped'].includes(e.state)) {
          const line = `[${e.id}] ${e.state}${e.note ? `: ${e.note}` : ''}`;
          if (e.state === 'done') logger.success(line);
          else logger.warn(line);
        } else if (e.type === 'log') logger.info(e.text);
      },
    });
    // Ctrl+C stops the agents and removes their copies instead of exiting at once.
    process.removeAllListeners('SIGINT');
    process.once('SIGINT', () => orchestra.stop());
    const result = await orchestra.run(goal);
    if (result.reviewNotes) {
      logger.divider();
      console.log(result.reviewNotes);
    }
    if (result.success) logger.success(`Done${result.applied ? '; changes applied to the working tree' : ''}.`);
    else logger.error(result.error || 'Stopped.');
    process.exit(result.success ? 0 : 1);
  });

// Subcommand: run
program
  .command('run')
  .description('Orchestrate official AI CLIs to write, self-correct, and cross-review code')
  .argument('<prompt>', 'User prompt / engineering task description')
  .option('-p, --primary <adapter>', 'Primary code-generation CLI (claude, gemini, mock)', 'claude')
  .option('-r, --reviewer <adapter>', 'Secondary adversarial reviewer CLI (gemini, claude, mock)', 'gemini')
  .option('-v, --verify', 'Run automatic compiler/test check with self-correction loop', false)
  .option('--verify-cmd <command>', 'Custom verification command (e.g. "npm test" or "npm run type-check")')
  .option('-d, --dual', 'Run adversarial review on git diff with secondary model before signoff', false)
  .option('--max-retries <number>', 'Maximum self-correction retry attempts (budget)', '2')
  .option('--timeout <ms>', 'Process timeout in milliseconds', '900000')
  .action(async (prompt: string, options) => {
    try {
      const engine = new OrchestrationEngine(process.cwd());
      const manifest = await engine.run(prompt, {
        primary: options.primary,
        reviewer: options.reviewer,
        verify: Boolean(options.verify),
        verifyCmd: options.verifyCmd,
        dual: Boolean(options.dual),
        maxRetries: parseInt(options.maxRetries, 10) || 2,
        timeoutMs: parseInt(options.timeout, 10) || 900000,
        cwd: process.cwd(),
      });
      if (manifest.status === 'FAILED') process.exit(1);
    } catch (err: any) {
      logger.error('Orchestration aborted:', err.message || err);
      process.exit(1);
    }
  });

// Subcommand: doctor
program
  .command('doctor')
  .description('Run system health checks (Node, Git, Claude CLI, Gemini CLI)')
  .action(async () => {
    try {
      const ok = await runDoctorCheck(process.cwd());
      process.exit(ok ? 0 : 1);
    } catch (err: any) {
      logger.error('Diagnostics failed:', err);
      process.exit(1);
    }
  });

// Subcommand: clean
program
  .command('clean')
  .description('Remove all historical run artifacts and logs from .ai-bridge/runs/')
  .action(() => {
    const bus = new ContextBus(process.cwd());
    const count = bus.cleanRuns();
    logger.success(`Cleaned ${count} previous orchestration run artifact(s).`);
  });

// Handle graceful termination
process.on('SIGINT', () => {
  console.log();
  logger.warn('Interrupted by user (SIGINT). Exiting safely...');
  process.exit(130);
});

process.on('SIGTERM', () => {
  console.log();
  logger.warn('Terminated by system (SIGTERM). Exiting safely...');
  process.exit(143);
});

program.parse(process.argv);
