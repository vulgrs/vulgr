import { app, BrowserWindow, ipcMain, dialog } from 'electron';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { get as httpGet } from 'node:http';
import { existsSync, writeFileSync } from 'node:fs';
import { PtyManager } from './ptyManager.js';
import { GitUtils } from '../src/git/gitUtils.js';
import { ClaudeAdapter } from '../src/adapters/claude.js';
import { GeminiAdapter } from '../src/adapters/gemini.js';
import { AgentMesh } from '../src/engine/agentMesh.js';
import { generateShellCommand } from '../src/engine/commandGenerator.js';
import { SharedSkillsRegistry, interpolateSkillCommand } from '../src/engine/sharedSkills.js';
import { MemoryStore } from '../src/engine/memoryStore.js';
import { ContextOptimizer } from '../src/engine/contextOptimizer.js';
import { WorktreeManager } from '../src/git/worktreeManager.js';
import { AutoSuggestEngine } from '../src/engine/autoSuggest.js';
import { ConfigManager } from '../src/engine/configManager.js';
import { SessionExporter } from '../src/engine/sessionExporter.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

let mainWindow: BrowserWindow | null = null;
const configManager = new ConfigManager();
const ptyManager = new PtyManager();
ptyManager.setConfigManager(configManager);
const skillsRegistry = new SharedSkillsRegistry();
const memoryStore = new MemoryStore();
const worktreeManager = new WorktreeManager();
const autoSuggestEngine = new AutoSuggestEngine(process.cwd(), memoryStore, skillsRegistry);

function canConnectToDevServer(): Promise<boolean> {
  return new Promise((resolve) => {
    const req = httpGet('http://localhost:5173', { timeout: 350 }, (res) => {
      resolve(res.statusCode !== undefined);
    });
    req.on('error', () => resolve(false));
    req.on('timeout', () => {
      req.destroy();
      resolve(false);
    });
  });
}

async function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1360,
    height: 880,
    minWidth: 900,
    minHeight: 600,
    title: 'Dexter - AI Terminal Orchestrator',
    backgroundColor: '#0c0d12',
    show: true,
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,
    },
  });

  ptyManager.setWindow(mainWindow);

  mainWindow.webContents.on('did-fail-load', (_, errorCode, errorDescription, validatedURL) => {
    console.error(`[Electron] Failed to load ${validatedURL}: [${errorCode}] ${errorDescription}`);
  });

  mainWindow.webContents.on('did-finish-load', () => {
    console.log('[Electron] UI loaded successfully.');
    mainWindow?.show();
    mainWindow?.focus();
  });

  const devServerActive = await canConnectToDevServer();
  const builtUiPath = join(__dirname, '../ui/index.html');

  if (devServerActive) {
    console.log('[Electron] Vite dev server detected on port 5173. Loading http://localhost:5173...');
    await mainWindow.loadURL('http://localhost:5173');
  } else if (existsSync(builtUiPath)) {
    console.log(`[Electron] Loading production UI from: ${builtUiPath}`);
    await mainWindow.loadFile(builtUiPath);
  } else {
    console.warn('[Electron] Falling back to http://localhost:5173');
    await mainWindow.loadURL('http://localhost:5173');
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function setupIpcHandlers() {
  // PTY IPC Handlers
  ipcMain.handle('pty:create', async (_, options) => {
    return ptyManager.createTerminal(options);
  });

  ipcMain.on('pty:write', (_, { id, data }) => {
    ptyManager.write(id, data);
  });

  ipcMain.on('pty:resize', (_, { id, cols, rows }) => {
    ptyManager.resize(id, cols, rows);
  });

  ipcMain.on('pty:kill', (_, { id }) => {
    ptyManager.kill(id);
  });

  // Diagnostics & Doctor
  ipcMain.handle('system:doctor', async () => {
    const claudeAdapter = new ClaudeAdapter();
    const geminiAdapter = new GeminiAdapter();
    const gitUtils = new GitUtils(process.cwd());

    const claudeAvail = await claudeAdapter.isAvailable();
    const geminiAvail = await geminiAdapter.isAvailable();
    const gitAvail = gitUtils.isGitRepo();

    return {
      node: { ok: true, version: process.version },
      claude: { ok: claudeAvail, version: claudeAvail ? await claudeAdapter.getVersion() : null },
      gemini: { ok: geminiAvail, version: geminiAvail ? await geminiAdapter.getVersion() : null },
      git: { ok: gitAvail, isRepo: gitAvail },
      cwd: process.cwd(),
    };
  });

  // Git Diff & Revert
  ipcMain.handle('git:diff', (_, { cwd = process.cwd() }) => {
    const git = new GitUtils(cwd);
    return git.getDiff();
  });

  ipcMain.handle('git:revert', (_, { cwd = process.cwd() }) => {
    const git = new GitUtils(cwd);
    git.revertAllChanges();
    return true;
  });

  ipcMain.handle('git:branch', (_, { cwd = process.cwd() } = {}) => {
    const git = new GitUtils(cwd);
    return git.getBranch();
  });

  ipcMain.handle('git:commit', (_, { message, cwd = process.cwd() }) => {
    const git = new GitUtils(cwd);
    return git.commitAll(message);
  });

  ipcMain.handle('git:push', (_, { remote = 'origin', branch, cwd = process.cwd() } = {}) => {
    const git = new GitUtils(cwd);
    return git.push(remote, branch);
  });

  // Autonomous Agent Mesh IPC Handler
  ipcMain.handle('mesh:run', async (_, { goal, builder, verifier, auditor, verifyCmd, maxRounds, cwd, useSandbox }) => {
    const mesh = new AgentMesh({
      builder,
      verifier,
      auditor,
      verifyCmd,
      maxRounds: maxRounds || 3,
      cwd: cwd || process.cwd(),
      useSandbox: useSandbox ?? true,
      onMessage: (message) => {
        mainWindow?.webContents.send('mesh:event', message);
      },
    });

    return mesh.runMesh(goal);
  });

  // Git Worktree Sandbox IPC Handlers
  ipcMain.handle('sandbox:create', async (_, { runId, baseBranch } = {}) => {
    return worktreeManager.createSandbox(runId, baseBranch);
  });
  ipcMain.handle('sandbox:list', async () => {
    return worktreeManager.listSandboxes();
  });
  ipcMain.handle('sandbox:diff', async (_, { worktreePath, baseBranch }) => {
    return worktreeManager.getSandboxDiff(worktreePath, baseBranch);
  });
  ipcMain.handle('sandbox:merge', async (_, { worktreePath, branchName, targetBranch, commitMsg }) => {
    return worktreeManager.mergeSandbox(worktreePath, branchName, targetBranch, commitMsg);
  });
  ipcMain.handle('sandbox:destroy', async (_, { worktreePath, branchName, force }) => {
    return worktreeManager.destroySandbox(worktreePath, branchName, force);
  });

  // Natural Language to Shell Command Generator (Warp AI Command Search)
  ipcMain.handle('ai:generateCommand', async (_, query: string) => {
    return generateShellCommand(query);
  });

  // Universal Shared Skills Handlers
  ipcMain.handle('skills:list', (_, { category, query } = {}) => skillsRegistry.listSkills(category, query));
  ipcMain.handle('skills:get', (_, id: string) => skillsRegistry.getSkill(id));
  ipcMain.handle('skills:save', (_, skill) => skillsRegistry.saveCustomSkill(skill));
  ipcMain.handle('skills:delete', (_, id: string) => skillsRegistry.deleteCustomSkill(id));
  ipcMain.handle('skills:interpolate', (_, { template, values, parameters }) =>
    interpolateSkillCommand(template, values, parameters)
  );

  // Persistent Memory Handlers
  ipcMain.handle('memory:get', () => memoryStore.getMemoryData());
  ipcMain.handle('memory:setFact', (_, { key, value, source }) => {
    memoryStore.setFact(key, value, source);
    return true;
  });
  ipcMain.handle('memory:deleteFact', (_, key: string) => memoryStore.deleteFact(key));
  ipcMain.handle('memory:addRule', (_, rule: string) => {
    memoryStore.addRule(rule);
    return true;
  });
  ipcMain.handle('memory:removeRule', (_, rule: string) => memoryStore.removeRule(rule));
  ipcMain.handle('memory:recordCommand', (_, { command, exitCode, durationMs, summary }) => {
    memoryStore.recordCommand(command, exitCode, durationMs, summary);
    return true;
  });
  ipcMain.handle('memory:promptSnippet', () => memoryStore.toPromptSnippet());

  // Context & Token Optimizer Handlers
  ipcMain.handle('context:optimize', (_, { raw, options }) => ContextOptimizer.optimizeTerminalLog(raw, options));

  // Smart Ghost Text & Auto-Suggest Handler
  ipcMain.handle('suggest:get', (_, input: string) => autoSuggestEngine.getSuggestion(input));

  // Settings & Configuration Handlers
  ipcMain.handle('config:get', () => configManager.getConfig());
  ipcMain.handle('config:update', (_, updates) => configManager.updateConfig(updates));
  ipcMain.handle('config:reset', () => configManager.resetConfig());

  // Session Timeline & Technical Report Export Handlers
  ipcMain.handle('export:generate', (_, { data, format, options }) => {
    switch (format) {
      case 'html':
        return SessionExporter.toHtml(data, options);
      case 'json':
        return SessionExporter.toJson(data);
      case 'markdown':
      default:
        return SessionExporter.toMarkdown(data, options);
    }
  });

  ipcMain.handle('export:save-file', async (_, { content, defaultName, format }) => {
    if (!mainWindow) return { success: false, error: 'No active window' };

    const ext = format === 'html' ? 'html' : format === 'json' ? 'json' : 'md';
    const filters =
      format === 'html'
        ? [{ name: 'HTML Document', extensions: ['html'] }]
        : format === 'json'
        ? [{ name: 'JSON Document', extensions: ['json'] }]
        : [{ name: 'Markdown Document', extensions: ['md', 'markdown'] }];

    const result = await dialog.showSaveDialog(mainWindow, {
      title: 'Save Dexter Technical Report',
      defaultPath: defaultName || `dexter-report-${Date.now()}.${ext}`,
      filters,
    });

    if (result.canceled || !result.filePath) {
      return { success: false, canceled: true };
    }

    try {
      writeFileSync(result.filePath, content, 'utf-8');
      return { success: true, filePath: result.filePath };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('system:getCwd', () => process.cwd());
}

app.whenReady().then(async () => {
  setupIpcHandlers();
  await createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('will-quit', () => {
  ptyManager.killAll();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
