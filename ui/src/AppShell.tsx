import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { PanelLeft, PanelLeftClose, ChevronLeft, ChevronRight } from 'lucide-react';
import { SessionSidebar } from './zeron/SessionSidebar.js';
import { HomeView } from './zeron/HomeView.js';
import { SessionView } from './zeron/SessionView.js';
import { SettingsModal } from './zeron/SettingsModal.js';
import { SystemOneView } from './zeron/SystemOneView.js';
import {
  reduceChatEvent,
  appendUserMessage,
  initialChatState,
} from './utils/claudeStreamParser.js';
import {
  titleFromPrompt,
  effortToCli,
  MODEL_OPTIONS,
  type EffortLevel,
  type ImageAttachment,
  type ModelOption,
  type Session,
} from './zeron/types.js';

declare global {
  interface Window {
    warpApi: any;
  }
}

/** Read an image File into a base64 ImageAttachment (with a data-URI preview). */
function readImageFile(file: File): Promise<ImageAttachment | null> {
  return new Promise((resolve) => {
    if (!file.type.startsWith('image/')) {
      resolve(null);
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || '');
      const comma = result.indexOf(',');
      const data = comma >= 0 ? result.slice(comma + 1) : result;
      resolve({
        id: `img-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        name: file.name,
        mediaType: file.type,
        data,
        previewUrl: result,
      });
    };
    reader.onerror = () => resolve(null);
    reader.readAsDataURL(file);
  });
}

export const AppShell: React.FC = () => {
  const api = typeof window !== 'undefined' ? window.warpApi : undefined;

  const [sessions, setSessions] = useState<Session[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [input, setInput] = useState('');
  const [model, setModel] = useState<ModelOption>(MODEL_OPTIONS[0]);
  const [effort, setEffort] = useState<EffortLevel>('High');
  const [attachments, setAttachments] = useState<ImageAttachment[]>([]);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [systemOneOpen, setSystemOneOpen] = useState(false);

  const [host, setHost] = useState('This Mac');
  const [repo, setRepo] = useState('project');
  const [branch, setBranch] = useState('main');
  const [cwd, setCwd] = useState('');
  const [recentProjects, setRecentProjects] = useState<string[]>([]);
  const [, setTick] = useState(0);

  const activeSession = useMemo(
    () => sessions.find((s) => s.id === activeId) || null,
    [sessions, activeId]
  );

  const applyProject = useCallback((path: string) => {
    setCwd(path);
    setRepo(path.split(/[\\/]/).filter(Boolean).pop() || 'project');
    api?.getGitBranch?.(path).then((b: string | null) => b && setBranch(b)).catch(() => {});
  }, [api]);

  // Load environment context (host / repo / branch / recent projects).
  useEffect(() => {
    if (!api) return;
    (async () => {
      try {
        const dir = await api.getCwd?.();
        if (dir) applyProject(dir);
        const h = await api.getHostname?.();
        if (h) setHost(h);
        const recents = await api.getRecentProjects?.();
        if (Array.isArray(recents)) setRecentProjects(recents);
      } catch {}
    })();
  }, [api, applyProject]);

  // Keep relative timestamps fresh.
  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 30_000);
    return () => clearInterval(t);
  }, []);

  // Route Claude Code stream events into the matching session.
  useEffect(() => {
    if (!api) return;
    const offEvent = api.onClaudeChatEvent(({ id, event }: { id: string; event: any }) => {
      setSessions((prev) =>
        prev.map((s) => {
          if (s.id !== id) return s;
          const chat = reduceChatEvent(s.chat, event);
          const running = event?.type === 'result' ? false : s.running;
          return { ...s, chat, running, updatedAt: Date.now() };
        })
      );
    });
    const offExit = api.onClaudeChatExit(({ id }: { id: string; code: number }) => {
      setSessions((prev) => prev.map((s) => (s.id === id ? { ...s, running: false } : s)));
    });
    return () => {
      offEvent?.();
      offExit?.();
    };
  }, [api]);

  const handleAddFiles = useCallback(async (files: FileList | null) => {
    if (!files) return;
    const results = await Promise.all(Array.from(files).map(readImageFile));
    const valid = results.filter((r): r is ImageAttachment => r !== null);
    if (valid.length) setAttachments((prev) => [...prev, ...valid]);
  }, []);

  const handleRemoveAttachment = useCallback((id: string) => {
    setAttachments((prev) => prev.filter((a) => a.id !== id));
  }, []);

  const handleOpenFolder = useCallback(async () => {
    try {
      const res = await api?.openProjectFolder?.();
      if (res?.path) {
        applyProject(res.path);
        if (Array.isArray(res.recentProjects)) setRecentProjects(res.recentProjects);
      }
    } catch {}
  }, [api, applyProject]);

  const handleSelectProject = useCallback(async (path: string) => {
    try {
      const res = await api?.setProjectFolder?.(path);
      if (res?.path) {
        applyProject(res.path);
        if (Array.isArray(res.recentProjects)) setRecentProjects(res.recentProjects);
      } else {
        applyProject(path);
      }
    } catch {
      applyProject(path);
    }
  }, [api, applyProject]);

  const handleSubmit = useCallback(() => {
    const text = input.trim();
    if (!text && attachments.length === 0) return;
    setInput('');

    const imagesForCli = attachments.map((a) => ({ mediaType: a.mediaType, data: a.data }));
    const previews = attachments.map((a) => a.previewUrl);
    setAttachments([]);

    if (activeId) {
      setSessions((prev) =>
        prev.map((s) =>
          s.id === activeId
            ? {
                ...s,
                chat: appendUserMessage(s.chat, text, previews),
                running: true,
                updatedAt: Date.now(),
              }
            : s
        )
      );
      api?.sendClaudeChat(activeId, text, imagesForCli.length ? imagesForCli : undefined);
      return;
    }

    const id = `chat-${Date.now()}`;
    const session: Session = {
      id,
      title: titleFromPrompt(text || attachments[0]?.name || 'New Session'),
      createdAt: Date.now(),
      updatedAt: Date.now(),
      chat: appendUserMessage(initialChatState(), text, previews),
      running: true,
      started: true,
      cwd,
    };
    setSessions((prev) => [session, ...prev]);
    setActiveId(id);
    api?.startClaudeChat({
      id,
      prompt: text,
      cwd,
      model: model.id,
      effort: effortToCli(effort),
      images: imagesForCli.length ? imagesForCli : undefined,
    });
  }, [input, attachments, activeId, api, cwd, model, effort]);

  const handleStop = useCallback(() => {
    if (activeId) api?.stopClaudeChat(activeId);
    setSessions((prev) => prev.map((s) => (s.id === activeId ? { ...s, running: false } : s)));
  }, [activeId, api]);

  return (
    <div className="flex flex-col h-screen w-screen bg-[#08080a] text-zinc-200 overflow-hidden font-sans">
      {/* Draggable top strip with nav controls */}
      <div
        className="h-9 flex items-center px-2.5 gap-1 flex-shrink-0"
        style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
      >
        <div
          className="flex items-center gap-0.5"
          style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
        >
          <button
            onClick={() => setSidebarOpen((v) => !v)}
            className="p-1.5 rounded-md text-zinc-500 hover:text-zinc-200 hover:bg-white/5 transition-colors"
            title="Toggle sidebar"
          >
            {sidebarOpen ? <PanelLeftClose size={15} /> : <PanelLeft size={15} />}
          </button>
          <button
            onClick={() => setActiveId(null)}
            disabled={!activeId}
            className="p-1.5 rounded-md text-zinc-500 enabled:hover:text-zinc-200 enabled:hover:bg-white/5 disabled:opacity-30 transition-colors"
            title="Back to home"
          >
            <ChevronLeft size={15} />
          </button>
          <button
            className="p-1.5 rounded-md text-zinc-600 disabled:opacity-30 transition-colors"
            disabled
            title="Forward"
          >
            <ChevronRight size={15} />
          </button>
        </div>
      </div>

      {/* Body: sidebar + main */}
      <div className="flex-1 flex min-h-0 relative">
        {sidebarOpen && (
          <SessionSidebar
            sessions={sessions}
            activeId={activeId}
            onSelect={setActiveId}
            onGoHome={() => setActiveId(null)}
            onOpenSettings={() => setSettingsOpen(true)}
            onOpenSystemOne={() => setSystemOneOpen(true)}
          />
        )}

        {activeSession ? (
          <SessionView
            session={activeSession}
            host={host}
            repo={repo}
            branch={branch}
            model={model}
            effort={effort}
            onSelectModel={setModel}
            onSelectEffort={setEffort}
            input={input}
            onInputChange={setInput}
            onSubmit={handleSubmit}
            onStop={handleStop}
            attachments={attachments}
            onAddFiles={handleAddFiles}
            onRemoveAttachment={handleRemoveAttachment}
          />
        ) : (
          <HomeView
            host={host}
            repo={repo}
            branch={branch}
            cwd={cwd}
            recentProjects={recentProjects}
            onOpenFolder={handleOpenFolder}
            onSelectProject={handleSelectProject}
            input={input}
            onInputChange={setInput}
            onSubmit={handleSubmit}
            model={model}
            effort={effort}
            onSelectModel={setModel}
            onSelectEffort={setEffort}
            attachments={attachments}
            onAddFiles={handleAddFiles}
            onRemoveAttachment={handleRemoveAttachment}
          />
        )}

        <SystemOneView
          isOpen={systemOneOpen}
          onClose={() => setSystemOneOpen(false)}
          defaultTargetFile=""
        />
      </div>

      <SettingsModal isOpen={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </div>
  );
};
