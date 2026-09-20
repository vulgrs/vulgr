import 'dotenv/config';
import { app, BrowserWindow, ipcMain, dialog, shell } from 'electron';
import { fileURLToPath } from 'node:url';
import { dirname, join, basename, extname } from 'node:path';
import { get as httpGet } from 'node:http';
import { execSync, exec } from 'node:child_process';
import { existsSync, writeFileSync, readdirSync, statSync, readFileSync } from 'node:fs';
import os from 'node:os';
import { PtyManager } from './ptyManager.js';
import { ClaudeChatManager } from './claudeChatManager.js';
import { SystemOneCompiler } from './systemOneCompiler.js';
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

// Augment PATH with standard macOS / Linux binary directories
if (process.platform !== 'win32') {
  const home = os.homedir();
  const extraPaths = [
    '/opt/homebrew/bin',
    '/opt/homebrew/sbin',
    '/usr/local/bin',
    '/usr/local/sbin',
    join(home, '.local', 'bin'),
    join(home, '.cargo', 'bin'),
    join(home, '.npm-global', 'bin'),
    join(home, 'bin'),
  ];
  const pathKey = Object.keys(process.env).find((k) => k.toLowerCase() === 'path') || 'PATH';
  const currentPath = process.env[pathKey] || '';
  const updatedPath = [...extraPaths, currentPath].filter(Boolean).join(':');
  process.env[pathKey] = updatedPath;
  process.env.PATH = updatedPath;
}

let mainWindow: BrowserWindow | null = null;
let currentCwd = process.cwd();
const configManager = new ConfigManager();
const ptyManager = new PtyManager();
ptyManager.setConfigManager(configManager);
const claudeChatManager = new ClaudeChatManager();
claudeChatManager.setConfigManager(configManager);
const systemOneCompiler = new SystemOneCompiler();
systemOneCompiler.setConfigManager(configManager);
const skillsRegistry = new SharedSkillsRegistry();
let memoryStore = new MemoryStore(currentCwd);
const worktreeManager = new WorktreeManager();
let autoSuggestEngine = new AutoSuggestEngine(currentCwd, memoryStore, skillsRegistry);

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

function resolveAppIcon(): string | undefined {
  return [join(__dirname, '../ui/icon.ico'), join(__dirname, '../../ui/public/icon.ico')].find((p) => existsSync(p));
}

const RECENT_PROJECTS_PATH = join(os.homedir(), '.vulgaris-recent-projects.json');

function getRecentProjects(): string[] {
  try {
    if (existsSync(RECENT_PROJECTS_PATH)) {
      const parsed = JSON.parse(readFileSync(RECENT_PROJECTS_PATH, 'utf-8'));
      if (Array.isArray(parsed)) {
        return parsed.filter((p) => typeof p === 'string' && existsSync(p));
      }
    }
  } catch {}
  return [currentCwd];
}

function addRecentProject(dir: string): void {
  try {
    const list = getRecentProjects().filter((p) => p !== dir);
    list.unshift(dir);
    writeFileSync(RECENT_PROJECTS_PATH, JSON.stringify(list.slice(0, 15), null, 2), 'utf-8');
  } catch {}
}

const IGNORED_DIRS = new Set([
  '.git',
  'node_modules',
  'dist',
  '.cache',
  '.next',
  '.turbo',
  'build',
  'out',
  '.idea',
  '.vscode',
  '.venv',
  '__pycache__',
]);

export interface FileTreeNode {
  name: string;
  path: string;
  relativePath: string;
  isDirectory: boolean;
  size?: number;
  ext?: string;
  children?: FileTreeNode[];
}

function scanProjectDirectory(baseDir: string, currentPath: string, maxDepth = 3, currentDepth = 0): FileTreeNode[] {
  if (currentDepth >= maxDepth) return [];
  try {
    const entries = readdirSync(currentPath, { withFileTypes: true });
    const nodes: FileTreeNode[] = [];

    const sorted = entries.sort((a, b) => {
      if (a.isDirectory() && !b.isDirectory()) return -1;
      if (!a.isDirectory() && b.isDirectory()) return 1;
      return a.name.localeCompare(b.name);
    });

    for (const entry of sorted) {
      if (entry.name.startsWith('.') && entry.name !== '.env.example' && entry.name !== '.gitignore' && entry.name !== '.vulgaris-memory.json') {
        if (entry.isDirectory()) continue;
      }
      if (entry.isDirectory() && IGNORED_DIRS.has(entry.name)) {
        continue;
      }

      const fullPath = join(currentPath, entry.name);
      const relativePath = fullPath.replace(baseDir, '').replace(/^[\\/]/, '');

      if (entry.isDirectory()) {
        nodes.push({
          name: entry.name,
          path: fullPath,
          relativePath,
          isDirectory: true,
          children: scanProjectDirectory(baseDir, fullPath, maxDepth, currentDepth + 1),
        });
      } else {
        let size = 0;
        try {
          size = statSync(fullPath).size;
        } catch {}

        nodes.push({
          name: entry.name,
          path: fullPath,
          relativePath,
          isDirectory: false,
          size,
          ext: extname(entry.name).toLowerCase(),
        });
      }
    }
    return nodes;
  } catch {
    return [];
  }
}

async function createWindow() {
  mainWindow = new BrowserWindow({
    icon: resolveAppIcon(),
    width: 1360,
    height: 880,
    minWidth: 900,
    minHeight: 600,
    title: 'Vulgaris - AI Terminal Orchestrator',
    backgroundColor: '#0c0d12',
    show: true,
    autoHideMenuBar: true,
    frame: false,
    webPreferences: {
      preload: join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,
    },
  });

  ptyManager.setWindow(mainWindow);
  claudeChatManager.setWindow(mainWindow);

  // Open external links (markdown link clicks) in the OS browser, never in-app.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) {
      shell.openExternal(url);
    }
    return { action: 'deny' };
  });

  const broadcastMaximizedState = () => {
    mainWindow?.webContents.send('window:maximized-changed', mainWindow.isMaximized());
  };
  mainWindow.on('maximize', broadcastMaximizedState);
  mainWindow.on('unmaximize', broadcastMaximizedState);

  mainWindow.webContents.on('did-fail-load', (_, errorCode, errorDescription, validatedURL) => {
    console.error(`[Electron] Failed to load ${validatedURL}: [${errorCode}] ${errorDescription}`);
  });

  mainWindow.webContents.on('preload-error', (_, preloadPath, error) => {
    console.error(`[Electron] Preload Error in ${preloadPath}:`, error);
  });

  mainWindow.webContents.on('console-message', (_, level, message, line, sourceId) => {
    console.log(`[Renderer] ${message} (${sourceId}:${line})`);
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
  // Custom Frameless Window Controls
  ipcMain.on('window:minimize', () => {
    mainWindow?.minimize();
  });
  ipcMain.on('window:maximize-toggle', () => {
    if (!mainWindow) return;
    if (mainWindow.isMaximized()) mainWindow.unmaximize();
    else mainWindow.maximize();
  });
  ipcMain.on('window:close', () => {
    mainWindow?.close();
  });
  ipcMain.handle('window:is-maximized', () => {
    return mainWindow?.isMaximized() ?? false;
  });

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

  // Structured Claude Code Chat (stream-json headless session)
  ipcMain.handle('claudechat:start', async (_, options) => {
    return claudeChatManager.start({ ...options, cwd: options?.cwd || currentCwd });
  });
  ipcMain.on('claudechat:send', (_, { id, text, images }) => {
    claudeChatManager.send(id, text, images);
  });
  ipcMain.on('claudechat:stop', (_, { id }) => {
    claudeChatManager.stop(id);
  });

  // Deterministic System 1 JSON compiler (direct Anthropic API)
  ipcMain.handle('system1:run', async (_, options) => {
    return systemOneCompiler.run({
      taskId: options?.taskId || `task-${Date.now()}`,
      targetFile: options?.targetFile || '',
      prompt: options?.prompt || '',
      slot: typeof options?.slot === 'number' ? options.slot : 0,
      rules: options?.rules || '',
      model: options?.model,
    });
  });

  // Run the local TypeScript compiler for the System 1 Auto-Fix loop.
  ipcMain.handle('system1:typecheck', async (_, { cwd } = {}) => {
    const targetCwd = cwd || currentCwd;
    return new Promise((resolve) => {
      exec(
        'npx tsc --noEmit',
        { cwd: targetCwd, env: process.env, maxBuffer: 10 * 1024 * 1024, timeout: 180_000 },
        (err: any, stdout, stderr) => {
          const output = `${stdout || ''}${stderr || ''}`.trim();
          if (!err) {
            resolve({ clean: true, exitCode: 0, output });
          } else {
            resolve({
              clean: false,
              exitCode: typeof err.code === 'number' ? err.code : 1,
              output: output || err.message || 'Type check failed.',
            });
          }
        }
      );
    });
  });

  // Write file to disk (used to apply a System 1 compilation result)
  ipcMain.handle('workspace:write-file', async (_, { filePath, content }) => {
    try {
      if (!filePath) return { success: false, error: 'No file path' };
      const abs = filePath.startsWith('/') || /^[A-Za-z]:[\\/]/.test(filePath)
        ? filePath
        : join(currentCwd, filePath);
      const dir = dirname(abs);
      if (!existsSync(dir)) {
        (await import('node:fs')).mkdirSync(dir, { recursive: true });
      }
      writeFileSync(abs, content ?? '', 'utf-8');
      return { success: true, filePath: abs };
    } catch (err: any) {
      return { success: false, error: err?.message || String(err) };
    }
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
  ipcMain.handle('context:stats', () => ContextOptimizer.getTelemetry());
  ipcMain.handle('context:reset-stats', () => {
    ContextOptimizer.resetTelemetry();
    return true;
  });

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
      title: 'Save Vulgaris Technical Report',
      defaultPath: defaultName || `vulgaris-report-${Date.now()}.${ext}`,
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

  // Project Workspace & File Explorer Handlers
  ipcMain.handle('workspace:open-folder', async () => {
    if (!mainWindow) return null;
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openDirectory'],
      title: 'Select Project Directory',
    });
    if (result.canceled || result.filePaths.length === 0) {
      return null;
    }
    const chosenDir = result.filePaths[0];
    currentCwd = chosenDir;
    memoryStore = new MemoryStore(chosenDir);
    autoSuggestEngine = new AutoSuggestEngine(chosenDir, memoryStore, skillsRegistry);
    addRecentProject(chosenDir);
    return {
      path: chosenDir,
      name: basename(chosenDir),
      recentProjects: getRecentProjects(),
    };
  });

  ipcMain.handle('workspace:set-cwd', async (_, targetDir: string) => {
    if (existsSync(targetDir)) {
      currentCwd = targetDir;
      memoryStore = new MemoryStore(targetDir);
      autoSuggestEngine = new AutoSuggestEngine(targetDir, memoryStore, skillsRegistry);
      addRecentProject(targetDir);
      return {
        path: targetDir,
        name: basename(targetDir),
        recentProjects: getRecentProjects(),
      };
    }
    return null;
  });

  ipcMain.handle('workspace:get-recent-projects', () => getRecentProjects());

  ipcMain.handle('workspace:list-files', (_, { dir, maxDepth = 3 } = {}) => {
    const targetDir = dir || currentCwd;
    if (!existsSync(targetDir)) return [];
    return scanProjectDirectory(targetDir, targetDir, maxDepth, 0);
  });

  ipcMain.handle('workspace:read-file', (_, filePath: string) => {
    try {
      if (existsSync(filePath)) {
        const stats = statSync(filePath);
        if (stats.size > 500 * 1024) {
          return { error: 'File is too large to preview (>500KB)' };
        }
        const content = readFileSync(filePath, 'utf-8');
        return { content, size: stats.size };
      }
      return { error: 'File does not exist' };
    } catch (err: any) {
      return { error: err.message };
    }
  });

  ipcMain.handle('workspace:get-conversations', () => memoryStore.getConversations());
  ipcMain.handle('workspace:save-conversation', (_, conv) => {
    memoryStore.addConversation(conv);
    return true;
  });

  ipcMain.handle('system:getCwd', () => currentCwd);

  ipcMain.handle('system:hostname', () => {
    if (process.platform === 'darwin') {
      try {
        return execSync('scutil --get ComputerName', { encoding: 'utf-8', timeout: 2000 }).trim();
      } catch {}
    }
    return os.hostname().replace(/\.local$/, '');
  });
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
  claudeChatManager.killAll();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
