import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { TopBar } from './components/TopBar.js';
import { PaneGrid } from './components/PaneGrid.js';
import { BottomCommandDock } from './components/BottomCommandDock.js';
import { DiffDrawer } from './components/DiffDrawer.js';
import { Sidebar } from './components/Sidebar.js';
import { StatusBar } from './components/StatusBar.js';
import { CommandPalette } from './components/CommandPalette.js';
import { AgentMeshModal } from './components/AgentMeshModal.js';
import { SquadBar } from './components/SquadBar.js';
import { LiveSquadModal } from './components/LiveSquadModal.js';
import { SkillsModal } from './components/SkillsModal.js';
import { SandboxDrawer } from './components/SandboxDrawer.js';
import { SettingsModal } from './components/SettingsModal.js';
import { subscriptionRegistry } from './utils/subscriptionManager.js';
import { useSquadOrchestrator } from './hooks/useSquadOrchestrator.js';
import type {
  WorkspaceTab,
  TerminalSession,
  DoctorStatus,
  SessionType,
  CommandPaletteAction,
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
  const [gitDiff, setGitDiff] = useState('');
  const [gitFiles, setGitFiles] = useState<string[]>([]);
  const [gitBranch, setGitBranch] = useState<string | null>(null);
  const [cwd, setCwd] = useState('');
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(() => loadPersisted('warp.sidebarOpen', false));
  const [meshModalOpen, setMeshModalOpen] = useState(false);
  const [squadModalOpen, setSquadModalOpen] = useState(false);
  const [skillsModalOpen, setSkillsModalOpen] = useState(false);
  const [sandboxDrawerOpen, setSandboxDrawerOpen] = useState(false);
  const [activeSandboxes, setActiveSandboxes] = useState<any[]>([]);
  const [settingsModalOpen, setSettingsModalOpen] = useState(false);

  const [primaryModel, setPrimaryModel] = useState(() => loadPersisted('warp.primaryModel', 'claude'));
  const [reviewerModel, setReviewerModel] = useState(() => loadPersisted('warp.reviewerModel', 'gemini'));
  const [verifyCmd, setVerifyCmd] = useState(() => loadPersisted('warp.verifyCmd', 'npm test'));

  const { squad, startSquad, togglePause, forceHandoff, stopSquad } = useSquadOrchestrator(cwd);

  const currentTab = tabs.find((t) => t.id === activeTabId) || tabs[0];
  const activeSession =
    currentTab?.sessions.find((s) => s.id === currentTab.activeSessionId) ||
    currentTab?.sessions[0] ||
    null;

  useEffect(() => {
    localStorage.setItem('warp.sidebarOpen', JSON.stringify(sidebarOpen));
  }, [sidebarOpen]);
  useEffect(() => {
    localStorage.setItem('warp.primaryModel', JSON.stringify(primaryModel));
  }, [primaryModel]);
  useEffect(() => {
    localStorage.setItem('warp.reviewerModel', JSON.stringify(reviewerModel));
  }, [reviewerModel]);
  useEffect(() => {
    localStorage.setItem('warp.verifyCmd', JSON.stringify(verifyCmd));
  }, [verifyCmd]);

  useEffect(() => {
    if (!window.warpApi) return;

    window.warpApi.getCwd().then(setCwd);
    window.warpApi.getDoctorStatus().then(setDoctor);

    // Initial diff & branch check
    refreshGitDiff();
    refreshGitBranch();
    refreshSandboxes();

    // Periodic refresh every 5 seconds to show diff badge / branch changes as models edit files
    const diffTimer = setInterval(() => {
      refreshGitDiff();
      refreshGitBranch();
      refreshSandboxes();
    }, 5000);
    return () => clearInterval(diffTimer);
  }, []);

  const refreshSandboxes = async () => {
    if (window.warpApi?.listSandboxes) {
      try {
        const list = await window.warpApi.listSandboxes();
        setActiveSandboxes(list || []);
      } catch {}
    }
  };

  const refreshGitDiff = async () => {
    if (window.warpApi) {
      try {
        const res = await window.warpApi.getGitDiff();
        setGitDiff(res.diff || '');
        setGitFiles(res.filesChanged || []);
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

  // Launch an agent (Claude, AGY, Codex, Shell)
  const handleLaunchAgent = (type: SessionType) => {
    const id = `sess-${Date.now()}`;
    let title = 'Shell';
    let command = '';

    if (type === 'claude') {
      title = 'Claude Code';
      command = 'claude';
    } else if (type === 'agy') {
      title = 'AGY Engine';
      command = 'agy';
    } else if (type === 'codex') {
      title = 'Codex CLI';
      command = 'codex';
    }

    const newSession: TerminalSession = {
      id,
      title,
      type,
      command,
      cwd,
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
  };

  // Launch a 2-way Split Live Autonomous Squad
  const handleLaunchLiveSquad = (config: {
    goal: string;
    builder: SessionType;
    verifier: SessionType;
    verifyCmd: string;
    maxRounds: number;
  }) => {
    const newTabId = `tab-squad-${Date.now()}`;
    const builderSessionId = `sess-b-${Date.now()}`;
    const verifierSessionId = `sess-v-${Date.now()}`;

    const getCmd = (type: SessionType) => {
      if (type === 'claude') return 'claude';
      if (type === 'agy') return 'agy';
      if (type === 'codex') return 'codex';
      return '';
    };

    const builderSession: TerminalSession = {
      id: builderSessionId,
      title: `${config.builder.toUpperCase()} (Builder)`,
      type: config.builder,
      command: getCmd(config.builder),
      cwd,
      createdAt: new Date().toISOString(),
    };

    const verifierSession: TerminalSession = {
      id: verifierSessionId,
      title: `${config.verifier.toUpperCase()} (Verifier)`,
      type: config.verifier,
      command: getCmd(config.verifier),
      cwd,
      createdAt: new Date().toISOString(),
    };

    const squadTab: WorkspaceTab = {
      id: newTabId,
      title: `👥 Squad: ${config.builder} ⇄ ${config.verifier}`,
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
  const handleAddTab = () => {
    const newTabId = `tab-${Date.now()}`;
    const newSessionId = `sess-${Date.now()}`;
    const newTab: WorkspaceTab = {
      id: newTabId,
      title: `Terminal ${tabs.length + 1}`,
      layout: 'single',
      activeSessionId: newSessionId,
      sessions: [
        {
          id: newSessionId,
          title: 'Shell',
          type: 'shell',
          cwd,
          createdAt: new Date().toISOString(),
        },
      ],
    };

    setTabs((prev) => [...prev, newTab]);
    setActiveTabId(newTabId);
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

  // Pipe error to agent for Self-Correction
  const handlePipeErrorToAgent = (targetType: SessionType, errorSnippet: string) => {
    // Look for existing session of this type in current tab
    let targetSession = currentTab?.sessions.find((s) => s.type === targetType);

    if (!targetSession) {
      // Spawn new pane for this agent
      handleLaunchAgent(targetType);
      // Wait a moment for terminal to initialize before writing
      setTimeout(() => {
        const prompt = `Compiler/Test error occurred:\n${errorSnippet}\nPlease diagnose and fix this error.\r`;
        window.warpApi.writeTerminal('', prompt);
      }, 1000);
      return;
    }

    // Write into existing session
    const prompt = `Compiler/Test error occurred:\n${errorSnippet}\nPlease diagnose and fix this error.\r`;
    window.warpApi.writeTerminal(targetSession.id, prompt);
    handleSetActiveSession(targetSession.id);
  };

  // Cross-Model Adversarial Review from Git Diff
  const handleSendDiffToAgent = (targetType: SessionType) => {
    let targetSession = currentTab?.sessions.find((s) => s.type === targetType);
    const instruction = `Please review this git diff for security vulnerabilities, memory leaks, and edge cases:\n\`\`\`diff\n${gitDiff.slice(
      0,
      3000
    )}\n\`\`\`\r`;

    if (!targetSession) {
      handleLaunchAgent(targetType);
      setTimeout(() => {
        window.warpApi.writeTerminal('', instruction);
      }, 1000);
    } else {
      window.warpApi.writeTerminal(targetSession.id, instruction);
      handleSetActiveSession(targetSession.id);
    }

    setDiffOpen(false);
  };

  const handleRevertGit = async () => {
    if (window.warpApi) {
      await window.warpApi.revertGit();
      await refreshGitDiff();
    }
  };

  const handleSendInputToActive = (text: string) => {
    if (window.warpApi && activeSession) {
      window.warpApi.writeTerminal(activeSession.id, text);
    }
  };

  // Command Palette: catalog of every action a power user might reach for
  const paletteActions: CommandPaletteAction[] = useMemo(
    () => [
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
    ],
    [activeSession, tabs, activeTabId, cwd]
  );

  // Global keyboard shortcuts. Everything uses Ctrl/Cmd+Shift+<key> (VSCode/Warp
  // convention) so it never collides with shell/readline bindings like
  // Ctrl+W (delete word), Ctrl+K (kill line), or Ctrl+D (EOF) inside a pane.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
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
        case 'g':
          e.preventDefault();
          refreshGitDiff();
          setDiffOpen((v) => !v);
          break;
      }
    };

    window.addEventListener('keydown', handler, true);
    return () => window.removeEventListener('keydown', handler, true);
  }, [activeSession, activeTabId, cycleTab]);

  return (
    <div className="flex flex-col h-screen w-screen ambient-background overflow-hidden select-none font-sans text-slate-200">
      {/* Top Bar: Tabs & Quick Agent Launchers */}
      <TopBar
        tabs={tabs}
        activeTabId={activeTabId}
        onSelectTab={setActiveTabId}
        onAddTab={handleAddTab}
        onCloseTab={handleCloseTab}
        onLaunchAgent={handleLaunchAgent}
        onToggleDiff={() => {
          refreshGitDiff();
          setDiffOpen(!diffOpen);
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
      />

      {/* Main Content: Sidebar + Terminal Grid */}
      <div className="flex-1 w-full min-h-0 relative flex bg-transparent">
        {sidebarOpen && (
          <Sidebar
            pastRuns={[]}
            doctor={doctor}
            onRevertGit={handleRevertGit}
            primaryModel={primaryModel}
            setPrimaryModel={setPrimaryModel}
            reviewerModel={reviewerModel}
            setReviewerModel={setReviewerModel}
            verifyCmd={verifyCmd}
            setVerifyCmd={setVerifyCmd}
          />
        )}

        <div className="flex-1 min-w-0 min-h-0 flex flex-col">
          {/* Live Squad Status Banner (if active on current tab) */}
          {squad && squad.tabId === activeTabId && squad.active && (
            <SquadBar
              squad={squad}
              onPauseToggle={togglePause}
              onForceHandoff={forceHandoff}
              onStopSquad={stopSquad}
            />
          )}

          <div className="flex-1 min-w-0 min-h-0 flex">
            {currentTab && (
              <PaneGrid
                tab={currentTab}
                onSetActiveSession={handleSetActiveSession}
                onCloseSession={handleCloseSession}
                onSplitSession={handleSplitSession}
                onPipeErrorToAgent={handlePipeErrorToAgent}
                onResizePanes={handleResizePanes}
                onLaunchAgent={handleLaunchAgent}
              />
            )}
          </div>
        </div>

        {/* Git Diff Drawer */}
        <DiffDrawer
          isOpen={diffOpen}
          onClose={() => setDiffOpen(false)}
          diff={gitDiff}
          filesChanged={gitFiles}
          onRevert={handleRevertGit}
          onSendDiffToAgent={handleSendDiffToAgent}
        />
      </div>

      {/* Bottom Command Dock */}
      <BottomCommandDock
        activeSession={activeSession}
        onSendInput={handleSendInputToActive}
      />

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
          if (activeSession && window.warpApi?.writeTerminal) {
            window.warpApi.writeTerminal(activeSession.id, command + '\r');
          }
        }}
        onInsertIntoInput={(command) => {
          handleSendInputToActive(command);
        }}
      />

      {/* CLI Permissions & Settings Modal */}
      <SettingsModal
        isOpen={settingsModalOpen}
        onClose={() => setSettingsModalOpen(false)}
      />
    </div>
  );
};
