import React, { useState, useEffect, useMemo } from 'react';
import {
  Plus,
  Search,
  Terminal,
  Sparkles,
  Shield,
  Bot,
  Settings,
  Clock,
  Folder,
  FolderOpen,
  FolderPlus,
  File,
  FileCode,
  FileText,
  ChevronRight,
  ChevronDown,
  RefreshCw,
  Brain,
  Trash2,
  Copy,
  Check,
  History,
  MessageSquare,
  Layers,
  Code2,
} from 'lucide-react';
import type {
  WorkspaceTab,
  SessionType,
  ProjectFileItem,
  PastProjectConversation,
  MemoryData,
} from '../types/warp.js';

interface SidebarProps {
  isOpen: boolean;
  onClose?: () => void;
  onToggleSidebar?: () => void;
  cwd: string;
  gitBranch: string | null;
  tabs: WorkspaceTab[];
  activeTabId: string;
  onSelectTab: (tabId: string) => void;
  onNewSession: (type?: SessionType) => void;
  onLaunchAgent?: (type: SessionType) => void;
  onOpenPalette: () => void;
  onOpenSquads: () => void;
  onOpenSkills: () => void;
  onOpenSettings: () => void;
  pastRuns?: any[];

  // Project workspace
  recentProjects?: string[];
  onOpenProjectFolder?: () => void;
  onSelectRecentProject?: (path: string) => void;
  projectFiles?: ProjectFileItem[];
  onRefreshFiles?: () => void;
  onFileSelect?: (file: ProjectFileItem) => void;
  onInsertFilePath?: (filePath: string) => void;

  // Conversations & Memory
  pastConversations?: PastProjectConversation[];
  onSelectConversation?: (conv: PastProjectConversation) => void;
  projectMemory?: MemoryData | null;
  onAddMemoryRule?: (rule: string) => void;
  onRemoveMemoryRule?: (rule: string) => void;
  onAddMemoryFact?: (key: string, value: string) => void;
  onDeleteMemoryFact?: (key: string) => void;
}

type SidebarTab = 'sessions' | 'files' | 'memory';

const typeMeta: Record<SessionType, { icon: React.ReactNode; chip: string; label: string }> = {
  claude: { icon: <Sparkles size={11} className="text-white" />, chip: 'bg-orange-600/90', label: 'Claude Code' },
  agy: { icon: <Shield size={11} className="text-white" />, chip: 'bg-blue-600/90', label: 'AGY Engine' },
  codex: { icon: <Bot size={11} className="text-white" />, chip: 'bg-emerald-600/90', label: 'Codex CLI' },
  shell: { icon: <Terminal size={11} className="text-white" />, chip: 'bg-zinc-600', label: 'Terminal' },
};

function getFileIcon(name: string, isDirectory: boolean) {
  if (isDirectory) return <Folder size={12} className="text-amber-400 flex-shrink-0" />;
  const ext = name.split('.').pop()?.toLowerCase();
  if (['ts', 'tsx', 'js', 'jsx', 'mjs', 'cjs'].includes(ext || '')) {
    return <FileCode size={12} className="text-sky-400 flex-shrink-0" />;
  }
  if (['json', 'yaml', 'yml', 'toml'].includes(ext || '')) {
    return <Code2 size={12} className="text-emerald-400 flex-shrink-0" />;
  }
  if (['md', 'txt', 'log'].includes(ext || '')) {
    return <FileText size={12} className="text-zinc-400 flex-shrink-0" />;
  }
  return <File size={12} className="text-zinc-400 flex-shrink-0" />;
}

// Recursive Tree Node Component
const FileNode: React.FC<{
  item: ProjectFileItem;
  depth: number;
  onFileSelect?: (item: ProjectFileItem) => void;
  onInsertFilePath?: (path: string) => void;
}> = ({ item, depth, onFileSelect, onInsertFilePath }) => {
  const [expanded, setExpanded] = useState(depth < 1);
  const [copied, setCopied] = useState(false);

  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(item.relativePath || item.path);
    setCopied(true);
    setTimeout(() => setCopied(false), 1200);
  };

  const handleInsert = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (onInsertFilePath) {
      onInsertFilePath(item.relativePath || item.name);
    }
  };

  if (item.isDirectory) {
    return (
      <div className="select-none font-mono text-[11px]">
        <div
          onClick={() => setExpanded(!expanded)}
          style={{ paddingLeft: `${depth * 12 + 6}px` }}
          className="flex items-center gap-1.5 py-1 px-1.5 rounded hover:bg-zinc-900/70 cursor-pointer text-zinc-300 hover:text-zinc-100 transition-colors group"
        >
          {expanded ? (
            <ChevronDown size={11} className="text-zinc-500 group-hover:text-zinc-300 flex-shrink-0" />
          ) : (
            <ChevronRight size={11} className="text-zinc-500 group-hover:text-zinc-300 flex-shrink-0" />
          )}
          {expanded ? (
            <FolderOpen size={12} className="text-amber-400 flex-shrink-0" />
          ) : (
            <Folder size={12} className="text-amber-400 flex-shrink-0" />
          )}
          <span className="truncate flex-1 font-medium">{item.name}</span>
        </div>
        {expanded && item.children && item.children.length > 0 && (
          <div>
            {item.children.map((child) => (
              <FileNode
                key={child.path}
                item={child}
                depth={depth + 1}
                onFileSelect={onFileSelect}
                onInsertFilePath={onInsertFilePath}
              />
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div
      onClick={() => onFileSelect?.(item)}
      style={{ paddingLeft: `${depth * 12 + 20}px` }}
      className="flex items-center gap-1.5 py-1 px-1.5 rounded hover:bg-zinc-900/70 cursor-pointer text-zinc-400 hover:text-zinc-200 transition-colors group font-mono text-[11px]"
      title={`${item.relativePath || item.name} (${item.size ? Math.round(item.size / 1024) + ' KB' : ''})`}
    >
      {getFileIcon(item.name, false)}
      <span className="truncate flex-1">{item.name}</span>

      <div className="hidden group-hover:flex items-center gap-1 flex-shrink-0">
        <button
          onClick={handleCopy}
          className="p-0.5 rounded text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800 transition-colors"
          title="Göreli yolu kopyala"
        >
          {copied ? <Check size={10} className="text-emerald-400" /> : <Copy size={10} />}
        </button>
        {onInsertFilePath && (
          <button
            onClick={handleInsert}
            className="p-0.5 rounded text-zinc-500 hover:text-sky-300 hover:bg-zinc-800 transition-colors"
            title="Yolu komut kutusuna ekle"
          >
            <Plus size={10} />
          </button>
        )}
      </div>
    </div>
  );
};

export const Sidebar: React.FC<SidebarProps> = ({
  isOpen,
  cwd,
  tabs,
  activeTabId,
  onSelectTab,
  onNewSession,
  onOpenSettings,
  recentProjects = [],
  onOpenProjectFolder,
  onSelectRecentProject,
  projectFiles = [],
  onRefreshFiles,
  onFileSelect,
  onInsertFilePath,
  pastConversations = [],
  onSelectConversation,
  projectMemory,
  onAddMemoryRule,
  onRemoveMemoryRule,
  onAddMemoryFact,
  onDeleteMemoryFact,
}) => {
  const [activeSidebarTab, setActiveSidebarTab] = useState<SidebarTab>('sessions');
  const [newMenuOpen, setNewMenuOpen] = useState(false);
  const [recentMenuOpen, setRecentMenuOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [newRuleInput, setNewRuleInput] = useState('');
  const [newFactKey, setNewFactKey] = useState('');
  const [newFactVal, setNewFactVal] = useState('');
  const [addingFact, setAddingFact] = useState(false);

  useEffect(() => {
    const handleOutside = () => {
      setNewMenuOpen(false);
      setRecentMenuOpen(false);
    };
    if (newMenuOpen || recentMenuOpen) {
      window.addEventListener('click', handleOutside);
      return () => window.removeEventListener('click', handleOutside);
    }
  }, [newMenuOpen, recentMenuOpen]);

  const projectName = useMemo(() => {
    if (!cwd) return 'No Project';
    const parts = cwd.split(/[\\/]/).filter(Boolean);
    return parts[parts.length - 1] || cwd;
  }, [cwd]);

  const filteredTabs = useMemo(() => {
    if (!searchQuery.trim()) return tabs;
    const q = searchQuery.toLowerCase();
    return tabs.filter((t) => t.title.toLowerCase().includes(q));
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

  if (!isOpen) return null;

  return (
    <div className="w-64 bg-base-app border-r border-zinc-900 flex flex-col h-full select-none text-xs text-zinc-300 z-20 flex-shrink-0 animate-slide-in-left">
      {/* Project Switcher Bar */}
      <div className="p-2 border-b border-zinc-900 flex items-center justify-between gap-1 flex-shrink-0 bg-zinc-950/60">
        <div
          className="relative flex-1 min-w-0"
          onClick={(e) => e.stopPropagation()}
        >
          <button
            onClick={() => setRecentMenuOpen(!recentMenuOpen)}
            className="w-full flex items-center gap-1.5 px-2 py-1 rounded-md hover:bg-zinc-900 text-left transition-colors group min-w-0"
            title={`Active Project: ${cwd || 'Not selected'}`}
          >
            <Folder size={13} className="text-amber-400 flex-shrink-0" />
            <div className="min-w-0 flex-1">
              <div className="text-[11px] font-semibold text-zinc-100 truncate leading-tight group-hover:text-white">
                {projectName}
              </div>
              <div className="text-[9px] text-zinc-500 font-mono truncate leading-none">
                {cwd || 'Click to select project'}
              </div>
            </div>
            <ChevronDown size={11} className="text-zinc-500 group-hover:text-zinc-300 flex-shrink-0" />
          </button>

          {/* Recent Projects Dropdown */}
          {recentMenuOpen && (
            <div className="absolute left-0 mt-1 w-64 rounded-xl bg-base-elevated border border-zinc-800 shadow-2xl p-1.5 z-50 text-xs font-sans animate-slide-in-up">
              <div className="px-2 py-1 text-[10px] font-semibold text-zinc-500 uppercase tracking-wider flex items-center justify-between">
                <span>Son Projeler</span>
                <span className="text-[9px] font-mono text-zinc-600">{recentProjects.length}</span>
              </div>

              <div className="max-h-52 overflow-y-auto space-y-0.5 my-1">
                {recentProjects.map((p) => {
                  const name = p.split(/[\\/]/).filter(Boolean).pop() || p;
                  const isActive = p.toLowerCase() === cwd.toLowerCase();
                  return (
                    <button
                      key={p}
                      onClick={() => {
                        onSelectRecentProject?.(p);
                        setRecentMenuOpen(false);
                      }}
                      className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-left transition-colors ${
                        isActive
                          ? 'bg-zinc-800/80 text-white font-medium'
                          : 'text-zinc-300 hover:text-white hover:bg-zinc-900'
                      }`}
                      title={p}
                    >
                      <Folder size={12} className={isActive ? 'text-amber-400' : 'text-zinc-500'} />
                      <div className="min-w-0 flex-1">
                        <div className="text-[11px] truncate">{name}</div>
                        <div className="text-[9px] text-zinc-500 font-mono truncate">{p}</div>
                      </div>
                    </button>
                  );
                })}
                {recentProjects.length === 0 && (
                  <div className="px-2 py-3 text-center text-zinc-600 text-[11px]">
                    Henüz açılmış bir proje yok.
                  </div>
                )}
              </div>

              <div className="border-t border-zinc-800/80 pt-1 mt-1">
                <button
                  onClick={() => {
                    setRecentMenuOpen(false);
                    onOpenProjectFolder?.();
                  }}
                  className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-sky-400 hover:text-sky-300 hover:bg-sky-950/30 transition-colors text-left font-medium"
                >
                  <FolderPlus size={13} />
                  <span>Open Folder from Computer...</span>
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Quick Open Folder Button */}
        <button
          onClick={onOpenProjectFolder}
          className="p-1.5 rounded-md text-zinc-400 hover:text-zinc-100 hover:bg-zinc-900 border border-zinc-800/60 transition-colors flex-shrink-0"
          title="Diskten bir proje klasörü seçin"
        >
          <FolderPlus size={13} />
        </button>
      </div>

      {/* 3-Way Sub-tab Navigation */}
      <div className="flex border-b border-zinc-900 bg-zinc-950/40 text-[11px] font-medium flex-shrink-0">
        <button
          onClick={() => setActiveSidebarTab('sessions')}
          className={`flex-1 py-1.5 flex items-center justify-center gap-1.5 border-b-2 transition-colors ${
            activeSidebarTab === 'sessions'
              ? 'border-sky-500 text-sky-400 bg-zinc-900/40'
              : 'border-transparent text-zinc-500 hover:text-zinc-300'
          }`}
          title="Açık terminaller ve yapay zekâya verdiğiniz önceki istekler"
        >
          <MessageSquare size={11} />
          <span>Oturumlar</span>
          {tabs.length > 0 && (
            <span className="text-[9px] px-1 rounded-full bg-zinc-800 text-zinc-400">
              {tabs.length}
            </span>
          )}
        </button>

        <button
          onClick={() => setActiveSidebarTab('files')}
          className={`flex-1 py-1.5 flex items-center justify-center gap-1.5 border-b-2 transition-colors ${
            activeSidebarTab === 'files'
              ? 'border-sky-500 text-sky-400 bg-zinc-900/40'
              : 'border-transparent text-zinc-500 hover:text-zinc-300'
          }`}
          title="Proje dosyaları — tıklayınca yol komut kutusuna eklenir"
        >
          <Folder size={11} />
          <span>Dosyalar</span>
          {projectFiles.length > 0 && (
            <span className="text-[9px] px-1 rounded-full bg-zinc-800 text-zinc-400">
              {projectFiles.length}
            </span>
          )}
        </button>

        <button
          onClick={() => setActiveSidebarTab('memory')}
          className={`flex-1 py-1.5 flex items-center justify-center gap-1.5 border-b-2 transition-colors ${
            activeSidebarTab === 'memory'
              ? 'border-sky-500 text-sky-400 bg-zinc-900/40'
              : 'border-transparent text-zinc-500 hover:text-zinc-300'
          }`}
          title="Ajanların bu proje hakkında hatırlayacağı kurallar ve bilgiler"
        >
          <Brain size={11} />
          <span>Hafıza</span>
          {projectMemory?.rules && projectMemory.rules.length > 0 && (
            <span className="text-[9px] px-1 rounded-full bg-emerald-950 text-emerald-400 border border-emerald-800/60">
              {projectMemory.rules.length}
            </span>
          )}
        </button>
      </div>

      {/* Main Tab Content */}
      <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
        {/* ==================== SESSIONS & HISTORY TAB ==================== */}
        {activeSidebarTab === 'sessions' && (
          <div className="flex-1 flex flex-col min-h-0">
            {/* Search + New Session */}
            <div className="p-2 flex items-center gap-1.5 flex-shrink-0 border-b border-zinc-900/60">
              <div className="flex-1 flex items-center gap-1.5 px-2 py-1.5 rounded-md bg-zinc-900/60 border border-zinc-800/60 min-w-0">
                <Search size={12} className="text-zinc-500 flex-shrink-0" />
                <input
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Konuşmalarda ara..."
                  className="flex-1 min-w-0 bg-transparent text-[11px] text-zinc-200 placeholder:text-zinc-600 outline-none"
                />
              </div>

              <div className="relative flex-shrink-0" onClick={(e) => e.stopPropagation()}>
                <button
                  onClick={() => setNewMenuOpen(!newMenuOpen)}
                  className="p-1.5 rounded-md bg-zinc-900/60 border border-zinc-800/60 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-900 transition-colors"
                  title="Yeni oturum — Claude, AGY, Codex veya terminal"
                >
                  <Plus size={13} />
                </button>

                {newMenuOpen && (
                  <div className="absolute right-0 mt-1.5 w-52 rounded-xl bg-base-elevated border border-zinc-800 shadow-2xl p-1.5 z-50 text-xs font-sans animate-slide-in-up">
                    <div className="px-2 py-1 text-[10px] font-semibold text-zinc-500 uppercase tracking-wider">
                      Launch Agent
                    </div>

                    {(['claude', 'agy', 'shell', 'codex'] as SessionType[]).map((type) => {
                      const meta = typeMeta[type];
                      return (
                        <button
                          key={type}
                          onClick={() => {
                            onNewSession(type);
                            setNewMenuOpen(false);
                          }}
                          className="w-full flex items-center space-x-2.5 px-2.5 py-1.5 rounded-lg text-zinc-300 hover:text-white hover:bg-zinc-900 text-left transition-colors group"
                        >
                          <div className={`w-5 h-5 rounded flex items-center justify-center ${meta.chip}`}>
                            {meta.icon}
                          </div>
                          <span className="text-xs font-medium text-zinc-200">{meta.label}</span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            {/* Session Lists */}
            <div className="flex-1 min-h-0 overflow-y-auto px-2 py-2 space-y-3 font-sans">
              {/* Active Tabs */}
              <div>
                <div className="px-1 pb-1 text-[10px] font-semibold uppercase tracking-wider text-zinc-600 flex items-center justify-between">
                  <span>Açık Sekmeler</span>
                  <span className="text-[9px] font-mono text-zinc-600">{filteredTabs.length}</span>
                </div>

                <div className="space-y-0.5">
                  {filteredTabs.map((tab) => {
                    const isActive = tab.id === activeTabId;
                    const firstSession = tab.sessions[0];
                    const sessionType = firstSession?.type || 'shell';
                    const meta = typeMeta[sessionType];

                    return (
                      <div
                        key={tab.id}
                        onClick={() => onSelectTab(tab.id)}
                        className={`flex items-center gap-2 px-2 py-1.5 rounded-lg cursor-pointer transition-all ${
                          isActive
                            ? 'bg-zinc-900 border border-zinc-800 shadow-sm'
                            : 'border border-transparent hover:bg-zinc-900/50'
                        }`}
                      >
                        <div className={`w-5 h-5 rounded flex items-center justify-center flex-shrink-0 ${meta.chip}`}>
                          {meta.icon}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className={`text-[11px] truncate ${isActive ? 'text-zinc-100 font-medium' : 'text-zinc-400'}`}>
                            {tab.title}
                          </div>
                          <div className="text-[10px] text-zinc-600 truncate">
                            {meta.label}
                            {tab.sessions.length > 1 ? ` · ${tab.sessions.length} panes` : ''}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                  {filteredTabs.length === 0 && (
                    <div className="px-2 py-2 text-[11px] text-zinc-600">
                      Aramayla eşleşen sekme yok.
                    </div>
                  )}
                </div>
              </div>

              {/* Past Project Conversations */}
              <div>
                <div className="px-1 pb-1 text-[10px] font-semibold uppercase tracking-wider text-zinc-600 flex items-center justify-between">
                  <span>Geçmiş İstekler</span>
                  <span className="text-[9px] font-mono text-zinc-600">{filteredPastConversations.length}</span>
                </div>

                <div className="space-y-1">
                  {filteredPastConversations.map((conv) => {
                    const meta = typeMeta[conv.agent] || typeMeta.shell;
                    const timeStr = new Date(conv.timestamp).toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit',
                    });

                    return (
                      <div
                        key={conv.id}
                        onClick={() => onSelectConversation?.(conv)}
                        className="p-2 rounded-lg border border-zinc-900 hover:border-zinc-800 bg-zinc-950/60 hover:bg-zinc-900/60 cursor-pointer transition-all group"
                      >
                        <div className="flex items-center justify-between gap-1.5 mb-1">
                          <div className="flex items-center gap-1.5 min-w-0">
                            <div className={`w-4 h-4 rounded flex items-center justify-center flex-shrink-0 ${meta.chip}`}>
                              {meta.icon}
                            </div>
                            <span className="text-[10px] font-semibold text-zinc-300 truncate">
                              {conv.title || conv.agent}
                            </span>
                          </div>
                          <span className="text-[9px] text-zinc-600 font-mono flex-shrink-0">
                            {timeStr}
                          </span>
                        </div>

                        <div className="text-[11px] text-zinc-400 line-clamp-2 leading-relaxed">
                          {conv.prompt || conv.summary || 'Session record'}
                        </div>

                        {conv.summary && (
                          <div className="mt-1 text-[10px] text-zinc-500 italic truncate">
                            ↳ {conv.summary}
                          </div>
                        )}
                      </div>
                    );
                  })}

                  {filteredPastConversations.length === 0 && (
                    <div className="px-2 py-4 text-center text-zinc-600 text-[11px] leading-relaxed">
                      Bu projede henüz bir istek yok. Komut kutusuna isteğinizi yazıp Ctrl+Shift+Enter ile Claude'a sorduğunuzda burada listelenir; tıklayarak tekrar sorabilirsiniz.
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ==================== PROJECT FILES TAB ==================== */}
        {activeSidebarTab === 'files' && (
          <div className="flex-1 flex flex-col min-h-0">
            {/* File Actions Bar */}
            <div className="p-2 flex items-center justify-between border-b border-zinc-900/60 flex-shrink-0">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500 font-mono">
                Project Files
              </span>
              <button
                onClick={onRefreshFiles}
                className="p-1 rounded text-zinc-500 hover:text-zinc-200 hover:bg-zinc-900 transition-colors"
                title="Dosya listesini yenile"
              >
                <RefreshCw size={11} />
              </button>
            </div>

            {/* Tree View */}
            <div className="flex-1 min-h-0 overflow-y-auto px-1 py-1.5">
              {projectFiles.length > 0 ? (
                projectFiles.map((item) => (
                  <FileNode
                    key={item.path}
                    item={item}
                    depth={0}
                    onFileSelect={onFileSelect}
                    onInsertFilePath={onInsertFilePath}
                  />
                ))
              ) : (
                <div className="p-6 text-center text-zinc-600 text-[11px] space-y-2">
                  <p>Henüz bir proje klasörü seçilmedi.</p>
                  <button
                    onClick={onOpenProjectFolder}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-300 hover:text-white hover:bg-zinc-800 transition-colors"
                  >
                    <FolderPlus size={12} />
                    <span>Klasör Aç</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ==================== PROJECT MEMORY TAB ==================== */}
        {activeSidebarTab === 'memory' && (
          <div className="flex-1 flex flex-col min-h-0 overflow-y-auto p-2.5 space-y-4">
            {/* Memory Info Banner */}
            <div className="p-2.5 rounded-lg bg-zinc-950 border border-zinc-900 text-[11px] space-y-1">
              <div className="flex items-center gap-1.5 text-zinc-200 font-medium">
                <Brain size={12} className="text-emerald-400 flex-shrink-0" />
                <span>Proje Kuralları</span>
              </div>
              <p className="text-zinc-500 text-[10px] leading-relaxed">
                Rules and facts saved in <code className="text-zinc-400 font-mono">.vulgaris-memory.json</code> are
                automatically injected into prompts when invoking Claude Code, AGY, and Shell.
              </p>
            </div>

            {/* Rules Section */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
                <span>Rules & Standards</span>
                <span className="font-mono text-zinc-600">
                  {projectMemory?.rules?.length || 0}
                </span>
              </div>

              {/* Add Rule Form */}
              <form onSubmit={handleAddRule} className="flex gap-1.5">
                <input
                  type="text"
                  value={newRuleInput}
                  onChange={(e) => setNewRuleInput(e.target.value)}
                  placeholder="örn. Testleri her zaman Vitest ile yaz..."
                  className="flex-1 bg-zinc-950 border border-zinc-800/80 rounded-md px-2 py-1 text-[11px] text-zinc-200 placeholder:text-zinc-600 outline-none focus:border-emerald-600"
                />
                <button
                  type="submit"
                  disabled={!newRuleInput.trim()}
                  className="px-2 py-1 rounded-md bg-emerald-950 text-emerald-300 border border-emerald-800 hover:bg-emerald-900 transition-colors disabled:opacity-30 disabled:hover:bg-emerald-950 flex-shrink-0"
                  title="Kural ekle"
                >
                  <Plus size={12} />
                </button>
              </form>

              {/* Rules List */}
              <div className="space-y-1">
                {projectMemory?.rules && projectMemory.rules.length > 0 ? (
                  projectMemory.rules.map((rule, idx) => (
                    <div
                      key={idx}
                      className="flex items-start justify-between gap-1.5 p-2 rounded-lg bg-zinc-950/80 border border-zinc-900 text-[11px] text-zinc-300 group hover:border-zinc-800 transition-colors"
                    >
                      <span className="flex-1 leading-relaxed">{rule}</span>
                      <button
                        onClick={() => onRemoveMemoryRule?.(rule)}
                        className="opacity-0 group-hover:opacity-100 p-0.5 rounded text-zinc-600 hover:text-red-400 hover:bg-zinc-800 transition-all flex-shrink-0"
                        title="Kuralı sil"
                      >
                        <Trash2 size={11} />
                      </button>
                    </div>
                  ))
                ) : (
                  <div className="py-2 text-center text-zinc-600 text-[11px]">
                    Henüz kural yok. Ajanların her zaman uymasını istediğiniz bir kural yazın.
                  </div>
                )}
              </div>
            </div>

            {/* Facts Section */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
                <span>Proje Bilgileri</span>
                <button
                  onClick={() => setAddingFact(!addingFact)}
                  className="text-zinc-400 hover:text-zinc-200"
                  title="Bilgi ekle"
                >
                  <Plus size={11} />
                </button>
              </div>

              {addingFact && (
                <form onSubmit={handleAddFact} className="p-2 rounded-lg bg-zinc-950 border border-zinc-800 space-y-1.5">
                  <input
                    type="text"
                    value={newFactKey}
                    onChange={(e) => setNewFactKey(e.target.value)}
                    placeholder="Anahtar (örn. framework)"
                    className="w-full bg-zinc-900 border border-zinc-800 rounded px-2 py-1 text-[11px] text-zinc-200 placeholder:text-zinc-600 outline-none"
                  />
                  <input
                    type="text"
                    value={newFactVal}
                    onChange={(e) => setNewFactVal(e.target.value)}
                    placeholder="Değer (örn. Next.js 15)"
                    className="w-full bg-zinc-900 border border-zinc-800 rounded px-2 py-1 text-[11px] text-zinc-200 placeholder:text-zinc-600 outline-none"
                  />
                  <div className="flex justify-end gap-1.5 pt-1">
                    <button
                      type="button"
                      onClick={() => setAddingFact(false)}
                      className="px-2 py-0.5 rounded text-[10px] text-zinc-500 hover:text-zinc-300"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={!newFactKey.trim() || !newFactVal.trim()}
                      className="px-2 py-0.5 rounded text-[10px] bg-emerald-950 text-emerald-300 border border-emerald-800 hover:bg-emerald-900 disabled:opacity-30"
                    >
                      Save
                    </button>
                  </div>
                </form>
              )}

              <div className="space-y-1">
                {projectMemory?.facts && Object.keys(projectMemory.facts).length > 0 ? (
                  Object.entries(projectMemory.facts).map(([key, fact]) => (
                    <div
                      key={key}
                      className="flex items-center justify-between gap-1.5 px-2 py-1.5 rounded-lg bg-zinc-950/80 border border-zinc-900 text-[11px] group hover:border-zinc-800 transition-colors"
                    >
                      <div className="min-w-0 flex-1 font-mono">
                        <span className="text-zinc-400 font-medium">{key}: </span>
                        <span className="text-zinc-200">{fact.value}</span>
                      </div>
                      <button
                        onClick={() => onDeleteMemoryFact?.(key)}
                        className="opacity-0 group-hover:opacity-100 p-0.5 rounded text-zinc-600 hover:text-red-400 hover:bg-zinc-800 transition-all flex-shrink-0"
                        title="Bilgiyi sil"
                      >
                        <Trash2 size={11} />
                      </button>
                    </div>
                  ))
                ) : (
                  <div className="py-2 text-center text-zinc-600 text-[11px]">
                    Henüz bilgi yok.
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Bottom Profile / Settings Bar */}
      <div className="p-2.5 border-t border-zinc-900 flex items-center justify-between text-xs flex-shrink-0 bg-zinc-950/40">
        <div
          className="flex items-center space-x-2 min-w-0 cursor-pointer hover:text-zinc-100 transition-colors"
          onClick={onOpenProjectFolder}
          title={cwd ? `Project folder: ${cwd}` : 'Click to select project folder'}
        >
          <Folder size={13} className="text-zinc-500 flex-shrink-0" />
          <div className="min-w-0">
            <div className="text-[9px] uppercase tracking-wider text-zinc-600 leading-none">Proje</div>
            <div className="text-zinc-400 truncate text-[11px] font-mono">
              {projectName}
            </div>
          </div>
        </div>

        <button
          onClick={onOpenSettings}
          className="p-1.5 rounded-md text-zinc-500 hover:text-zinc-200 hover:bg-zinc-900 transition-colors"
          title="Ayarlar (Ctrl+,)"
        >
          <Settings size={13} />
        </button>
      </div>
    </div>
  );
};

