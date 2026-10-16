import 'dotenv/config';
import { app, BrowserWindow, ipcMain, dialog, shell, nativeImage, Notification, safeStorage } from 'electron';

app.name = 'Vulgr';
import { fileURLToPath } from 'node:url';
import { dirname, join, basename, extname, resolve, sep } from 'node:path';
import { get as httpGet } from 'node:http';
import { execFileSync, execFile } from 'node:child_process';
import { existsSync, writeFileSync, readdirSync, statSync, readFileSync, mkdirSync, rmSync, realpathSync } from 'node:fs';
import os from 'node:os';
import { PtyManager } from './ptyManager.js';
import { ClaudeChatManager } from './claudeChatManager.js';
import { ApprovalBroker } from './approvalBroker.js';
import { parseApprovalMode } from '../src/engine/toolApproval.js';
import { SystemOneCompiler } from './systemOneCompiler.js';
import { GitHubAuth } from './githubAuth.js';
import { GitUtils } from '../src/git/gitUtils.js';
import { ClaudeAdapter } from '../src/adapters/claude.js';
import { GeminiAdapter } from '../src/adapters/gemini.js';
import { AgentMesh } from '../src/engine/agentMesh.js';
import { Orchestra } from '../src/engine/orchestra.js';
import { TeamChatCoordinator } from '../src/engine/teamChat.js';
import { discoverAgentModels } from '../src/engine/modelDiscovery.js';
import { toEngineLang } from '../src/engine/engineLang.js';
import { RunHistoryStore } from '../src/engine/runHistory.js';
import { ChatHistoryStore } from '../src/engine/chatHistory.js';
import { UsageLedger } from '../src/engine/usageLedger.js';
import { TemplateStore, type TemplateKind } from '../src/engine/templateStore.js';
import { onAgentUsage } from '../src/adapters/usageEvents.js';
import { AdapterFactory } from '../src/adapters/factory.js';
import { generateShellCommand } from '../src/engine/commandGenerator.js';
import { suggestCommitMessage } from '../src/engine/commitMessage.js';
import { createPullRequest, pullRequestInfo, suggestPullRequest } from '../src/engine/pullRequest.js';
import { withVulgrCoAuthor } from '../src/git/coAuthor.js';
import { SharedSkillsRegistry, interpolateSkillCommand } from '../src/engine/sharedSkills.js';
import { MemoryStore } from '../src/engine/memoryStore.js';
import { ContextOptimizer } from '../src/engine/contextOptimizer.js';
import { WorktreeManager } from '../src/git/worktreeManager.js';
import { AutoSuggestEngine } from '../src/engine/autoSuggest.js';
import { ConfigManager } from '../src/engine/configManager.js';
import { SessionExporter } from '../src/engine/sessionExporter.js';
import { buildTestPlanPrompt, parseTestCommand, detectTestCommand } from '../src/engine/testPlan.js';
import { listAgentStatus, installAgent, cancelAgentInstall } from './agentInstaller.js';
import { setupAutoUpdates } from './updater.js';
import { smokeMode, prepareSmokeProfile, watchSmoke } from './smoke.js';
import { setupErrorLog } from './errorLog.js';

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

prepareSmokeProfile();
setupErrorLog();

let mainWindow: BrowserWindow | null = null;
let currentCwd = process.cwd();
// Settings live with the user, not in whatever folder the app was started from
// (a packaged app starts in "/", which isn't writable).
const configManager = new ConfigManager(
  join(os.homedir(), '.vulgr'),
  'config.json',
  join(process.cwd(), '.warp-config.json')
);
const runHistory = new RunHistoryStore(join(os.homedir(), '.vulgr', 'runs'));
const chatHistory = new ChatHistoryStore(join(os.homedir(), '.vulgr', 'chats'));
// Every agent call whose CLI reports its usage (Claude Code, Codex) is written down.
const usageLedger = new UsageLedger(join(os.homedir(), '.vulgr', 'usage.jsonl'));
onAgentUsage((event) => usageLedger.add(event));
const templates = new TemplateStore(join(os.homedir(), '.vulgr', 'templates.json'));
const ptyManager = new PtyManager();
ptyManager.setConfigManager(configManager);
const claudeChatManager = new ClaudeChatManager();
claudeChatManager.setConfigManager(configManager);
const approvalBroker = new ApprovalBroker();
claudeChatManager.setApprovalBroker(approvalBroker);
const systemOneCompiler = new SystemOneCompiler();
systemOneCompiler.setConfigManager(configManager);
// Custom skills live with the user (~/.vulgr), not in whatever folder the app started in.
const skillsRegistry = new SharedSkillsRegistry(join(os.homedir(), '.vulgr'), 'skills.json', join(process.cwd(), '.warp-skills.json'));
// Created once the app is ready: safeStorage cannot decrypt the saved token before that.
let githubAuth: GitHubAuth;
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
  const isMac = process.platform === 'darwin';
  const candidates = isMac
    ? [
        // The rounded macOS-style icon, so the Dock matches other apps (packaged builds use build/icon.png).
        join(__dirname, '../ui/icon-mac.png'),
        join(__dirname, '../../ui/public/icon-mac.png'),
        join(__dirname, '../ui/logo.png'),
        join(__dirname, '../../ui/public/logo.png'),
        join(process.cwd(), 'ui/public/logo.png'),
        join(process.cwd(), 'dist/ui/logo.png'),
        join(__dirname, '../ui/favicon.png'),
        join(__dirname, '../../ui/public/favicon.png'),
        join(__dirname, '../ui/icon.ico'),
      ]
    : [
        join(__dirname, '../ui/icon.ico'),
        join(__dirname, '../../ui/public/icon.ico'),
        join(process.cwd(), 'ui/public/icon.ico'),
        join(__dirname, '../ui/logo.png'),
        join(__dirname, '../../ui/public/logo.png'),
      ];
  return candidates.find((p) => existsSync(p));
}

const RECENT_PROJECTS_PATH = join(os.homedir(), '.vulgr', 'recent-projects.json');
/** Where versions before the rename kept the list; read once if the new file isn't there yet. */
const LEGACY_RECENT_PROJECTS_PATH = join(os.homedir(), '.vulgaris-recent-projects.json');

function getRecentProjects(): string[] {
  try {
    const source = existsSync(RECENT_PROJECTS_PATH) ? RECENT_PROJECTS_PATH : LEGACY_RECENT_PROJECTS_PATH;
    if (existsSync(source)) {
      const parsed = JSON.parse(readFileSync(source, 'utf-8'));
      if (Array.isArray(parsed)) {
        return parsed.filter((p) => typeof p === 'string' && existsSync(p));
      }
    }
  } catch {}
  return [currentCwd];
}

/**
 * Shows the system folder picker. The window is brought forward first, since
 * Windows won't show a dialog for a minimized or unfocused frameless window.
 * If the dialog can't be tied to the window it opens on its own instead.
 */
async function pickDirectory(title: string): Promise<string | null> {
  const options: Electron.OpenDialogOptions = {
    title,
    properties: ['openDirectory', 'createDirectory'],
    defaultPath: currentCwd && existsSync(currentCwd) ? currentCwd : os.homedir(),
  };
  const win = mainWindow && !mainWindow.isDestroyed() ? mainWindow : null;
  let result: Electron.OpenDialogReturnValue;
  try {
    if (!win) throw new Error('no window');
    if (win.isMinimized()) win.restore();
    win.focus();
    result = await dialog.showOpenDialog(win, options);
  } catch (err) {
    console.error('[Electron] Folder dialog failed on the window, opening it on its own:', err);
    result = await dialog.showOpenDialog(options);
  }
  return result.canceled || result.filePaths.length === 0 ? null : result.filePaths[0];
}

function addRecentProject(dir: string): void {
  try {
    const list = getRecentProjects().filter((p) => p !== dir);
    list.unshift(dir);
    mkdirSync(dirname(RECENT_PROJECTS_PATH), { recursive: true });
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

/**
 * Resolves `targetPath` relative to `baseDir` and verifies that it stays strictly
 * inside `baseDir` (resolving symlinks on existing path segments). Returns null
 * if `targetPath` escapes `baseDir`.
 */
function resolveSafeWorkspacePath(baseDir: string, targetPath: string): string | null {
  if (!targetPath || typeof targetPath !== 'string' || targetPath.includes('\0')) return null;
  try {
    const realBase = existsSync(baseDir) ? realpathSync(baseDir) : resolve(baseDir);
    const candidate = resolve(realBase, targetPath);

    // Find the deepest existing ancestor to resolve any symlinks along the path
    let checkPath = candidate;
    const trailingParts: string[] = [];
    while (!existsSync(checkPath)) {
      const parent = dirname(checkPath);
      if (parent === checkPath) break;
      trailingParts.unshift(basename(checkPath));
      checkPath = parent;
    }
    const realExisting = existsSync(checkPath) ? realpathSync(checkPath) : checkPath;
    const finalPath = trailingParts.length > 0 ? resolve(realExisting, ...trailingParts) : realExisting;

    if (finalPath === realBase || finalPath.startsWith(realBase + sep)) {
      return finalPath;
    }
    return null;
  } catch {
    return null;
  }
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
      if (entry.name.startsWith('.') && entry.name !== '.env.example' && entry.name !== '.gitignore' && entry.name !== '.vulgaris-memory.json' && entry.name !== '.vulgr-memory.json') {
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
  const isMac = process.platform === 'darwin';
  const iconPath = resolveAppIcon();
  const iconImage = iconPath ? nativeImage.createFromPath(iconPath) : undefined;
  const preloadFile = join(__dirname, 'preload.js');
  try {
    const rawPreload = readFileSync(preloadFile, 'utf-8');
    if (/^export\s*\{\s*\};?\s*$/m.test(rawPreload)) {
      writeFileSync(preloadFile, rawPreload.replace(/^export\s*\{\s*\};?\r?\n?/gm, ''), 'utf-8');
    }
  } catch {}

  mainWindow = new BrowserWindow({
    icon: iconImage,
    width: 1360,
    height: 880,
    minWidth: 900,
    minHeight: 600,
    title: 'Vulgr - AI Terminal Orchestrator',
    backgroundColor: '#0c0d12',
    show: true,
    autoHideMenuBar: true,
    frame: !isMac ? false : true,
    titleBarStyle: isMac ? 'hidden' : undefined,
    trafficLightPosition: isMac ? { x: 12, y: 11 } : undefined,
    webPreferences: {
      preload: join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
    },
  });

  ptyManager.setWindow(mainWindow);
  claudeChatManager.setWindow(mainWindow);
  approvalBroker.setWindow(mainWindow);
  githubAuth.setWindow(mainWindow);

  // Open external links (markdown link clicks) in the OS browser, never in-app.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) {
      shell.openExternal(url);
    }
    return { action: 'deny' };
  });

  // Prevent arbitrary in-window navigation away from the app UI.
  mainWindow.webContents.on('will-navigate', (event, url) => {
    const allowedDev = !app.isPackaged && url.startsWith('http://localhost:5173');
    const allowedFile = url.startsWith('file://');
    if (!allowedDev && !allowedFile) {
      event.preventDefault();
      if (/^https?:\/\//i.test(url)) {
        shell.openExternal(url);
      }
    }
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

  mainWindow.webContents.on('console-message', (event) => {
    console.log(`[Renderer] ${event.message} (${event.sourceId}:${event.lineNumber})`);
  });

  mainWindow.webContents.on('did-finish-load', () => {
    console.log('[Electron] UI loaded successfully.');
    mainWindow?.show();
    mainWindow?.focus();
  });

  watchSmoke(mainWindow);

  // The smoke test checks the built files, never a running dev server.
  const devServerActive = !app.isPackaged && !smokeMode && (await canConnectToDevServer());
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
  mainWindow.on('focus', () => mainWindow?.flashFrame(false));
}

function setupIpcHandlers() {
  // GitHub sign-in (OAuth device flow)
  githubAuth = new GitHubAuth(join(app.getPath('userData'), 'github-auth.json'));
  ipcMain.handle('auth:get-user', () => githubAuth.getUser());
  ipcMain.handle('auth:login', () => githubAuth.startLogin());
  ipcMain.handle('auth:cancel', () => githubAuth.cancelLogin());
  ipcMain.handle('auth:logout', () => githubAuth.logout());
  ipcMain.handle('auth:open-profile', (_, url: string) => {
    if (/^https:\/\/github\.com\//.test(url)) shell.openExternal(url);
  });

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
    return claudeChatManager.start({
      ...options,
      cwd: options?.cwd || currentCwd,
      approvals: parseApprovalMode(options?.approvals),
    });
  });
  ipcMain.on('approval:respond', (_, { requestId, allow }) => {
    if (typeof requestId === 'string') approvalBroker.respond(requestId, allow === true);
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
    const targetCwd = (cwd && resolveSafeWorkspacePath(currentCwd, cwd)) || currentCwd;
    const npxBin = process.platform === 'win32' ? 'npx.cmd' : 'npx';
    return new Promise((resolve) => {
      execFile(
        npxBin,
        ['tsc', '--noEmit'],
        { cwd: targetCwd, env: process.env, maxBuffer: 10 * 1024 * 1024, timeout: 180_000, shell: process.platform === 'win32', windowsHide: true },
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
      if (!filePath || typeof filePath !== 'string') return { success: false, error: 'No file path' };
      const abs = resolveSafeWorkspacePath(currentCwd, filePath);
      if (!abs) {
        return { success: false, error: 'Access denied: file path must stay within the active project workspace' };
      }
      const dir = dirname(abs);
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
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
    const gitAvail = await gitUtils.isGitRepoAsync();

    return {
      node: { ok: true, version: process.version },
      claude: { ok: claudeAvail, version: claudeAvail ? await claudeAdapter.getVersion() : null },
      gemini: { ok: geminiAvail, version: geminiAvail ? await geminiAdapter.getVersion() : null },
      git: { ok: gitAvail, isRepo: gitAvail },
      cwd: process.cwd(),
    };
  });

  // Git Diff & Revert
  ipcMain.handle('git:diff', (_, { cwd } = {}) => {
    const git = new GitUtils(cwd || currentCwd);
    return git.getDiffAsync();
  });

  ipcMain.handle('git:status', (_, { cwd } = {}) => new GitUtils(cwd || currentCwd).getChangedFilesAsync());

  // Discarding stashes the changes (recoverable), always in the open project.
  ipcMain.handle('git:revert', (_, { cwd } = {}) => new GitUtils(cwd || currentCwd).revertAllChangesAsync());
  ipcMain.handle('git:revertFile', (_, { file, cwd } = {}) => new GitUtils(cwd || currentCwd).revertFileAsync(String(file)));
  ipcMain.handle('git:restoreDiscarded', (_, { stash, cwd } = {}) => new GitUtils(cwd || currentCwd).restoreDiscardedAsync(stash));

  ipcMain.handle('git:branch', (_, { cwd } = {}) => {
    const git = new GitUtils(cwd || currentCwd);
    return git.getBranchAsync();
  });

  ipcMain.handle('git:commit', async (_, { message, cwd }) => {
    const git = new GitUtils(cwd || currentCwd);
    const res = await git.commitAllAsync(configManager.getConfig().coAuthorVulgr === false ? message : withVulgrCoAuthor(message));
    return res.success;
  });

  // Branches: the list for the status bar's branch menu, and switching / creating.
  ipcMain.handle('git:branches', (_, { cwd }: { cwd?: string } = {}) => new GitUtils(cwd || currentCwd).listBranchesAsync());
  ipcMain.handle('git:switch', (_, { cwd, name, create }: { cwd?: string; name: string; create?: boolean }) =>
    new GitUtils(cwd || currentCwd).switchBranchAsync(String(name || '').trim(), !!create)
  );

  // Commit everything with a message, then push when asked; says what happened and why not.
  ipcMain.handle('git:commit-push', async (_, { message, push, cwd }: { message: string; push?: boolean; cwd?: string }) => {
    const git = new GitUtils(cwd || currentCwd);
    const text = String(message || '').trim();
    const commit = await git.commitAllAsync(configManager.getConfig().coAuthorVulgr === false ? text : withVulgrCoAuthor(text));
    if (!commit.success) return { committed: false, pushed: false, error: commit.error };
    if (!push) return { committed: true, pushed: false };
    const pushed = await git.pushAsync('origin');
    return { committed: true, pushed: pushed.success, error: pushed.error };
  });

  // Pull requests: what the branch is, an agent-written title and description, and opening it.
  ipcMain.handle('pr:info', (_, { cwd }: { cwd?: string } = {}) => pullRequestInfo(cwd || currentCwd));
  ipcMain.handle('pr:suggest', (_, { cwd, base }: { cwd?: string; base: string }) =>
    suggestPullRequest(cwd || currentCwd, String(base)).catch((err) => ({ error: 'failed', detail: String(err?.message || err) }))
  );
  ipcMain.handle('pr:create', async (_, { cwd, base, title, body }: { cwd?: string; base: string; title: string; body: string }) => {
    const res = await createPullRequest(cwd || currentCwd, { base: String(base), title: String(title), body: String(body ?? '') });
    if (res.url && res.viaBrowser) await shell.openExternal(res.url);
    return res;
  });

  // An agent writes a commit message for the uncommitted changes.
  ipcMain.handle('git:suggest-commit', (_, { cwd, note }: { cwd?: string; note?: string } = {}) =>
    suggestCommitMessage(cwd || currentCwd, { note }).catch((err) => ({ error: 'failed', detail: String(err?.message || err) }))
  );

  ipcMain.handle('git:push', (_, { remote = 'origin', branch, cwd } = {}) => {
    const git = new GitUtils(cwd || currentCwd);
    return git.pushAsync(remote, branch);
  });

  // Autonomous Agent Mesh IPC Handler
  // The Agent Swarm run in progress, for Stop and Pause.
  let currentMesh: AgentMesh | null = null;
  ipcMain.handle('mesh:stop', () => {
    currentMesh?.stop();
    return true;
  });
  ipcMain.handle('mesh:pause', (_, paused: boolean) => {
    if (paused) currentMesh?.pause();
    else currentMesh?.resume();
    return currentMesh?.paused ?? false;
  });
  ipcMain.handle('mesh:run', async (_, { goal, builder, verifier, auditor, verifyCmd, maxRounds, cwd, useSandbox, lang, budgetUsd }) => {
    const mesh = new AgentMesh({
      builder,
      verifier,
      auditor,
      verifyCmd,
      maxRounds: maxRounds || 3,
      // The project folder picked in the sidebar, not wherever the app was launched from.
      cwd: cwd || currentCwd,
      useSandbox: useSandbox ?? false,
      budgetUsd: Number(budgetUsd) || undefined,
      lang: toEngineLang(lang),
      onMessage: (message) => {
        mainWindow?.webContents.send('mesh:event', message);
      },
      onStatus: (status) => {
        mainWindow?.webContents.send('mesh:status', status);
      },
    });

    currentMesh = mesh;
    try {
      return await mesh.runMesh(goal);
    } catch (err: any) {
      return { success: false, rounds: 0, messages: [], diff: '', durationMs: 0, error: err?.message || String(err) };
    } finally {
      if (currentMesh === mesh) currentMesh = null;
    }
  });

  // Orchestra: one run at a time; Stop aborts every agent it started. In the
  // app the result waits for the developer (apply / revise / discard).
  let orchestra: Orchestra | null = null;
  let orchestraRunning = false;
  ipcMain.handle('orchestra:run', async (_, { goal, planner, workers, reviewer, verifyCmd, maxParallel, maxRounds, cwd, lang, budgetUsd }) => {
    if (orchestraRunning) return { success: false, applied: false, tasks: [], durationMs: 0, error: 'Another orchestra run is in progress.' };
    await orchestra?.discardReviewed();
    orchestraRunning = true;
    orchestra = new Orchestra({
      planner,
      workers,
      reviewer,
      verifyCmd,
      maxParallel,
      maxRounds,
      cwd: cwd || currentCwd,
      lang: toEngineLang(lang),
      autoApply: false,
      budgetUsd: Number(budgetUsd) || undefined,
      onEvent: (event) => mainWindow?.webContents.send('orchestra:event', event),
    });
    try {
      const result = await orchestra.run(goal);
      if (!result.pendingReview) orchestra = null;
      return result;
    } catch (err: any) {
      orchestra = null;
      return { success: false, applied: false, tasks: [], durationMs: 0, error: err?.message || String(err) };
    } finally {
      orchestraRunning = false;
    }
  });
  ipcMain.handle('orchestra:diff', (_, taskId?: string) => orchestra?.liveDiff(taskId) ?? '');
  ipcMain.handle('orchestra:apply', async (_, files?: string[]) => {
    const res = (await orchestra?.applyReviewed(files)) ?? { applied: false };
    if (res.applied) orchestra = null;
    return res;
  });
  ipcMain.handle('orchestra:discard', async () => {
    await orchestra?.discardReviewed();
    orchestra = null;
    return true;
  });
  ipcMain.handle('orchestra:revise', async (_, feedback: string) => {
    if (!orchestra || orchestraRunning) return null;
    orchestraRunning = true;
    try {
      return await orchestra.revise(feedback);
    } finally {
      orchestraRunning = false;
    }
  });
  ipcMain.handle('orchestra:stop', () => {
    orchestra?.stop();
    return true;
  });
  // The reviewed change on a new branch and a pull request, instead of into the folder.
  ipcMain.handle('orchestra:open-pr', async (_, opts: { branch: string; title?: string; body?: string }) => {
    if (!orchestra || orchestraRunning) return { error: 'Nothing is waiting for review' };
    orchestraRunning = true;
    try {
      const res = await orchestra.openPullRequest(opts);
      if (res.url) {
        if (res.viaBrowser) await shell.openExternal(res.url);
        orchestra = null;
      }
      return res;
    } finally {
      orchestraRunning = false;
    }
  });
  ipcMain.handle('orchestra:pause', (_, paused: boolean) => {
    if (paused) orchestra?.pause();
    else orchestra?.resume();
    return orchestra?.paused ?? false;
  });
  ipcMain.handle('orchestra:restart-task', (_, taskId: string) => orchestra?.restartTask(taskId) ?? false);

  // Unified Solo & Multi-Agent Team Chat (with 7-day quota load-balancing)
  let activeTeamChat: TeamChatCoordinator | null = null;
  ipcMain.handle('teamchat:run', async (_, payload) => {
    activeTeamChat?.stop();
    const coordinator = new TeamChatCoordinator();
    activeTeamChat = coordinator;
    const sevenDaysAgo = Date.now() - 7 * 86_400_000;
    const weeklyUsage = usageLedger.summary(sevenDaysAgo);
    const runId = String(payload.id || `tc-${Date.now()}`);
    const approvals = parseApprovalMode(payload.approvals);
    try {
      await coordinator.run({
        id: runId,
        prompt: String(payload.prompt || ''),
        cwd: payload.cwd || currentCwd,
        mode: payload.mode === 'team' ? 'team' : 'solo',
        soloAgent: payload.soloAgent || 'claude',
        soloModel: payload.soloModel || 'default',
        soloEffort: typeof payload.soloEffort === 'string' ? payload.soloEffort : undefined,
        teamAgents: Array.isArray(payload.teamAgents) ? payload.teamAgents : undefined,
        teamModels: payload.teamModels && typeof payload.teamModels === 'object' ? payload.teamModels : undefined,
        fast: payload.fast === true,
        history: Array.isArray(payload.history) ? payload.history : [],
        weeklyUsage,
        lang: payload.lang || 'tr',
        onToolApproval:
          approvals === 'deny'
            ? undefined
            : approvals === 'auto'
            ? async () => true
            : (req) => approvalBroker.request(runId, req),
        onEvent: (event) => {
          mainWindow?.webContents.send('teamchat:event', { id: payload.id, event });
        },
      });
      return { ok: true };
    } catch (err: any) {
      mainWindow?.webContents.send('teamchat:event', {
        id: payload.id,
        event: { type: 'error', message: err?.message || String(err) },
      });
      return { ok: false, error: err?.message || String(err) };
    } finally {
      approvalBroker.cancelChat(runId);
      if (activeTeamChat === coordinator) activeTeamChat = null;
    }
  });
  ipcMain.handle('teamchat:stop', () => {
    activeTeamChat?.stop();
    activeTeamChat = null;
    return true;
  });

  // Which agent CLIs are installed, so the UI only offers ones that can run.
  ipcMain.handle('agents:available', async () => {
    const [agents, gemini] = await Promise.all([listAgentStatus(), AdapterFactory.getAdapter('gemini').isAvailable()]);
    return { ...Object.fromEntries(agents.map((a) => [a.id, a.installed])), gemini };
  });

  // Live model discovery from installed CLIs (cursor-agent --list-models, opencode models, etc.) + 2026 catalog
  ipcMain.handle('agents:models', async (_, forceRefresh?: boolean) => {
    return discoverAgentModels(!!forceRefresh);
  });

  // Agent setup: which CLIs are installed, and installing them from inside the app.
  ipcMain.handle('agents:status', () => listAgentStatus());
  ipcMain.handle('agents:install', (_, id: string) =>
    installAgent(id, (chunk) => mainWindow?.webContents.send('agents:install-output', { id, chunk }))
  );
  ipcMain.handle('agents:cancel-install', (_, id: string) => cancelAgentInstall(id));

  // Squad: prompts are written to a temp file and piped into the agent CLI, so
  // multi-line text with quotes never has to survive shell quoting.
  // Duo Loop + Claude: how to pipe Claude's JSON stream through the formatter
  // (src/cli/claudeStream.ts), run by this app's own Electron as Node, and a
  // fresh file for the step's usage.
  ipcMain.handle('squad:claude-stream', () => {
    const dir = join(os.tmpdir(), 'vulgr-squad');
    mkdirSync(dir, { recursive: true });
    return {
      exe: process.execPath,
      script: join(__dirname, '../src/cli/claudeStream.js'),
      usageFile: join(dir, `usage-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.json`),
    };
  });
  // After a Duo Loop step: its usage goes into the ledger (and back to the app).
  ipcMain.handle('squad:collect-usage', (_, { file, cwd }: { file: string; cwd?: string }) => {
    const dir = join(os.tmpdir(), 'vulgr-squad');
    if (typeof file !== 'string' || !file.startsWith(dir) || !existsSync(file)) return null;
    try {
      const usage = JSON.parse(readFileSync(file, 'utf-8'));
      rmSync(file, { force: true });
      usageLedger.add({ at: Date.now(), agent: 'claude', cwd: cwd || currentCwd, tag: 'duo', usage });
      return usage;
    } catch {
      return null;
    }
  });

  ipcMain.handle('squad:write-prompt', (_, text: string) => {
    const dir = join(os.tmpdir(), 'vulgr-squad');
    mkdirSync(dir, { recursive: true });
    const file = join(dir, `prompt-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.txt`);
    writeFileSync(file, text, 'utf-8');
    return file;
  });

  // Git Worktree Sandbox IPC Handlers
  ipcMain.handle('sandbox:create', async (_, { runId, baseBranch } = {}) => {
    return worktreeManager.createSandbox(runId, baseBranch);
  });
  ipcMain.handle('sandbox:list', async () => {
    return worktreeManager.listSandboxesAsync();
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

  // Duo Loop without a test command: the checker writes tests from the goal.
  ipcMain.handle('tests:planPrompt', (_, goal: string, extra: string[] = []) => buildTestPlanPrompt(goal, extra));
  ipcMain.handle('tests:resolveCommand', (_, agentOutput = '') => parseTestCommand(agentOutput) ?? detectTestCommand(currentCwd));

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
  // With a project folder, the project's overrides are applied on top.
  ipcMain.handle('config:get', (_, projectDir?: string) =>
    projectDir ? configManager.getEffectiveConfig(projectDir) : configManager.getConfig()
  );
  ipcMain.handle('config:project-get', (_, projectDir: string) => configManager.getProjectOverrides(projectDir));
  ipcMain.handle('config:project-set', (_, projectDir: string, overrides) =>
    configManager.setProjectOverrides(projectDir, overrides)
  );
  ipcMain.handle('config:update', (_, updates) => configManager.updateConfig(updates));
  ipcMain.handle('config:reset', () => configManager.resetConfig());

  // System notification, only while the window is in the background and the kind is switched on.
  ipcMain.handle('notify', (_, { title, body, kind }: { title: string; body?: string; kind: 'run' | 'command' }) => {
    const config = configManager.getConfig();
    if ((kind === 'run' ? config.notifyRuns : config.notifyCommands) === false) return false;
    if (!mainWindow || mainWindow.isFocused() || !Notification.isSupported()) return false;
    const notice = new Notification({ title: String(title).slice(0, 200), body: String(body ?? '').slice(0, 300) });
    notice.on('click', () => {
      if (mainWindow?.isMinimized()) mainWindow.restore();
      mainWindow?.show();
      mainWindow?.focus();
    });
    notice.show();
    if (process.platform === 'darwin') app.dock?.bounce('informational');
    else mainWindow.flashFrame(true);
    return true;
  });

  // Run history
  ipcMain.handle('runs:list', (_, cwd?: string) => runHistory.list(cwd));
  ipcMain.handle('runs:get', (_, id: string) => runHistory.get(id));
  ipcMain.handle('runs:save', (_, record) => runHistory.save(record));
  ipcMain.handle('runs:delete', (_, id: string) => runHistory.remove(id));
  ipcMain.handle('runs:clear', (_, cwd?: string) => runHistory.clear(cwd));
  ipcMain.handle('chats:list', (_, cwd?: string) => chatHistory.list(cwd));
  ipcMain.handle('chats:get', (_, id: string) => chatHistory.get(id));
  ipcMain.handle('chats:save', (_, record) => chatHistory.save(record));
  ipcMain.handle('chats:delete', (_, id: string) => chatHistory.remove(id));

  // Real token use and cost of agent calls
  ipcMain.handle('usage:summary', (_, since?: number, cwd?: string) => usageLedger.summary(since ?? 0, cwd));
  ipcMain.handle('usage:clear', () => usageLedger.clear());

  // Run templates
  ipcMain.handle('templates:list', (_, kind?: TemplateKind) => templates.list(kind));
  ipcMain.handle('templates:save', (_, template) => templates.save(template));
  ipcMain.handle('templates:touch', (_, id: string) => templates.touch(id));
  ipcMain.handle('templates:delete', (_, id: string) => templates.remove(id));

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
      title: 'Save Vulgr Technical Report',
      defaultPath: defaultName || `vulgr-report-${Date.now()}.${ext}`,
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

  // A terminal's whole output, saved where the user picks.
  ipcMain.handle('terminal:save-output', async (_, { content, defaultName }: { content: string; defaultName?: string }) => {
    if (!mainWindow) return { success: false };
    const result = await dialog.showSaveDialog(mainWindow, {
      defaultPath: defaultName || `terminal-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.txt`,
      filters: [{ name: 'Text', extensions: ['txt', 'log'] }],
    });
    if (result.canceled || !result.filePath) return { success: false, canceled: true };
    try {
      writeFileSync(result.filePath, content, 'utf-8');
      return { success: true, filePath: result.filePath };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  });

  // Project Workspace & File Explorer Handlers
  ipcMain.handle('workspace:open-folder', async () => {
    const chosenDir = await pickDirectory('Select Project Directory');
    if (!chosenDir) return null;
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
    if (typeof targetDir === 'string' && existsSync(targetDir) && statSync(targetDir).isDirectory()) {
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

  // Folder picker for the chat view: picks a directory without switching the
  // app's workspace, so a chat can run in a different project than the terminals.
  ipcMain.handle('chat:pick-folder', async () => {
    const dir = await pickDirectory('Select Chat Folder');
    if (dir) addRecentProject(dir);
    return dir;
  });

  ipcMain.handle('workspace:list-files', (_, { dir, maxDepth = 3 } = {}) => {
    const safeDir = dir ? resolveSafeWorkspacePath(currentCwd, dir) : currentCwd;
    if (!safeDir || !existsSync(safeDir)) return [];
    const clampedDepth = Math.max(1, Math.min(Number(maxDepth) || 3, 6));
    return scanProjectDirectory(currentCwd, safeDir, clampedDepth, 0);
  });

  ipcMain.handle('workspace:read-file', (_, filePath: string) => {
    try {
      const safePath = resolveSafeWorkspacePath(currentCwd, filePath);
      if (!safePath) {
        return { error: 'Access denied: file path must stay within the active project workspace' };
      }
      if (existsSync(safePath)) {
        const stats = statSync(safePath);
        if (!stats.isFile()) {
          return { error: 'Not a regular file' };
        }
        if (stats.size > 500 * 1024) {
          return { error: 'File is too large to preview (>500KB)' };
        }
        const content = readFileSync(safePath, 'utf-8');
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
        return execFileSync('/usr/sbin/scutil', ['--get', 'ComputerName'], { encoding: 'utf-8', timeout: 2000 }).trim();
      } catch {}
    }
    return os.hostname().replace(/\.local$/, '');
  });
}

app.whenReady().then(async () => {
  if (safeStorage.isEncryptionAvailable()) {
    configManager.setSecretCodec({
      encrypt: (plain) => safeStorage.encryptString(plain).toString('base64'),
      decrypt: (cipher) => safeStorage.decryptString(Buffer.from(cipher, 'base64')),
    });
  }

  if (process.platform === 'darwin' && app.dock) {
    const iconPath = resolveAppIcon();
    if (iconPath) {
      try {
        const img = nativeImage.createFromPath(iconPath);
        if (!img.isEmpty()) {
          app.dock.setIcon(img);
        }
      } catch (err) {
        console.warn('[Electron] Failed to set dock icon:', err);
      }
    }
  }

  setupIpcHandlers();
  await createWindow();
  setupAutoUpdates(() => mainWindow);

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
