import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { TopBar } from './components/TopBar.js';
import { PaneGrid } from './components/PaneGrid.js';
import { BottomCommandDock } from './components/BottomCommandDock.js';
import { RightPanel } from './components/RightPanel.js';
import { Sidebar } from './components/Sidebar.js';
import { StatusBar } from './components/StatusBar.js';
import { CommandPalette } from './components/CommandPalette.js';
import { AgentMeshModal } from './components/AgentMeshModal.js';
import { SquadBar } from './components/SquadBar.js';
import { LiveSquadModal } from './components/LiveSquadModal.js';
import { SkillsModal } from './components/SkillsModal.js';
import { SandboxDrawer } from './components/SandboxDrawer.js';
import { SettingsModal } from './components/SettingsModal.js';
import { ExportReportModal } from './components/ExportReportModal.js';
import { TokenOptimizerHUD } from './components/TokenOptimizerHUD.js';
import { GuideModal, type GuideAction } from './components/GuideModal.js';
import { subscriptionRegistry } from './utils/subscriptionManager.js';
import { useSquadOrchestrator, squadAgentLabel, type PaneRunResult, type SquadDeps } from './hooks/useSquadOrchestrator.js';
import type {
  WorkspaceTab,
  TerminalSession,
  DoctorStatus,
  SessionType,
  CommandPaletteAction,
  SessionReportData,
  ReportCommandBlock,
  ContextTelemetry,
  ProjectFileItem,
  PastProjectConversation,
  MemoryData,
} from './types/warp.js';

declare global {
  interface Window {
    warpApi: any;
  }
}

const loadPersisted = <T,>(key: string, fallback: T): T => {
  try {
    const raw = localStorage.getItem(key);
    return raw !== null ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
};

const sameJson = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

export const App: React.FC = () => {
  const [tabs, setTabs] = useState<WorkspaceTab[]>([
    {
      id: 'tab-1',
      title: 'Terminal 1',
      layout: 'single',
      activeSessionId: 'sess-1',
      sessions: [
        {
          id: 'sess-1',
          title: 'Shell',
          type: 'shell',
          cwd: '',
          createdAt: new Date().toISOString(),
        },
      ],
    },
  ]);

  const [activeTabId, setActiveTabId] = useState('tab-1');
  const [doctor, setDoctor] = useState<DoctorStatus | null>(null);
  const [diffOpen, setDiffOpen] = useState(false);
  const [rightPanelOpen, setRightPanelOpen] = useState(() => loadPersisted('warp.rightPanelOpen', true));
  const [gitDiff, setGitDiff] = useState('');
  const [gitFiles, setGitFiles] = useState<string[]>([]);
  const [gitBranch, setGitBranch] = useState<string | null>(null);
  const [cwd, setCwd] = useState('');
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(() => loadPersisted('warp.sidebarOpen', true));
  const [meshModalOpen, setMeshModalOpen] = useState(false);
  const [squadModalOpen, setSquadModalOpen] = useState(false);
  const [skillsModalOpen, setSkillsModalOpen] = useState(false);
  const [sandboxDrawerOpen, setSandboxDrawerOpen] = useState(false);
  const [activeSandboxes, setActiveSandboxes] = useState<any[]>([]);
  const [settingsModalOpen, setSettingsModalOpen] = useState(false);
  // "Nasıl kullanılır?" guide: opens by itself on the very first launch.
  const [guideOpen, setGuideOpen] = useState(() => {
    try {
      return localStorage.getItem('vulgaris.guideSeen') !== '1';
    } catch {
      return false;
    }
  });
  const closeGuide = () => {
    setGuideOpen(false);
    try {
      localStorage.setItem('vulgaris.guideSeen', '1');
    } catch {}
  };
  const [exportModalOpen, setExportModalOpen] = useState(false);
  const [hudOpen, setHudOpen] = useState(false);
  const [contextTelemetry, setContextTelemetry] = useState<ContextTelemetry | null>(null);
  const [sessionCommands, setSessionCommands] = useState<ReportCommandBlock[]>([]);

  // Project Workspace & Memory State
  const [recentProjects, setRecentProjects] = useState<string[]>([]);
  const [projectFiles, setProjectFiles] = useState<ProjectFileItem[]>([]);
  const [pastConversations, setPastConversations] = useState<PastProjectConversation[]>([]);
  const [projectMemory, setProjectMemory] = useState<MemoryData | null>(null);

  const [primaryModel, setPrimaryModel] = useState(() => loadPersisted('warp.primaryModel', 'claude'));
  const [reviewerModel, setReviewerModel] = useState(() => loadPersisted('warp.reviewerModel', 'gemini'));
  const [verifyCmd, setVerifyCmd] = useState(() => loadPersisted('warp.verifyCmd', 'npm test'));

  // ---- Squad (İkili Ajan) plumbing --------------------------------------
  // A squad step runs a command in a pane and waits for XtermPane to report
  // that it finished (exit code + output). One waiter per pane at a time.
  const paneWaiters = useRef<Record<string, (result: PaneRunResult) => void>>({});
  const handleCommandFinished = useCallback(
    (sessionId: string, result: { exitCode: number; output: string }) => {
      const resolve = paneWaiters.current[sessionId];
      if (!resolve) return;
      delete paneWaiters.current[sessionId];
      resolve({ exitCode: result.exitCode, output: result.output });
    },
    []
  );

  const squadDeps: SquadDeps = {
    runInPane: (sessionId, command) =>
      new Promise<PaneRunResult>((resolve) => {
        paneWaiters.current[sessionId] = resolve;
        dispatchToShell(sessionId, command);
      }),
    buildAgentRun: async (agent, prompt, { allowEdits }) => {
      let shell = 'powershell';
      try {
        shell = (await window.warpApi?.getConfig?.())?.defaultShell || shell;
      } catch {}
      const base = await buildAgentCommand(agent);
      // agy only takes its prompt as an argument; Windows PowerShell 5.1 mangles
      // double quotes inside native arguments, so swap them for single quotes.
      const text = agent === 'agy' ? prompt.replace(/"/g, "'") : prompt;
      const file: string = await window.warpApi.writeSquadPrompt(text);
      const read =
        shell === 'powershell'
          ? `Get-Content -Raw -Encoding UTF8 '${file.replace(/'/g, "''")}'`
          : shell === 'cmd'
            ? `type "${file}"`
            : `cat '${file}'`;

      if (agent === 'agy') {
        const flags = allowEdits ? ' --mode accept-edits' : '';
        if (shell === 'powershell') return `${base} -p (${read})${flags}`;
        if (shell === 'cmd') return `${base} -p "${text.replace(/\s+/g, ' ').slice(0, 7000)}"${flags}`;
        return `${base} -p "$(${read})"${flags}`;
      }
      const run =
        agent === 'claude'
          ? `${base} -p${allowEdits ? ' --permission-mode acceptEdits' : ''}`
          : agent === 'codex'
            ? `${base} exec ${allowEdits ? '--full-auto' : '--sandbox read-only'} -`
            : base;
      return `${read} | ${run}`;
    },
    getDiff: async () => {
      try {
        return (await window.warpApi.getGitDiff(cwd))?.diff || '';
      } catch {
        return '';
      }
    },
    interrupt: (sessionId) => window.warpApi?.writeTerminal(sessionId, '\x03'),
  };

  const { squad, startSquad, togglePause, stopSquad } = useSquadOrchestrator(squadDeps);

  const currentTab = tabs.find((t) => t.id === activeTabId) || tabs[0];
  const activeSession =
    currentTab?.sessions.find((s) => s.id === currentTab.activeSessionId) ||
    currentTab?.sessions[0] ||
    null;

  useEffect(() => {
    localStorage.setItem('warp.sidebarOpen', JSON.stringify(sidebarOpen));
  }, [sidebarOpen]);
  useEffect(() => {
    localStorage.setItem('warp.rightPanelOpen', JSON.stringify(rightPanelOpen));
  }, [rightPanelOpen]);
  useEffect(() => {
    localStorage.setItem('warp.primaryModel', JSON.stringify(primaryModel));
  }, [primaryModel]);
  useEffect(() => {
    localStorage.setItem('warp.reviewerModel', JSON.stringify(reviewerModel));
  }, [reviewerModel]);
  useEffect(() => {
    localStorage.setItem('warp.verifyCmd', JSON.stringify(verifyCmd));
  }, [verifyCmd]);

  const fetchContextTelemetry = useCallback(async () => {
    try {
      if (window.warpApi?.getContextStats) {
        const stats = await window.warpApi.getContextStats();
        if (stats) setContextTelemetry((prev) => (sameJson(prev, stats) ? prev : stats));
      }
    } catch (err) {
      console.warn('[HUD] Failed to get context telemetry:', err);
    }
  }, []);

  const refreshProjectData = useCallback(async (targetDir?: string) => {
    if (!window.warpApi) return;
    try {
      const [files, recents, convs, mem] = await Promise.all([
        window.warpApi.listProjectFiles ? window.warpApi.listProjectFiles(targetDir) : Promise.resolve([]),
        window.warpApi.getRecentProjects ? window.warpApi.getRecentProjects() : Promise.resolve([]),
        window.warpApi.getProjectConversations ? window.warpApi.getProjectConversations() : Promise.resolve([]),
        window.warpApi.getMemory ? window.warpApi.getMemory() : Promise.resolve(null),
      ]);
      if (files) setProjectFiles(files);
      if (recents) setRecentProjects(recents);
      if (convs) setPastConversations(convs);
      if (mem) setProjectMemory(mem);
    } catch (err) {
      console.warn('[Project] Failed to load project data:', err);
    }
  }, []);

  useEffect(() => {
    if (!window.warpApi) return;

    window.warpApi.getCwd().then((initialCwd: string) => {
      setCwd(initialCwd);
      refreshProjectData(initialCwd);
    });
    window.warpApi.getDoctorStatus().then(setDoctor);

    // Initial diff, branch, & context telemetry check
    refreshGitDiff();
    refreshGitBranch();
    refreshSandboxes();
    fetchContextTelemetry();

    // Periodic refresh every 5 seconds to show diff badge / branch changes / token savings.
    // Skipped while the window is hidden/minimized, and never overlaps a refresh
    // that is still running (git can be slow on big repos).
    let inFlight = false;
    const diffTimer = setInterval(async () => {
      if (inFlight || document.hidden) return;
      inFlight = true;
      try {
        await Promise.all([refreshGitDiff(), refreshGitBranch(), refreshSandboxes(), fetchContextTelemetry()]);
      } finally {
        inFlight = false;
      }
    }, 5000);
    return () => clearInterval(diffTimer);
  }, [fetchContextTelemetry, refreshProjectData]);

  const refreshSandboxes = async () => {
    if (window.warpApi?.listSandboxes) {
      try {
        const list = await window.warpApi.listSandboxes();
        const next = list || [];
        // createdAt is regenerated on every listing; compare what actually identifies a sandbox.
        const key = (l: any[]) => l.map((s) => `${s.worktreePath}|${s.branchName}`).join('\n');
        setActiveSandboxes((prev) => (key(prev) === key(next) ? prev : next));
      } catch {}
    }
  };

  const refreshGitDiff = async () => {
    if (window.warpApi) {
      try {
        const res = await window.warpApi.getGitDiff();
        setGitDiff(res.diff || '');
        const files: string[] = res.filesChanged || [];
        setGitFiles((prev) => (sameJson(prev, files) ? prev : files));
      } catch {}
    }
  };

  const refreshGitBranch = async () => {
    if (window.warpApi?.getGitBranch) {
      try {
        const branch = await window.warpApi.getGitBranch();
        setGitBranch(branch);
      } catch {}
    }
  };

  const refreshDoctor = async () => {
    if (window.warpApi) {
      try {
        setDoctor(await window.warpApi.getDoctorStatus());
      } catch {}
    }
  };

  const handleOpenExportModal = async () => {
    if (window.warpApi?.getMemory) {
      try {
        const mem = await window.warpApi.getMemory();
        if (mem && mem.commands && mem.commands.length > 0) {
          const blocks: ReportCommandBlock[] = mem.commands.map((c: any, i: number) => ({
            id: `cmd-${i}-${c.timestamp || Date.now()}`,
            command: c.command,
            exitCode: c.exitCode ?? 0,
            timestamp: c.timestamp ? new Date(c.timestamp).toLocaleTimeString() : new Date().toLocaleTimeString(),
            durationMs: c.durationMs,
            stdout: c.summary || '',
            stderr: '',
          }));
          setSessionCommands(blocks);
        }
      } catch {}
    }
    setExportModalOpen(true);
  };

  const reportData: SessionReportData = useMemo(() => ({
    title: currentTab?.title || 'Vulgaris Terminal Session',
    workspacePath: cwd,
    branch: gitBranch,
    timestamp: new Date().toLocaleString(),
    commands: sessionCommands,
    gitDiff: gitDiff,
    filesChanged: gitFiles,
    doctor: doctor,
  }), [currentTab, cwd, gitBranch, sessionCommands, gitDiff, gitFiles, doctor]);

  const handleOpenTerminalInSandbox = (worktreePath: string) => {
    const id = `sess-sb-${Date.now()}`;
    const newSession: TerminalSession = {
      id,
      title: 'Sandbox Shell',
      type: 'shell',
      command: '',
      cwd: worktreePath,
      createdAt: new Date().toISOString(),
    };

    setTabs((prev) =>
      prev.map((t) => {
        if (t.id === activeTabId) {
          const sessions = [...t.sessions, newSession];
          const layout = sessions.length > 1 ? 'split-h' : 'single';
          return {
            ...t,
            sessions,
            layout,
            activeSessionId: id,
            paneSizes: undefined,
          };
        }
        return t;
      })
    );
    setSandboxDrawerOpen(false);
  };

  // Agents (Claude / AGY / Codex) run inside a shell session, exactly like typing
  // the command into the terminal: their own chat UI opens right where the shell
  // prompt was and the dock steps aside until they exit.
  const AGENT_TITLES: Partial<Record<SessionType, string>> = {
    claude: 'Claude Code',
    agy: 'AGY Engine',
    codex: 'Codex CLI',
  };

  const buildAgentCommand = async (type: SessionType): Promise<string> => {
    if (type !== 'claude') return type;
    const flags: string[] = [];
    try {
      const claude = (await window.warpApi?.getConfig?.())?.claude;
      if (claude?.skipPermissions) flags.push('--dangerously-skip-permissions');
      if (claude?.model && claude.model !== 'default') flags.push('--model', claude.model);
      if (Array.isArray(claude?.additionalFlags)) flags.push(...claude.additionalFlags);
    } catch {}
    return ['claude', ...flags].join(' ');
  };

  // Commands waiting for a freshly created shell pane to register its handler.
  const pendingShellCommands = useRef<Record<string, string>>({});
  const dispatchToShell = (sessionId: string, command: string) => {
    const handler = shellCommandHandlers.current[sessionId];
    if (handler) handler(command);
    else pendingShellCommands.current[sessionId] = command;
  };

  const createShellTab = (title: string, command?: string): string => {
    const newTabId = `tab-${Date.now()}`;
    const newSessionId = `sess-${Date.now()}`;
    const newTab: WorkspaceTab = {
      id: newTabId,
      title,
      layout: 'single',
      activeSessionId: newSessionId,
      sessions: [{ id: newSessionId, title, type: 'shell', cwd, createdAt: new Date().toISOString() }],
    };
    setTabs((prev) => [...prev, newTab]);
    setActiveTabId(newTabId);
    if (command) pendingShellCommands.current[newSessionId] = command;
    return newSessionId;
  };

  // Returns the id of the shell session the agent is being started in.
  const handleLaunchAgent = (type: SessionType): string | null => {
    if (type === 'shell') {
      const id = `sess-${Date.now()}`;
      const newSession: TerminalSession = {
        id,
        title: 'Shell',
        type,
        command: '',
        cwd,
        createdAt: new Date().toISOString(),
      };
      setTabs((prev) =>
        prev.map((t) => {
          if (t.id !== activeTabId) return t;
          const sessions = [...t.sessions, newSession];
          return {
            ...t,
            sessions,
            layout: sessions.length > 1 ? 'split-h' : 'single',
            activeSessionId: id,
            paneSizes: undefined,
          };
        })
      );
      return id;
    }

    const title = AGENT_TITLES[type] || 'Terminal';
    const idleShell = currentTab?.sessions.find((s) => s.type === 'shell' && !sessionUi[s.id]?.busy);
    const targetId = idleShell ? idleShell.id : createShellTab(title);
    if (idleShell) handleSetActiveSession(idleShell.id);
    buildAgentCommand(type).then((command) => dispatchToShell(targetId, command));
    return targetId;
  };

  // Launch a 2-way Split Live Autonomous Squad
  const handleLaunchLiveSquad = (config: {
    goal: string;
    builder: SessionType;
    verifier: SessionType;
    verifyCmd: string;
    maxRounds: number;
  }) => {
    if (squad) stopSquad();
    const newTabId = `tab-squad-${Date.now()}`;
    const builderSessionId = `sess-b-${Date.now()}`;
    const verifierSessionId = `sess-v-${Date.now()}`;

    // Both panes are plain shells: the squad runs each agent turn in them
    // non-interactively, so every step's output stays visible and ends with a
    // real exit code instead of a guess about when an agent went quiet.
    const builderSession: TerminalSession = {
      id: builderSessionId,
      title: `${squadAgentLabel(config.builder)} (yazan)`,
      type: 'shell',
      command: '',
      cwd,
      createdAt: new Date().toISOString(),
    };

    const verifierSession: TerminalSession = {
      id: verifierSessionId,
      title: `${squadAgentLabel(config.verifier)} (kontrol eden)`,
      type: 'shell',
      command: '',
      cwd,
      createdAt: new Date().toISOString(),
    };

    const squadTab: WorkspaceTab = {
      id: newTabId,
      title: `İkili: ${squadAgentLabel(config.builder)} ⇄ ${squadAgentLabel(config.verifier)}`,
      layout: 'split-h',
      activeSessionId: builderSessionId,
      paneSizes: [50, 50],
      sessions: [builderSession, verifierSession],
    };

    setTabs((prev) => [...prev, squadTab]);
    setActiveTabId(newTabId);

    startSquad(config, newTabId, builderSessionId, verifierSessionId);
  };

  // Tab management
  const handleAddTab = (type: SessionType = 'shell') => {
    const title = AGENT_TITLES[type] || `Terminal ${tabs.length + 1}`;
    const sessionId = createShellTab(title);
    if (type !== 'shell') {
      buildAgentCommand(type).then((command) => dispatchToShell(sessionId, command));
    }
  };

  const handleCloseTab = (tabId: string) => {
    if (tabs.length <= 1) return;
    const tabToClose = tabs.find((t) => t.id === tabId);
    if (tabToClose) {
      // Deterministic subscription cleanup & process kill
      subscriptionRegistry.disposeScope(tabToClose.id);
      for (const s of tabToClose.sessions) {
        subscriptionRegistry.disposeScope(s.id);
        if (window.warpApi?.killTerminal) {
          window.warpApi.killTerminal(s.id);
        }
      }
    }

    const remaining = tabs.filter((t) => t.id !== tabId);
    setTabs(remaining);
    if (activeTabId === tabId) {
      setActiveTabId(remaining[0].id);
    }
  };

  const cycleTab = useCallback(
    (dir: 1 | -1) => {
      setActiveTabId((prev) => {
        const idx = tabs.findIndex((t) => t.id === prev);
        if (idx === -1) return prev;
        const nextIdx = (idx + dir + tabs.length) % tabs.length;
        return tabs[nextIdx]?.id || prev;
      });
    },
    [tabs]
  );

  // Session inside active tab management
  const handleSetActiveSession = (sessionId: string) => {
    setTabs((prev) =>
      prev.map((t) => (t.id === activeTabId ? { ...t, activeSessionId: sessionId } : t))
    );
  };

  const handleCloseSession = (sessionId: string) => {
    // Deterministic subscription cleanup & process kill for closing session
    subscriptionRegistry.disposeScope(sessionId);
    if (window.warpApi?.killTerminal) {
      window.warpApi.killTerminal(sessionId);
    }

    setTabs((prev) =>
      prev.map((t) => {
        if (t.id === activeTabId) {
          const remainingSessions = t.sessions.filter((s) => s.id !== sessionId);
          return {
            ...t,
            sessions: remainingSessions,
            layout: remainingSessions.length <= 1 ? 'single' : t.layout,
            activeSessionId:
              t.activeSessionId === sessionId
                ? remainingSessions[0]?.id || ''
                : t.activeSessionId,
            paneSizes: undefined,
          };
        }
        return t;
      })
    );
  };

  const handleSplitSession = (sessionId: string, direction: 'h' | 'v') => {
    setTabs((prev) =>
      prev.map((t) => {
        if (t.id === activeTabId) {
          return {
            ...t,
            layout: direction === 'h' ? 'split-h' : 'split-v',
          };
        }
        return t;
      })
    );
    // Add another shell session in the split view
    handleLaunchAgent('shell');
  };

  const handleResizePanes = (sizes: number[]) => {
    setTabs((prev) =>
      prev.map((t) => (t.id === activeTabId ? { ...t, paneSizes: sizes } : t))
    );
  };

  // Hand a prompt to an agent. If a program already owns the terminal (an agent
  // that's running) type straight into it; otherwise start the agent first.
  const sendPromptToAgent = (targetType: SessionType, prompt: string) => {
    const busyShell = currentTab?.sessions.find((s) => s.type === 'shell' && sessionUi[s.id]?.busy);
    if (busyShell) {
      handleSetActiveSession(busyShell.id);
      window.warpApi.writeTerminal(busyShell.id, prompt);
      return;
    }
    const sessionId = handleLaunchAgent(targetType);
    if (sessionId) setTimeout(() => window.warpApi.writeTerminal(sessionId, prompt), 5000);
  };

  // Pipe error to agent for Self-Correction
  const handlePipeErrorToAgent = (targetType: SessionType, errorSnippet: string) => {
    sendPromptToAgent(
      targetType,
      `Compiler/Test error occurred:\n${errorSnippet}\nPlease diagnose and fix this error.\r`
    );
  };

  // Cross-Model Adversarial Review from Git Diff
  const handleSendDiffToAgent = (targetType: SessionType) => {
    const instruction = `Please review this git diff for security vulnerabilities, memory leaks, and edge cases:\n\`\`\`diff\n${gitDiff.slice(
      0,
      3000
    )}\n\`\`\`\r`;
    sendPromptToAgent(targetType, instruction);

    setDiffOpen(false);
  };

  const handleRevertGit = async () => {
    if (window.warpApi) {
      await window.warpApi.revertGit();
      await refreshGitDiff();
    }
  };

  const handleCommitAndPush = async (message: string) => {
    if (window.warpApi?.gitCommit) {
      await window.warpApi.gitCommit(message, cwd);
      if (window.warpApi.gitPush) {
        await window.warpApi.gitPush('origin', gitBranch || 'master', cwd);
      }
      await refreshGitDiff();
    }
  };

  // Workspace Project Management & Memory Handlers
  const handleOpenProjectFolder = async () => {
    if (!window.warpApi?.openProjectFolder) return;
    try {
      const res = await window.warpApi.openProjectFolder();
      if (res && res.path) {
        setCwd(res.path);
        if (res.recentProjects) setRecentProjects(res.recentProjects);
        await refreshProjectData(res.path);
        refreshGitDiff();
        refreshGitBranch();
      }
    } catch (err) {
      console.error('[Project] Error opening project folder:', err);
    }
  };

  const handleSelectRecentProject = async (path: string) => {
    if (!window.warpApi?.setProjectFolder) return;
    try {
      const res = await window.warpApi.setProjectFolder(path);
      if (res && res.path) {
        setCwd(res.path);
        if (res.recentProjects) setRecentProjects(res.recentProjects);
        await refreshProjectData(res.path);
        refreshGitDiff();
        refreshGitBranch();
      }
    } catch (err) {
      console.error('[Project] Error switching project:', err);
    }
  };

  const handleAddMemoryRule = async (rule: string) => {
    if (!window.warpApi?.addMemoryRule) return;
    try {
      await window.warpApi.addMemoryRule(rule);
      const mem = await window.warpApi.getMemory();
      if (mem) setProjectMemory(mem);
    } catch (err) {
      console.error('[Memory] Error adding rule:', err);
    }
  };

  const handleRemoveMemoryRule = async (rule: string) => {
    if (!window.warpApi?.removeMemoryRule) return;
    try {
      await window.warpApi.removeMemoryRule(rule);
      const mem = await window.warpApi.getMemory();
      if (mem) setProjectMemory(mem);
    } catch (err) {
      console.error('[Memory] Error removing rule:', err);
    }
  };

  const handleAddMemoryFact = async (key: string, value: string) => {
    if (!window.warpApi?.setMemoryFact) return;
    try {
      await window.warpApi.setMemoryFact(key, value, 'user');
      const mem = await window.warpApi.getMemory();
      if (mem) setProjectMemory(mem);
    } catch (err) {
      console.error('[Memory] Error adding fact:', err);
    }
  };

  const handleDeleteMemoryFact = async (key: string) => {
    if (!window.warpApi?.deleteMemoryFact) return;
    try {
      await window.warpApi.deleteMemoryFact(key);
      const mem = await window.warpApi.getMemory();
      if (mem) setProjectMemory(mem);
    } catch (err) {
      console.error('[Memory] Error deleting fact:', err);
    }
  };

  // Text pushed into the dock's input (file explorer paths, skill templates)
  // for the user to finish and run themselves - never executed directly.
  const [dockInsert, setDockInsert] = useState<{ text: string; nonce: number } | null>(null);
  const insertIntoDock = (text: string) => setDockInsert({ text, nonce: Date.now() });

  const handleInsertFilePath = (filePath: string) => {
    insertIntoDock(/\s/.test(filePath) ? `"${filePath}"` : filePath);
  };

  // Ctrl+Shift+Enter in the dock / re-opening a past conversation: start Claude
  // in the active shell with the text as its first prompt (`claude "<prompt>"`).
  const handleAskAgent = async (prompt: string, agent: SessionType = 'claude') => {
    const text = prompt.trim();
    if (!text || !activeSession || activeSession.type !== 'shell') return;
    const sessionId = activeSession.id;
    if (sessionUi[sessionId]?.busy) {
      // A program already owns the terminal (e.g. Claude is open): type into it.
      window.warpApi.writeTerminal(sessionId, text + '\r');
      return;
    }
    let shell = 'powershell';
    try {
      shell = (await window.warpApi?.getConfig?.())?.defaultShell || shell;
    } catch {}
    const quoted =
      shell === 'cmd'
        ? `"${text.replace(/"/g, '""')}"`
        : shell === 'powershell'
          ? `'${text.replace(/'/g, "''")}'`
          : `'${text.replace(/'/g, "'\\''")}'`;
    const command = await buildAgentCommand(agent);
    dispatchToShell(sessionId, `${command} ${quoted}`);

    if (window.warpApi?.saveProjectConversation) {
      const conv: PastProjectConversation = {
        id: `conv-${Date.now()}`,
        title: text.length > 60 ? `${text.slice(0, 57)}...` : text,
        agent,
        prompt: text,
        timestamp: new Date().toISOString(),
      };
      window.warpApi
        .saveProjectConversation(conv)
        .then(() => window.warpApi.getProjectConversations())
        .then((convs: PastProjectConversation[]) => convs && setPastConversations(convs))
        .catch(() => {});
    }
  };

  // Registry of shell-pane "command submitted" handlers, one per XtermPane
  // currently mounted for a shell session, keyed by session id. Lets
  // handleSendInputToActive tell the right pane to inject a block header when
  // a command comes in through BottomCommandDock (which writes straight to
  // the PTY over IPC and never fires that pane's local term.onData).
  const shellCommandHandlers = useRef<Record<string, (command: string) => void>>({});
  const registerShellCommandHandler = useCallback(
    (sessionId: string, handler: ((command: string) => void) | null) => {
      if (handler) {
        shellCommandHandlers.current[sessionId] = handler;
        const pending = pendingShellCommands.current[sessionId];
        if (pending) {
          delete pendingShellCommands.current[sessionId];
          handler(pending);
        }
      } else delete shellCommandHandlers.current[sessionId];
    },
    []
  );

  // Per-shell-session UI state reported by XtermPane: whether a command is
  // currently running (dock hides so the program's own UI owns the terminal)
  // and the shell's current directory.
  // Shell sessions that have run at least one command; until then the dock
  // offers quick-start buttons so a new user has an obvious first step.
  const [sessionsWithCommands, setSessionsWithCommands] = useState<Set<string>>(() => new Set());
  const [sessionUi, setSessionUi] = useState<Record<string, { busy: boolean; cwd: string; agent?: boolean }>>({});
  const handleSessionState = useCallback(
    (sessionId: string, state: { busy: boolean; cwd: string; agent?: boolean }) => {
      if (state.busy) {
        setSessionsWithCommands((prev) => (prev.has(sessionId) ? prev : new Set(prev).add(sessionId)));
      }
      setSessionUi((prev) => {
        const cur = prev[sessionId];
        if (cur && cur.busy === state.busy && cur.cwd === state.cwd && cur.agent === state.agent) return prev;
        return { ...prev, [sessionId]: state };
      });
    },
    []
  );
  const activeSessionUi = activeSession ? sessionUi[activeSession.id] : undefined;
  // While an agent CLI runs, Vulgaris's own input area is removed entirely.
  const dockSlotVisible =
    (!activeSession || activeSession.type === 'shell') && !(activeSessionUi?.busy && activeSessionUi?.agent);
  const dockVisible = dockSlotVisible && !activeSessionUi?.busy;

  // While a command owns the terminal the dock is swapped for a strip of the
  // same height. Keeping the slot size constant means the PTY is never resized
  // when a command starts/ends, which would make ConPTY repaint and shift the
  // block headers drawn over the scrollback.
  const dockSlotRef = useRef<HTMLDivElement>(null);
  const [dockHeight, setDockHeight] = useState<number | null>(null);
  useEffect(() => {
    const el = dockSlotRef.current;
    if (!el || !dockVisible) return;
    const measure = () => setDockHeight(el.offsetHeight);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [dockVisible, dockSlotVisible]);

  const handleSendInputToActive = (text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;

    if (activeSession) {
      const id = activeSession.id;
      setSessionsWithCommands((prev) => (prev.has(id) ? prev : new Set(prev).add(id)));
    }

    if (window.warpApi && activeSession) {
      // Shell sessions are chat-style: the pane runs the command in its own
      // PowerShell session. Agent sessions still take raw PTY input.
      if (activeSession.type === 'shell') {
        shellCommandHandlers.current[activeSession.id]?.(trimmed);
      } else {
        window.warpApi.writeTerminal(activeSession.id, text);
      }
    }
  };

  const handleGuideAction = (action: GuideAction) => {
    switch (action) {
      case 'focusDock':
        insertIntoDock('');
        break;
      case 'launchClaude':
        handleLaunchAgent('claude');
        break;
      case 'openFolder':
        setSidebarOpen(true);
        void handleOpenProjectFolder();
        break;
      case 'openSkills':
        setSkillsModalOpen(true);
        break;
      case 'openChanges':
        refreshGitDiff();
        setRightPanelOpen(true);
        break;
      case 'openSquad':
        setSquadModalOpen(true);
        break;
      case 'openMesh':
        setMeshModalOpen(true);
        break;
      case 'openReport':
        void handleOpenExportModal();
        break;
      case 'openPalette':
        setPaletteOpen(true);
        break;
      case 'openSettings':
        setSettingsModalOpen(true);
        break;
    }
  };

  // Command Palette: catalog of every action a power user might reach for
  const paletteActions: CommandPaletteAction[] = useMemo(
    () => [
      { id: 'guide', label: 'Nasıl kullanılır? (Yardım)', group: 'Help', shortcut: 'F1', keywords: 'help yardım rehber guide nasıl', run: () => setGuideOpen(true) },
      { id: 'new-tab', label: 'New Terminal Tab', group: 'Tabs', shortcut: 'Ctrl+Shift+T', run: handleAddTab },
      {
        id: 'next-tab',
        label: 'Next Tab',
        group: 'Tabs',
        shortcut: 'Ctrl+Tab',
        run: () => cycleTab(1),
      },
      {
        id: 'prev-tab',
        label: 'Previous Tab',
        group: 'Tabs',
        shortcut: 'Ctrl+Shift+Tab',
        run: () => cycleTab(-1),
      },
      {
        id: 'launch-shell',
        label: 'Launch Shell Pane',
        group: 'Launch',
        keywords: 'terminal bash powershell',
        run: () => handleLaunchAgent('shell'),
      },
      {
        id: 'launch-claude',
        label: 'Launch Claude Code',
        group: 'Launch',
        keywords: 'anthropic ai',
        run: () => handleLaunchAgent('claude'),
      },
      {
        id: 'launch-agy',
        label: 'Launch AGY Engine',
        group: 'Launch',
        keywords: 'antigravity google',
        run: () => handleLaunchAgent('agy'),
      },
      {
        id: 'launch-codex',
        label: 'Launch Codex CLI',
        group: 'Launch',
        keywords: 'openai',
        run: () => handleLaunchAgent('codex'),
      },
      {
        id: 'launch-live-squad',
        label: 'Launch Live Autonomous Squad (Split View)',
        group: 'Autonomous',
        shortcut: 'Ctrl+Shift+S',
        keywords: 'squad team pair claude agy split live',
        run: () => setSquadModalOpen(true),
      },
      {
        id: 'split-h',
        label: 'Split Active Pane Horizontally',
        group: 'Panes',
        shortcut: 'Ctrl+Shift+D',
        run: () => activeSession && handleSplitSession(activeSession.id, 'h'),
      },
      {
        id: 'split-v',
        label: 'Split Active Pane Vertically',
        group: 'Panes',
        shortcut: 'Ctrl+Shift+E',
        run: () => activeSession && handleSplitSession(activeSession.id, 'v'),
      },
      {
        id: 'close-pane',
        label: 'Close Active Pane',
        group: 'Panes',
        shortcut: 'Ctrl+Shift+W',
        run: () => activeSession && handleCloseSession(activeSession.id),
      },
      {
        id: 'open-skills',
        label: 'Open Shared Skills & Workspace Memory',
        group: 'Skills',
        shortcut: 'Ctrl+Shift+K',
        keywords: 'skills memory workflows snippets templates docker git prompt',
        run: () => setSkillsModalOpen(true),
      },
      {
        id: 'open-sandbox',
        label: 'Inspect Agent Worktree Sandboxes',
        group: 'Git',
        shortcut: 'Ctrl+Shift+U',
        keywords: 'sandbox worktree branch merge isolate test',
        run: () => setSandboxDrawerOpen(true),
      },
      {
        id: 'toggle-sidebar',
        label: 'Toggle Sidebar',
        group: 'View',
        shortcut: 'Ctrl+Shift+B',
        run: () => setSidebarOpen((v) => !v),
      },
      {
        id: 'toggle-diff',
        label: 'Toggle Git Diff Drawer',
        group: 'Git',
        shortcut: 'Ctrl+Shift+G',
        keywords: 'diff review',
        run: () => {
          refreshGitDiff();
          setDiffOpen((v) => !v);
        },
      },
      {
        id: 'git-rollback',
        label: 'Git Rollback (reset --hard)',
        group: 'Git',
        keywords: 'revert discard clean',
        run: handleRevertGit,
      },
      {
        id: 'refresh-doctor',
        label: 'Refresh System Health (Doctor)',
        group: 'System',
        keywords: 'tools status',
        run: refreshDoctor,
      },
      {
        id: 'open-settings',
        label: 'Settings & CLI Flags (Claude, AGY, Codex)',
        group: 'Settings',
        shortcut: 'Ctrl+,',
        keywords: 'settings preferences config dangerously-skip-permissions models shell font theme permissions',
        run: () => setSettingsModalOpen(true),
      },
      {
        id: 'export-report',
        label: 'Export Technical Report (Markdown / HTML / JSON)',
        group: 'Export',
        shortcut: 'Ctrl+Shift+X',
        keywords: 'export report markdown html timeline audit json summary',
        run: handleOpenExportModal,
      },
      {
        id: 'open-token-hud',
        label: 'Token & Context Optimizer HUD',
        group: 'AI & Context',
        shortcut: 'Ctrl+Shift+O',
        keywords: 'token context optimizer memory quota subscription savings cost',
        run: () => setHudOpen(true),
      },
    ],
    [activeSession, tabs, activeTabId, cwd, handleOpenExportModal]
  );

  // Global keyboard shortcuts. Everything uses Ctrl/Cmd+Shift+<key> (VSCode/Warp
  // convention) so it never collides with shell/readline bindings like
  // Ctrl+W (delete word), Ctrl+K (kill line), or Ctrl+D (EOF) inside a pane.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'F1') {
        e.preventDefault();
        setGuideOpen((v) => !v);
        return;
      }
      const mod = e.ctrlKey || e.metaKey;
      if (!mod) return;

      const key = e.key.toLowerCase();

      if (key === 'tab') {
        e.preventDefault();
        cycleTab(e.shiftKey ? -1 : 1);
        return;
      }

      // Ctrl+, for settings
      if (key === ',' && !e.shiftKey) {
        e.preventDefault();
        setSettingsModalOpen((v) => !v);
        return;
      }

      if (!e.shiftKey) return;

      switch (key) {
        case 'x':
          e.preventDefault();
          handleOpenExportModal();
          break;
        case 'p':
          e.preventDefault();
          setPaletteOpen((v) => !v);
          break;
        case 'k':
          e.preventDefault();
          setSkillsModalOpen((v) => !v);
          break;
        case 'u':
          e.preventDefault();
          setSandboxDrawerOpen((v) => !v);
          break;
        case 's':
          e.preventDefault();
          setSquadModalOpen((v) => !v);
          break;
        case 't':
          e.preventDefault();
          handleAddTab();
          break;
        case 'w':
          e.preventDefault();
          if (activeSession) handleCloseSession(activeSession.id);
          break;
        case 'd':
          e.preventDefault();
          if (activeSession) handleSplitSession(activeSession.id, 'h');
          break;
        case 'e':
          e.preventDefault();
          if (activeSession) handleSplitSession(activeSession.id, 'v');
          break;
        case 'b':
          e.preventDefault();
          setSidebarOpen((v) => !v);
          break;
        case 'o':
          e.preventDefault();
          setHudOpen((v) => !v);
          break;
        case 'g':
          e.preventDefault();
          refreshGitDiff();
          setRightPanelOpen((v) => !v);
          break;
      }
    };

    window.addEventListener('keydown', handler, true);
    return () => window.removeEventListener('keydown', handler, true);
  }, [activeSession, activeTabId, cycleTab]);

  return (
    <div className="flex flex-col h-screen w-screen ambient-background overflow-hidden select-none font-sans text-zinc-200">
      {/* Top Bar: Tabs & Quick Agent Launchers */}
      <TopBar
        onToggleDiff={() => {
          refreshGitDiff();
          setRightPanelOpen(!rightPanelOpen);
        }}
        doctor={doctor}
        hasUncommittedDiff={gitDiff.trim().length > 0}
        sidebarOpen={sidebarOpen}
        onToggleSidebar={() => setSidebarOpen((v) => !v)}
        onOpenPalette={() => setPaletteOpen(true)}
        onOpenMeshModal={() => setMeshModalOpen(true)}
        onOpenSquadModal={() => setSquadModalOpen(true)}
        onOpenSkillsModal={() => setSkillsModalOpen(true)}
        onOpenSettings={() => setSettingsModalOpen(true)}
        onOpenExportReport={handleOpenExportModal}
        onOpenGuide={() => setGuideOpen(true)}
      />

      {/* Main Content: Sidebar + Center Workspace + Right Panel */}
      <div className="flex-1 w-full min-h-0 relative flex bg-base-app">
        {sidebarOpen && (
          <Sidebar
            isOpen={sidebarOpen}
            onToggleSidebar={() => setSidebarOpen((v) => !v)}
            cwd={cwd}
            gitBranch={gitBranch}
            tabs={tabs}
            activeTabId={activeTabId}
            onSelectTab={setActiveTabId}
            onNewSession={(type) => handleAddTab(type || 'shell')}
            onLaunchAgent={handleLaunchAgent}
            onOpenPalette={() => setPaletteOpen(true)}
            onOpenSquads={() => setSquadModalOpen(true)}
            onOpenSkills={() => setSkillsModalOpen(true)}
            onOpenSettings={() => setSettingsModalOpen(true)}
            pastRuns={[]}
            recentProjects={recentProjects}
            onOpenProjectFolder={handleOpenProjectFolder}
            onSelectRecentProject={handleSelectRecentProject}
            projectFiles={projectFiles}
            onRefreshFiles={() => refreshProjectData(cwd)}
            onInsertFilePath={handleInsertFilePath}
            pastConversations={pastConversations}
            onSelectConversation={(conv) => {
              if (conv.prompt) void handleAskAgent(conv.prompt, conv.agent || 'claude');
            }}
            projectMemory={projectMemory}
            onAddMemoryRule={handleAddMemoryRule}
            onRemoveMemoryRule={handleRemoveMemoryRule}
            onAddMemoryFact={handleAddMemoryFact}
            onDeleteMemoryFact={handleDeleteMemoryFact}
          />
        )}

        <div className="flex-1 min-w-0 min-h-0 flex flex-col bg-base-app">
          {/* Live Squad Status Banner (if active on current tab) */}
          {squad && squad.tabId === activeTabId && squad.active && (
            <SquadBar
              squad={squad}
              onPauseToggle={togglePause}
              onStopSquad={stopSquad}
              onOpenChanges={() => {
                refreshGitDiff();
                setRightPanelOpen(true);
              }}
            />
          )}

          {/* Full-bleed terminal canvas — no chrome, no header. The active CLI
              (Claude/AGY/Codex/Shell) renders edge-to-edge with zero app-level
              decoration on top of it. */}
          <div className="flex-1 min-w-0 min-h-0 flex bg-base-app">
            {currentTab && (
              <PaneGrid
                tab={currentTab}
                onSetActiveSession={handleSetActiveSession}
                onCloseSession={handleCloseSession}
                onSplitSession={handleSplitSession}
                onPipeErrorToAgent={handlePipeErrorToAgent}
                onResizePanes={handleResizePanes}
                onLaunchAgent={handleLaunchAgent}
                onRegisterCommandHandler={registerShellCommandHandler}
                onSessionState={handleSessionState}
                onCommandFinished={handleCommandFinished}
              />
            )}
          </div>

          {/* Bottom Command Dock — scoped to the center column only, so it never
              slides underneath the sidebar. Only for plain shell sessions: agent
              CLIs (Claude/AGY/Codex) render their own full-height chat/input
              inside the PTY itself, so showing our own input bar on top of
              theirs would duplicate it. */}
          {dockSlotVisible && (
            <div
              ref={dockSlotRef}
              className="flex-shrink-0"
              style={!dockVisible && dockHeight ? { height: dockHeight } : undefined}
            >
            {dockVisible ? (
            <BottomCommandDock
              activeSession={activeSession}
              onSendInput={handleSendInputToActive}
              primaryModel={primaryModel}
              onSelectModel={setPrimaryModel}
              gitBranch={gitBranch}
              cwd={activeSessionUi?.cwd || cwd}
              onContinueWorking={() => {
                if (activeSession) handleSendInputToActive('\r');
              }}
              onCommitAndPush={() => {
                setRightPanelOpen(true);
              }}
              onExplainActive={() => {
                if (activeSession) {
                  handlePipeErrorToAgent('claude', 'Please diagnose recent terminal command output.');
                }
              }}
              onFixActive={() => {
                if (activeSession) {
                  handlePipeErrorToAgent('agy', 'Auto-fix detected error in terminal.');
                }
              }}
              onOpenHud={() => setHudOpen(true)}
              onAskAgent={(prompt) => void handleAskAgent(prompt)}
              insertRequest={dockInsert}
              quickActions={
                activeSession && !sessionsWithCommands.has(activeSession.id)
                  ? [
                      { label: "Claude'u başlat", title: 'Claude Code bu terminalde açılır; ne yapılacağını ona yazarsınız', onClick: () => handleLaunchAgent('claude') },
                      { label: "Codex'i başlat", title: 'OpenAI Codex CLI bu terminalde açılır', onClick: () => handleLaunchAgent('codex') },
                      { label: 'Proje klasörü aç', title: 'Çalışacağınız klasörü seçin', onClick: handleOpenProjectFolder },
                      { label: 'Nasıl kullanılır?', title: 'Tüm özelliklerin kısa açıklaması (F1)', onClick: () => setGuideOpen(true) },
                    ]
                  : undefined
              }
              tokenSavingsText={`${contextTelemetry?.savingsPercentage ?? 68}% saved`}
            />
            ) : (
              <div className="h-full bg-base-app border-t border-zinc-900/70 px-4 pt-3 text-[11px] font-mono text-zinc-600 select-none">
                Komut çalışıyor — klavye girdisi terminale gidiyor · durdurmak için Ctrl+C
              </div>
            )}
            </div>
          )}
        </div>

        {/* Right Split Panel: Changes / Sandbox */}
        {rightPanelOpen && (
          <RightPanel
            isOpen={rightPanelOpen}
            onClose={() => setRightPanelOpen(false)}
            diff={gitDiff}
            filesChanged={gitFiles}
            gitBranch={gitBranch}
            sandboxes={activeSandboxes}
            onRevert={handleRevertGit}
            onCommitAndPush={handleCommitAndPush}
            onOpenTerminalInSandbox={handleOpenTerminalInSandbox}
            onSendDiffToAgent={handleSendDiffToAgent}
          />
        )}
      </div>

      {/* Status Bar */}
      <StatusBar
        cwd={cwd}
        gitBranch={gitBranch}
        isDirty={gitDiff.trim().length > 0 || gitFiles.length > 0}
        doctor={doctor}
        paneCount={currentTab?.sessions.length || 0}
        activeSession={activeSession}
        sandboxCount={activeSandboxes.length}
        onOpenSandbox={() => setSandboxDrawerOpen(true)}
        onOpenPalette={() => setPaletteOpen(true)}
      />

      {/* Token & Context Optimizer HUD Modal */}
      <TokenOptimizerHUD
        isOpen={hudOpen}
        onClose={() => setHudOpen(false)}
        telemetry={contextTelemetry}
        onRefreshTelemetry={fetchContextTelemetry}
      />

      {/* Safe Git Worktree Sandbox Review Drawer */}
      <SandboxDrawer
        isOpen={sandboxDrawerOpen}
        onClose={() => setSandboxDrawerOpen(false)}
        onOpenTerminalInSandbox={handleOpenTerminalInSandbox}
        onRefreshDiff={refreshGitDiff}
      />

      {/* Command Palette */}
      <CommandPalette
        isOpen={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        actions={paletteActions}
      />

      {/* Autonomous Agent Mesh Modal */}
      <AgentMeshModal
        isOpen={meshModalOpen}
        onClose={() => setMeshModalOpen(false)}
        cwd={cwd}
        onOpenChanges={() => {
          refreshGitDiff();
          setRightPanelOpen(true);
        }}
        onOpenSandboxes={() => setSandboxDrawerOpen(true)}
      />

      {/* Live Autonomous Squad Modal */}
      <LiveSquadModal
        isOpen={squadModalOpen}
        onClose={() => setSquadModalOpen(false)}
        onLaunchSquad={handleLaunchLiveSquad}
      />

      {/* Universal Shared Skills & Persistent Memory Modal */}
      <SkillsModal
        isOpen={skillsModalOpen}
        onClose={() => setSkillsModalOpen(false)}
        onRunInTerminal={(command) => {
          if (activeSession) handleSendInputToActive(command);
        }}
        onInsertIntoInput={(command) => {
          insertIntoDock(command);
          setSkillsModalOpen(false);
        }}
      />

      {/* CLI Permissions & Settings Modal */}
      <SettingsModal
        isOpen={settingsModalOpen}
        onClose={() => setSettingsModalOpen(false)}
      />

      {/* First-run / F1 feature guide */}
      <GuideModal isOpen={guideOpen} onClose={closeGuide} onAction={handleGuideAction} />

      {/* Vulgaris Session Timeline & Technical Report Modal */}
      <ExportReportModal
        isOpen={exportModalOpen}
        onClose={() => setExportModalOpen(false)}
        reportData={reportData}
      />
    </div>
  );
};
