import React, { useState, useEffect, useMemo } from 'react';
import { Plus, FolderPlus, Brain, Trash2, Pencil, X, Terminal } from 'lucide-react';
import type {
  WorkspaceTab,
  TerminalGroup,
  SessionType,
  PastProjectConversation,
  MemoryData,
} from '../types/warp.js';
import { ProfileCard } from './ProfileCard.js';
import { useI18n } from '../i18n/index.js';
import { titleFromWork } from '../utils/workTitle.js';
import searchIcon from '../assets/sidebar/search.svg';
import plusIcon from '../assets/sidebar/plus.svg';
import sidebarToggleIcon from '../assets/sidebar/sidebar-toggle.svg';
import duoLoopIcon from '../assets/sidebar/duo-loop.svg';
import agentSwarmIcon from '../assets/sidebar/agent-swarm.svg';
import orchestratorIcon from '../assets/sidebar/orchestrator.svg';
import folderIcon from '../assets/sidebar/folder.svg';
import chevronDownIcon from '../assets/sidebar/chevron-down.svg';
import agentIcon from '../assets/sidebar/agent.svg';
import branchIcon from '../assets/sidebar/branch.svg';
import halftoneImage from '../assets/sidebar/halftone.png';

interface SidebarProps {
  isOpen: boolean;
  onClose?: () => void;
  onToggleSidebar?: () => void;
  gitBranch: string | null;
  tabs: WorkspaceTab[];
  activeTabId: string;
  onSelectTab: (tabId: string) => void;
  /** Focus one pane of a split tab. */
  onSelectPane?: (tabId: string, sessionId: string) => void;
  onCloseTab?: (tabId: string) => void;
  /** Rename a terminal tab; an empty name brings back its automatic title. */
  onRenameTab?: (tabId: string, name: string) => void;
  /** Open a new terminal, filed under `groupId` when given. */
  onNewTerminal?: (groupId?: string) => void;
  groups?: TerminalGroup[];
  /** Create an empty group and return its id (the sidebar then opens it for naming). */
  onCreateGroup?: () => string;
  onRenameGroup?: (groupId: string, name: string) => void;
  /** Remove a group; its terminals stay open, ungrouped. */
  onDeleteGroup?: (groupId: string) => void;
  /** File a terminal under a group, or take it out of its group with null. */
  onMoveTab?: (tabId: string, groupId: string | null) => void;
  onNewSession: (type?: SessionType) => void;
  onLaunchAgent?: (type: SessionType) => void;
  onOpenPalette: () => void;
  onOpenSquads: () => void;
  onOpenMesh?: () => void;
  onOpenOrchestra?: () => void;
  onOpenSkills: () => void;
  onOpenSettings: () => void;
  pastRuns?: any[];

  // Conversations & Memory
  pastConversations?: PastProjectConversation[];
  onSelectConversation?: (conv: PastProjectConversation) => void;
  projectMemory?: MemoryData | null;
  onAddMemoryRule?: (rule: string) => void;
  onRemoveMemoryRule?: (rule: string) => void;
  onAddMemoryFact?: (key: string, value: string) => void;
  onDeleteMemoryFact?: (key: string) => void;
}

/** Terminals is the default view; Memory opens from the header icon. */
type SidebarPanel = 'terminals' | 'memory';

const COLLAPSED_GROUPS_KEY = 'vulgr.collapsedGroups';
/** dataTransfer type carrying a dragged terminal's tab id. */
const TAB_DRAG_TYPE = 'application/x-vulgr-tab';

/** The sidebar is laid out at the Figma frame's 1.4× scale, then enlarged uniformly for legibility. */
const SIDEBAR_ZOOM = 1.25;

/** Design icon rendered at the sidebar's 1.4× scale of its Figma frame size. */
const DesignIcon: React.FC<{ src: string; w: number; h: number; className?: string }> = ({
  src,
  w,
  h,
  className = '',
}) => (
  <img
    src={src}
    alt=""
    draggable={false}
    className={`flex-shrink-0 ${className}`}
    style={{ width: w * 1.4, height: h * 1.4 }}
  />
);

/**
 * Terminal card: agent icon + title, branch underneath. On hover it offers rename
 * (also by double-clicking the title) and close; with `dragId` it can be dragged into a group.
 */
const SessionCard: React.FC<{
  title: string;
  meta: string;
  active?: boolean;
  untitled?: boolean;
  tooltip?: string;
  onClick: () => void;
  onClose?: () => void;
  closeLabel?: string;
  /** Called with the new name; an empty string returns the card to its automatic title. */
  onRename?: (name: string) => void;
  renameLabel?: string;
  /** Tab id put on the drag payload; the card is draggable only when set. */
  dragId?: string;
  /** Rows shown inside the card under its title (the panes of a split tab). */
  children?: React.ReactNode;
}> = ({ title, meta, active = false, untitled = false, tooltip, onClick, onClose, closeLabel, onRename, renameLabel, dragId, children }) => {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');

  const startEditing = () => {
    if (!onRename) return;
    setDraft(untitled ? '' : title);
    setEditing(true);
  };
  const commit = () => {
    setEditing(false);
    if (draft.trim() !== (untitled ? '' : title)) onRename?.(draft.trim());
  };

  const titleClass = `text-[9px] leading-none ${active ? 'text-zinc-100' : 'text-zinc-500'}`;

  return (
    <div
      className="group/card relative"
      draggable={!!dragId && !editing}
      onDragStart={(e) => {
        if (!dragId) return;
        e.dataTransfer.setData(TAB_DRAG_TYPE, dragId);
        e.dataTransfer.effectAllowed = 'move';
      }}
    >
      <div
        className={`rounded-[7px] bg-base-elevated border transition-colors ${
          active || editing ? 'border-zinc-600' : 'border-zinc-800 hover:border-zinc-700'
        }`}
      >
        <div
          role="button"
          tabIndex={0}
          onClick={() => !editing && onClick()}
          onKeyDown={(e) => !editing && e.key === 'Enter' && onClick()}
          title={editing ? undefined : tooltip}
          className={`w-full h-[38px] flex flex-col justify-center gap-[3px] pl-[12px] ${
            onClose || onRename ? 'pr-10' : 'pr-2'
          } text-left cursor-pointer`}
        >
          <div className="flex items-center gap-[5px] min-w-0">
            <DesignIcon src={agentIcon} w={5} h={6} />
            {editing ? (
              <input
                autoFocus
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onFocus={(e) => e.target.select()}
                onBlur={commit}
                onClick={(e) => e.stopPropagation()}
                onKeyDown={(e) => {
                  e.stopPropagation();
                  if (e.key === 'Enter') commit();
                  if (e.key === 'Escape') setEditing(false);
                }}
                className={`${titleClass} flex-1 min-w-0 bg-transparent outline-none text-zinc-100`}
              />
            ) : (
              <span
                onDoubleClick={(e) => {
                  e.stopPropagation();
                  startEditing();
                }}
                className={`${titleClass} truncate ${untitled ? 'italic' : ''}`}
              >
                {title}
              </span>
            )}
          </div>
          <div className="flex items-center gap-[4px] pl-[12px] min-w-0">
            <DesignIcon src={branchIcon} w={3} h={3} />
            <span className="truncate text-[7px] leading-none text-zinc-500">{meta}</span>
          </div>
        </div>
        {children && <div className="px-[5px] pb-[5px] space-y-[2px]">{children}</div>}
      </div>
      {!editing && (onRename || onClose) && (
        <div className="absolute top-[19px] -translate-y-1/2 right-1.5 flex items-center opacity-0 group-hover/card:opacity-100 transition-opacity">
          {onRename && (
            <button
              onClick={startEditing}
              className="p-0.5 rounded text-zinc-600 hover:text-zinc-100 hover:bg-white/5"
              title={renameLabel}
            >
              <Pencil size={9} />
            </button>
          )}
          {onClose && (
            <button
              onClick={onClose}
              className="p-0.5 rounded text-zinc-600 hover:text-zinc-100 hover:bg-white/5"
              title={closeLabel}
            >
              <X size={10} />
            </button>
          )}
        </div>
      )}
    </div>
  );
};

/** One pane of a split tab, listed inside the tab's card. */
const PaneRow: React.FC<{
  title: string;
  untitled: boolean;
  meta: string;
  active: boolean;
  onClick: () => void;
}> = ({ title, untitled, meta, active, onClick }) => (
  <button
    onClick={(e) => {
      e.stopPropagation();
      onClick();
    }}
    className={`w-full h-[28px] flex items-center gap-[7px] px-[7px] rounded-[5px] text-left transition-colors ${
      active ? 'bg-white/[0.07]' : 'hover:bg-white/[0.04]'
    }`}
  >
    <span className="w-[15px] h-[15px] rounded-full bg-base-app border border-zinc-800 flex items-center justify-center flex-shrink-0 text-zinc-500">
      <Terminal size={7} />
    </span>
    <span className="min-w-0 flex-1 flex flex-col gap-[2px]">
      <span className={`truncate text-[8px] leading-none ${active ? 'text-zinc-100' : 'text-zinc-400'} ${untitled ? 'italic' : ''}`}>
        {title}
      </span>
      <span className="flex items-center gap-[3px] min-w-0">
        <DesignIcon src={branchIcon} w={3} h={3} />
        <span className="truncate text-[6.5px] leading-none text-zinc-500">{meta}</span>
      </span>
    </span>
  </button>
);

export const Sidebar: React.FC<SidebarProps> = ({
  isOpen,
  onToggleSidebar,
  gitBranch,
  tabs,
  activeTabId,
  onSelectTab,
  onSelectPane,
  onCloseTab,
  onRenameTab,
  onNewTerminal,
  groups = [],
  onCreateGroup,
  onRenameGroup,
  onDeleteGroup,
  onMoveTab,
  onNewSession,
  onOpenSquads,
  onOpenMesh,
  onOpenOrchestra,
  onOpenSettings,
  pastConversations = [],
  onSelectConversation,
  projectMemory,
  onAddMemoryRule,
  onRemoveMemoryRule,
  onAddMemoryFact,
  onDeleteMemoryFact,
}) => {
  const { t } = useI18n();
  const typeLabel = t.common.sessionType;
  const [panel, setPanel] = useState<SidebarPanel>('terminals');
  // Folded groups are remembered between launches; every group starts open.
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(COLLAPSED_GROUPS_KEY) || '[]');
      return new Set(Array.isArray(saved) ? saved : []);
    } catch {
      return new Set();
    }
  });
  const [renamingGroupId, setRenamingGroupId] = useState<string | null>(null);
  const [groupDraft, setGroupDraft] = useState('');
  // Drop target under the pointer while a terminal is dragged: a group id, or '' for "ungrouped".
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const [newMenuOpen, setNewMenuOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [newRuleInput, setNewRuleInput] = useState('');
  const [newFactKey, setNewFactKey] = useState('');
  const [newFactVal, setNewFactVal] = useState('');
  const [addingFact, setAddingFact] = useState(false);

  useEffect(() => {
    if (!newMenuOpen) return;
    const handleOutside = () => setNewMenuOpen(false);
    window.addEventListener('click', handleOutside);
    return () => window.removeEventListener('click', handleOutside);
  }, [newMenuOpen]);

  const toggleGroup = (groupId: string) =>
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(groupId)) next.delete(groupId);
      else next.add(groupId);
      try {
        localStorage.setItem(COLLAPSED_GROUPS_KEY, JSON.stringify([...next]));
      } catch {}
      return next;
    });

  const startRenamingGroup = (group: TerminalGroup) => {
    setGroupDraft(group.name);
    setRenamingGroupId(group.id);
  };

  const commitGroupName = () => {
    if (renamingGroupId && groupDraft.trim()) onRenameGroup?.(renamingGroupId, groupDraft.trim());
    setRenamingGroupId(null);
  };

  const handleCreateGroup = () => {
    const id = onCreateGroup?.();
    if (!id) return;
    setPanel('terminals');
    setGroupDraft(t.sidebar.newGroupName);
    setRenamingGroupId(id);
  };

  // Drop-zone handlers for a group (id) or the ungrouped list ('').
  const dropZone = (target: string) => ({
    onDragOver: (e: React.DragEvent) => {
      if (!e.dataTransfer.types.includes(TAB_DRAG_TYPE)) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      if (dropTarget !== target) setDropTarget(target);
    },
    onDragLeave: (e: React.DragEvent) => {
      if (!e.currentTarget.contains(e.relatedTarget as Node)) setDropTarget(null);
    },
    onDrop: (e: React.DragEvent) => {
      const tabId = e.dataTransfer.getData(TAB_DRAG_TYPE);
      setDropTarget(null);
      if (tabId) onMoveTab?.(tabId, target || null);
    },
  });

  const filteredTabs = useMemo(() => {
    if (!searchQuery.trim()) return tabs;
    const q = searchQuery.toLowerCase();
    return tabs.filter((tab) => tab.title.toLowerCase().includes(q));
  }, [tabs, searchQuery]);

  const filteredPastConversations = useMemo(() => {
    if (!searchQuery.trim()) return pastConversations;
    const q = searchQuery.toLowerCase();
    return pastConversations.filter(
      (c) =>
        c.title?.toLowerCase().includes(q) ||
        c.prompt?.toLowerCase().includes(q) ||
        c.summary?.toLowerCase().includes(q) ||
        c.agent?.toLowerCase().includes(q)
    );
  }, [pastConversations, searchQuery]);

  const handleAddRule = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!newRuleInput.trim() || !onAddMemoryRule) return;
    onAddMemoryRule(newRuleInput.trim());
    setNewRuleInput('');
  };

  const handleAddFact = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!newFactKey.trim() || !newFactVal.trim() || !onAddMemoryFact) return;
    onAddMemoryFact(newFactKey.trim(), newFactVal.trim());
    setNewFactKey('');
    setNewFactVal('');
    setAddingFact(false);
  };

  const togglePanel = (next: SidebarPanel) => setPanel((p) => (p === next ? 'terminals' : next));

  if (!isOpen) return null;

  const renderTabCard = (tab: WorkspaceTab) => {
    const type = tab.sessions[0]?.type || 'shell';
    const split = tab.sessions.length > 1;
    return (
      <SessionCard
        key={tab.id}
        dragId={onMoveTab ? tab.id : undefined}
        title={tab.title || t.sidebar.untitled}
        untitled={!tab.title}
        meta={
          split
            ? [gitBranch, t.sidebar.panes(tab.sessions.length)].filter(Boolean).join(' · ')
            : gitBranch || typeLabel[type]
        }
        active={tab.id === activeTabId}
        tooltip={`${typeLabel[type]}${tab.sessions.length > 1 ? ` · ${t.sidebar.panes(tab.sessions.length)}` : ''}`}
        onClick={() => onSelectTab(tab.id)}
        onClose={tabs.length > 1 && onCloseTab ? () => onCloseTab(tab.id) : undefined}
        closeLabel={t.sidebar.closeTerminal}
        onRename={onRenameTab ? (name) => onRenameTab(tab.id, name) : undefined}
        renameLabel={t.sidebar.renameTerminal}
      >
        {split &&
          tab.sessions.map((session) => (
            <PaneRow
              key={session.id}
              title={session.workLog?.length ? titleFromWork(session.workLog) : t.sidebar.untitled}
              untitled={!session.workLog?.length}
              meta={gitBranch || typeLabel[session.type]}
              active={tab.id === activeTabId && session.id === tab.activeSessionId}
              onClick={() => (onSelectPane ? onSelectPane(tab.id, session.id) : onSelectTab(tab.id))}
            />
          ))}
      </SessionCard>
    );
  };

  /** Back to the terminal list and the active tab, or a first terminal when there is none. */
  const openWorkspace = () => {
    setPanel('terminals');
    if (tabs.length === 0) onNewTerminal?.();
    else onSelectTab(tabs.some((tab) => tab.id === activeTabId) ? activeTabId : tabs[0].id);
  };

  const modes = [
    { label: 'Duo Loop', icon: duoLoopIcon, w: 7, h: 5.47, onClick: onOpenSquads, title: t.sidebar.duoLoopHint },
    { label: 'Agent Swarm', icon: agentSwarmIcon, w: 7, h: 8, onClick: onOpenMesh, title: t.sidebar.agentSwarmHint },
    { label: 'Orchestrator', icon: orchestratorIcon, w: 7, h: 8, onClick: onOpenOrchestra ?? openWorkspace, title: t.sidebar.orchestratorHint },
  ];

  return (
    <div
      style={{ zoom: SIDEBAR_ZOOM }}
      className="relative w-64 bg-base-app border-r border-zinc-900 flex flex-col h-full select-none font-['Geist_Mono',ui-monospace,monospace] text-zinc-100 z-20 flex-shrink-0 animate-slide-in-left overflow-hidden">
      {/* Halftone artwork behind the profile card; its gray dots are lightened on the dark theme. */}
      <img
        src={halftoneImage}
        alt=""
        draggable={false}
        className="absolute left-[3px] bottom-0 w-full h-[188px] object-cover object-bottom brightness-[2.6] [.light_&]:brightness-100 pointer-events-none"
      />

      {/* Search + New / Toggle bar */}
      <div className="relative flex h-[21px] flex-shrink-0 bg-base-elevated border-b border-zinc-800">
        <label className="flex-1 min-w-0 flex items-center gap-[7px] pl-[10px] pr-2 border-r border-zinc-800 cursor-text">
          <DesignIcon src={searchIcon} w={7} h={7} />
          <input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={t.sidebar.search}
            className="flex-1 min-w-0 bg-transparent text-[9px] text-zinc-100 placeholder:text-zinc-600 outline-none"
          />
        </label>

        <div className="w-[60px] flex items-center justify-end gap-[19px] pr-[0px]">
          <div className="relative flex" onClick={(e) => e.stopPropagation()}>
            <button
              onClick={() => setNewMenuOpen(!newMenuOpen)}
              className="p-0.5 rounded hover:bg-white/5 transition-colors"
              title={t.sidebar.newSession}
            >
              <DesignIcon src={plusIcon} w={7} h={7} className="-scale-x-100" />
            </button>

            {newMenuOpen && (
              <div className="absolute right-0 top-full mt-1.5 w-52 rounded-[12px] bg-base-elevated border border-zinc-800 shadow-lg p-1.5 z-50 text-[10px] animate-slide-in-up">
                <div className="px-2 py-1 text-[8px] text-zinc-500 uppercase tracking-wider">{t.sidebar.launchAgent}</div>
                {(['shell', 'claude', 'codex', 'agy', 'opencode', 'cursor'] as SessionType[]).map((type) => (
                  <button
                    key={type}
                    onClick={() => {
                      onNewSession(type);
                      setNewMenuOpen(false);
                    }}
                    className="w-full flex items-center gap-2 px-2 py-1.5 rounded-[7px] text-zinc-100 hover:bg-white/5 text-left transition-colors"
                  >
                    <DesignIcon src={agentIcon} w={5} h={6} />
                    <span>{typeLabel[type]}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          <button
            onClick={onToggleSidebar}
            className="p-0.5 rounded hover:bg-white/5 transition-colors"
            title={t.sidebar.hideSidebar}
          >
            <DesignIcon src={sidebarToggleIcon} w={8} h={7} className="-scale-x-100" />
          </button>
        </div>
      </div>

      {/* Scrollable content */}
      <div className="relative flex-1 min-h-0 overflow-y-auto pb-3">
        {/* Modes */}
        <div className="px-[7px] pt-[10px] space-y-[3px]">
          {modes.map((m) => (
            <button
              key={m.label}
              onClick={m.onClick}
              title={m.title}
              className="w-full h-[21px] flex items-center gap-[7px] pl-[10px] rounded-[7px] border border-transparent text-left transition-colors hover:bg-base-elevated hover:border-zinc-800"
            >
              <span className="w-[10px] flex justify-center">
                <DesignIcon src={m.icon} w={m.w} h={m.h} />
              </span>
              <span className="text-[10px] text-zinc-300">{m.label}</span>
            </button>
          ))}
        </div>

        {/* Actions row: new terminal, new group, memory (no heading over the terminal list) */}
        <div className="flex items-center justify-between pl-[17px] pr-[10px] mt-[12px] mb-[6px] min-h-[14px]">
          <span className="text-[9px] text-zinc-300">{panel === 'memory' ? t.sidebar.memory : ''}</span>
          <div className="flex items-center gap-0.5">
            {panel === 'terminals' && (
              <>
                <button
                  onClick={() => onNewTerminal?.()}
                  className="p-0.5 rounded text-zinc-500 hover:text-zinc-100 hover:bg-base-elevated transition-colors"
                  title={t.sidebar.newTerminal}
                >
                  <Plus size={10} />
                </button>
                <button
                  onClick={handleCreateGroup}
                  className="p-0.5 rounded text-zinc-500 hover:text-zinc-100 hover:bg-base-elevated transition-colors"
                  title={t.sidebar.newGroup}
                >
                  <FolderPlus size={10} />
                </button>
              </>
            )}
            <button
              onClick={() => togglePanel('memory')}
              className={`p-0.5 rounded transition-colors ${
                panel === 'memory' ? 'bg-base-elevated text-zinc-100' : 'text-zinc-500 hover:text-zinc-100 hover:bg-base-elevated'
              }`}
              title={t.sidebar.memoryHint}
            >
              <Brain size={10} />
            </button>
          </div>
        </div>

        {/* ==================== TERMINALS & GROUPS ==================== */}
        {panel === 'terminals' && (
          <div className="pl-[17px] pr-[10px] space-y-[10px]">
            {/* Ungrouped terminals (also the drop zone that takes a terminal out of its group) */}
            <div
              {...dropZone('')}
              className={`space-y-[7px] rounded-[9px] transition-colors ${
                dropTarget === '' ? 'bg-white/5 outline outline-1 outline-dashed outline-zinc-700' : ''
              }`}
            >
              {filteredTabs
                .filter((tab) => !tab.groupId || !groups.some((g) => g.id === tab.groupId))
                .map((tab) => renderTabCard(tab))}

              {filteredPastConversations.map((conv) => (
                <SessionCard
                  key={conv.id}
                  title={conv.title || conv.prompt || conv.agent}
                  meta={`${gitBranch ? `${gitBranch} · ` : ''}${new Date(conv.timestamp).toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}`}
                  tooltip={conv.prompt || conv.summary}
                  onClick={() => onSelectConversation?.(conv)}
                />
              ))}

              {tabs.length === 0 && (
                <button
                  onClick={() => onNewTerminal?.()}
                  className="w-full h-[30px] flex items-center justify-center gap-1.5 rounded-[7px] border border-dashed border-zinc-800 text-[8px] text-zinc-500 hover:text-zinc-100 hover:border-zinc-700 transition-colors"
                >
                  <Plus size={10} />
                  {t.sidebar.newTerminal}
                </button>
              )}
              {searchQuery.trim() && filteredTabs.length === 0 && filteredPastConversations.length === 0 && (
                <div className="py-1 text-[8px] text-zinc-600">{t.sidebar.noMatchingSessions}</div>
              )}
            </div>

            {/* Groups */}
            {groups.map((group) => {
              const groupTabs = filteredTabs.filter((tab) => tab.groupId === group.id);
              if (searchQuery.trim() && groupTabs.length === 0) return null;
              // While searching, groups with matches are shown open.
              const open = searchQuery.trim() ? true : !collapsedGroups.has(group.id);
              const renaming = renamingGroupId === group.id;
              return (
                <div
                  key={group.id}
                  {...dropZone(group.id)}
                  className={`rounded-[9px] transition-colors ${
                    dropTarget === group.id ? 'bg-white/5 outline outline-1 outline-dashed outline-zinc-700' : ''
                  }`}
                >
                  <div className="group/folder flex items-center gap-1 h-[30px] pl-[6px] pr-[4px] rounded-[7px] hover:bg-base-elevated transition-colors">
                    <button
                      onClick={() => !renaming && toggleGroup(group.id)}
                      onDoubleClick={() => startRenamingGroup(group)}
                      className="flex items-center gap-[8px] min-w-0 flex-1 text-left"
                    >
                      {/* Folder tile marks a group apart from terminal cards */}
                      <span className="w-[19px] h-[19px] rounded-[5px] bg-base-elevated border border-zinc-800 flex items-center justify-center flex-shrink-0">
                        <DesignIcon src={folderIcon} w={7} h={6.13} />
                      </span>
                      {renaming ? (
                        <input
                          autoFocus
                          value={groupDraft}
                          onChange={(e) => setGroupDraft(e.target.value)}
                          onFocus={(e) => e.target.select()}
                          onBlur={commitGroupName}
                          onClick={(e) => e.stopPropagation()}
                          onKeyDown={(e) => {
                            e.stopPropagation();
                            if (e.key === 'Enter') commitGroupName();
                            if (e.key === 'Escape') setRenamingGroupId(null);
                          }}
                          className="flex-1 min-w-0 bg-transparent outline-none text-[9px] text-zinc-100 border-b border-zinc-600"
                        />
                      ) : (
                        <>
                          <span className="min-w-0 flex flex-col gap-[3px]">
                            <span className="truncate text-[9px] leading-none text-zinc-100">{group.name}</span>
                            <span className="text-[7px] leading-none text-zinc-500">
                              {t.sidebar.groupCount(groupTabs.length)}
                            </span>
                          </span>
                          <DesignIcon
                            src={chevronDownIcon}
                            w={4}
                            h={2}
                            className={`flex-shrink-0 transition-transform ${open ? '' : '-rotate-90'}`}
                          />
                        </>
                      )}
                    </button>
                    {!renaming && (
                      <div className="flex items-center flex-shrink-0">
                        <button
                          onClick={() => onNewTerminal?.(group.id)}
                          className="p-0.5 rounded text-zinc-500 hover:text-zinc-100 hover:bg-base-elevated"
                          title={t.sidebar.newTerminalInGroup}
                        >
                          <Plus size={10} />
                        </button>
                        <div className="flex items-center opacity-0 group-hover/folder:opacity-100 transition-opacity">
                          <button
                            onClick={() => startRenamingGroup(group)}
                            className="p-0.5 rounded text-zinc-500 hover:text-zinc-100 hover:bg-base-elevated"
                            title={t.sidebar.renameGroup}
                          >
                            <Pencil size={9} />
                          </button>
                          <button
                            onClick={() => onDeleteGroup?.(group.id)}
                            className="p-0.5 rounded text-zinc-500 hover:text-red-400 hover:bg-base-elevated"
                            title={t.sidebar.deleteGroup}
                          >
                            <Trash2 size={9} />
                          </button>
                        </div>
                      </div>
                    )}
                  </div>

                  <div
                    inert={!open}
                    className={`grid transition-[grid-template-rows,opacity] duration-300 ease-in-out ${
                      open ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'
                    }`}
                  >
                    <div className="min-h-0 overflow-hidden">
                      {/* The rail ties the terminals to their group. */}
                      <div className="ml-[15px] pl-[9px] border-l border-zinc-800 pt-[7px] space-y-[7px]">
                        {groupTabs.map((tab) => renderTabCard(tab))}
                        {groupTabs.length === 0 && (
                          <button
                            onClick={() => onNewTerminal?.(group.id)}
                            className="w-full h-[30px] flex items-center justify-center gap-1.5 rounded-[7px] border border-dashed border-zinc-800 text-[8px] text-zinc-500 hover:text-zinc-100 hover:border-zinc-700 transition-colors"
                          >
                            <Plus size={10} />
                            {t.sidebar.emptyGroup}
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* ==================== PROJECT MEMORY ==================== */}
        {panel === 'memory' && (
          <div className="px-[10px] space-y-4 text-[9px]">
            <p className="text-zinc-500 leading-relaxed">
              {t.sidebar.memoryIntro}
            </p>

            {/* Rules */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-[8px] uppercase tracking-wider text-zinc-500">
                <span>{t.sidebar.rules}</span>
                <span>{projectMemory?.rules?.length || 0}</span>
              </div>

              <form onSubmit={handleAddRule} className="flex gap-1.5">
                <input
                  type="text"
                  value={newRuleInput}
                  onChange={(e) => setNewRuleInput(e.target.value)}
                  placeholder={t.sidebar.rulePlaceholder}
                  className="flex-1 min-w-0 bg-base-elevated border border-zinc-800 rounded-[5px] px-2 py-1 text-zinc-100 placeholder:text-zinc-600 outline-none focus:border-zinc-600"
                />
                <button
                  type="submit"
                  disabled={!newRuleInput.trim()}
                  className="px-2 py-1 rounded-[5px] bg-base-elevated border border-zinc-800 text-zinc-100 hover:border-zinc-600 transition-colors disabled:opacity-40 flex-shrink-0"
                  title={t.sidebar.addRule}
                >
                  <Plus size={11} />
                </button>
              </form>

              <div className="space-y-1">
                {projectMemory?.rules && projectMemory.rules.length > 0 ? (
                  projectMemory.rules.map((rule, idx) => (
                    <div
                      key={idx}
                      className="flex items-start justify-between gap-1.5 p-2 rounded-[7px] bg-base-elevated border border-zinc-800 text-zinc-300 group"
                    >
                      <span className="flex-1 leading-relaxed">{rule}</span>
                      <button
                        onClick={() => onRemoveMemoryRule?.(rule)}
                        className="opacity-0 group-hover:opacity-100 p-0.5 rounded text-zinc-600 hover:text-red-400 transition-all flex-shrink-0"
                        title={t.sidebar.deleteRule}
                      >
                        <Trash2 size={10} />
                      </button>
                    </div>
                  ))
                ) : (
                  <div className="py-2 text-center text-zinc-600">
                    {t.sidebar.noRules}
                  </div>
                )}
              </div>
            </div>

            {/* Facts */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-[8px] uppercase tracking-wider text-zinc-500">
                <span>{t.sidebar.facts}</span>
                <button
                  onClick={() => setAddingFact(!addingFact)}
                  className="text-zinc-500 hover:text-zinc-100"
                  title={t.sidebar.addFact}
                >
                  <Plus size={10} />
                </button>
              </div>

              {addingFact && (
                <form onSubmit={handleAddFact} className="p-2 rounded-[7px] bg-base-elevated border border-zinc-800 space-y-1.5">
                  <input
                    type="text"
                    value={newFactKey}
                    onChange={(e) => setNewFactKey(e.target.value)}
                    placeholder={t.sidebar.factKey}
                    className="w-full bg-zinc-900 border border-zinc-800 rounded-[5px] px-2 py-1 text-zinc-100 placeholder:text-zinc-600 outline-none"
                  />
                  <input
                    type="text"
                    value={newFactVal}
                    onChange={(e) => setNewFactVal(e.target.value)}
                    placeholder={t.sidebar.factValue}
                    className="w-full bg-zinc-900 border border-zinc-800 rounded-[5px] px-2 py-1 text-zinc-100 placeholder:text-zinc-600 outline-none"
                  />
                  <div className="flex justify-end gap-1.5 pt-1">
                    <button
                      type="button"
                      onClick={() => setAddingFact(false)}
                      className="px-2 py-0.5 rounded text-zinc-500 hover:text-zinc-100"
                    >
                      {t.sidebar.cancel}
                    </button>
                    <button
                      type="submit"
                      disabled={!newFactKey.trim() || !newFactVal.trim()}
                      className="px-2 py-0.5 rounded-[5px] bg-zinc-100 text-zinc-900 disabled:opacity-40"
                    >
                      {t.sidebar.save}
                    </button>
                  </div>
                </form>
              )}

              <div className="space-y-1">
                {projectMemory?.facts && Object.keys(projectMemory.facts).length > 0 ? (
                  Object.entries(projectMemory.facts).map(([key, fact]) => (
                    <div
                      key={key}
                      className="flex items-center justify-between gap-1.5 px-2 py-1.5 rounded-[7px] bg-base-elevated border border-zinc-800 group"
                    >
                      <div className="min-w-0 flex-1">
                        <span className="text-zinc-500">{key}: </span>
                        <span className="text-zinc-100">{fact.value}</span>
                      </div>
                      <button
                        onClick={() => onDeleteMemoryFact?.(key)}
                        className="opacity-0 group-hover:opacity-100 p-0.5 rounded text-zinc-600 hover:text-red-400 transition-all flex-shrink-0"
                        title={t.sidebar.deleteFact}
                      >
                        <Trash2 size={10} />
                      </button>
                    </div>
                  ))
                ) : (
                  <div className="py-2 text-center text-zinc-600">{t.sidebar.noFacts}</div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      <ProfileCard onOpenSettings={onOpenSettings} />
    </div>
  );
};
