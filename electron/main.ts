import { app, BrowserWindow, ipcMain } from 'electron';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { get as httpGet } from 'node:http';
import { existsSync } from 'node:fs';
import { PtyManager } from './ptyManager.js';
import { GitUtils } from '../src/git/gitUtils.js';
import { ClaudeAdapter } from '../src/adapters/claude.js';
import { GeminiAdapter } from '../src/adapters/gemini.js';
import { AgentMesh } from '../src/engine/agentMesh.js';
import { generateShellCommand } from '../src/engine/commandGenerator.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

let mainWindow: BrowserWindow | null = null;
const ptyManager = new PtyManager();

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
    title: 'Warp Orchestrator - AI Terminal Workspace',
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

  // Autonomous Agent Mesh IPC Handler
  ipcMain.handle('mesh:run', async (_, { goal, builder, verifier, auditor, verifyCmd, maxRounds, cwd }) => {
    const mesh = new AgentMesh({
      builder,
      verifier,
      auditor,
      verifyCmd,
      maxRounds: maxRounds || 3,
      cwd: cwd || process.cwd(),
      onMessage: (message) => {
        mainWindow?.webContents.send('mesh:event', message);
      },
    });

    return mesh.runMesh(goal);
  });

  // Natural Language to Shell Command Generator (Warp AI Command Search)
  ipcMain.handle('ai:generateCommand', async (_, query: string) => {
    return generateShellCommand(query);
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
