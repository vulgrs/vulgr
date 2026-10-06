import React, { useEffect, useState } from 'react';
import {
  Search,
  PanelLeft,
  PanelLeftClose,
  Sliders,
  GitCompare,
  FileDown,
  Sparkles,
  Minus,
  Square,

  Copy,
  X,
  CircleHelp,
} from 'lucide-react';
import type { DoctorStatus } from '../types/warp.js';
import { useI18n } from '../i18n/index.js';

interface TopBarProps {
  onToggleDiff: () => void;
  onOpenSkillsModal: () => void;
  onOpenExportReport: () => void;
  onOpenChat: () => void;
  doctor: DoctorStatus | null;
  hasUncommittedDiff: boolean;
  sidebarOpen: boolean;
  onToggleSidebar: () => void;
  onOpenPalette: () => void;
  onOpenGuide: () => void;
}


const noDrag: React.CSSProperties = { WebkitAppRegion: 'no-drag' } as React.CSSProperties;

/** Icon + short label so every toolbar action says what it does; the label collapses on narrow windows. */
const ToolButton: React.FC<{
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  title: string;
  highlight?: boolean;
  badge?: boolean;
}> = ({ onClick, icon, label, title, highlight, badge }) => (
  <button
    onClick={onClick}
    className={`relative flex items-center gap-1.5 px-2 py-1 rounded-md text-[11px] font-medium hover:bg-zinc-900 transition-colors flex-shrink-0 ${
      highlight ? 'text-primary' : 'text-zinc-400 hover:text-zinc-100'
    }`}
    title={title}
    aria-label={label}
  >
    {icon}
    <span className="hidden lg:inline">{label}</span>
    {badge && <span className="absolute top-0.5 right-0.5 size-1.5 rounded-full bg-primary" />}
  </button>
);

export const TopBar: React.FC<TopBarProps> = ({
  onToggleDiff,
  onOpenSkillsModal,
  onOpenExportReport,
  onOpenChat,
  doctor,
  hasUncommittedDiff,
  sidebarOpen,
  onToggleSidebar,
  onOpenPalette,
  onOpenGuide,
}) => {
  const { t } = useI18n();
  const [isMaximized, setIsMaximized] = useState(false);
  const isMac =
    (typeof window !== 'undefined' && window.warpApi?.platform === 'darwin') ||
    (typeof navigator !== 'undefined' && /Mac|iPhone|iPod|iPad/i.test(navigator.userAgent));
  const hasWindowControls = typeof window !== 'undefined' && !isMac && !!window.warpApi?.windowMinimize;

  useEffect(() => {
    if (!window.warpApi?.windowIsMaximized) return;
    window.warpApi.windowIsMaximized().then(setIsMaximized).catch(() => {});
    const unsubscribe = window.warpApi.onWindowMaximizedChanged?.(setIsMaximized);
    return () => unsubscribe?.();
  }, []);

  return (
    <div
      className="h-9 bg-base-app border-b border-zinc-900 flex items-center justify-between px-2 select-none flex-shrink-0 z-30"
      style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
    >
      {/* Left: Brand & the three ways to automate work */}
      <div className={`flex items-center gap-1 min-w-0 ${isMac ? 'pl-[70px]' : ''}`} style={noDrag}>
        <div className="flex items-center gap-1.5 pl-1 pr-2 flex-shrink-0">
          <img src="./logo-mark.svg" alt="Vulgr" className="logo-mark w-5 h-5 object-contain" draggable={false} />
          <span className="text-[11px] font-semibold text-zinc-300">Vulgr</span>
        </div>

        <div className="h-3.5 w-px bg-zinc-850 mx-0.5 flex-shrink-0" />

        <button
          onClick={onToggleSidebar}
          className="p-1.5 rounded-md text-zinc-500 hover:text-zinc-100 hover:bg-zinc-900 transition-colors flex-shrink-0"
          title={t.topbar.toggleSidebarHint}
          aria-label={t.topbar.toggleSidebar}
        >
          {sidebarOpen ? <PanelLeftClose size={13} /> : <PanelLeft size={13} />}
        </button>
        {onOpenChat && (
          <ToolButton
            onClick={onOpenChat}
            icon={<Sparkles size={13} />}
            label="Claude Chat"
            highlight
            title={t.topbar.claudeChatHint}
          />
        )}
        <ToolButton
          onClick={onOpenSkillsModal}
          icon={<Sliders size={13} />}
          label={t.topbar.memory}
          title={t.topbar.memoryHint}
        />
      </div>


      {/* Center: Search Omnibar */}
      <button
        onClick={onOpenPalette}
        className="flex items-center space-x-2 px-3 py-1 rounded-lg border border-zinc-800 bg-zinc-950 hover:bg-zinc-900 hover:border-zinc-700 text-xs text-zinc-400 hover:text-zinc-200 transition-all w-full max-w-md justify-between shadow-inner mx-3"
        title={t.topbar.paletteHint}
        style={noDrag}
      >
        <div className="flex items-center space-x-2">
          <Search size={11} className="text-zinc-400" />
          <span className="text-[11px] text-zinc-400">{t.topbar.palettePlaceholder}</span>
        </div>
        <kbd className="px-1.5 py-0.5 rounded bg-zinc-900 border border-zinc-800 text-[9px] font-mono text-zinc-400">
          Ctrl+Shift+P
        </kbd>
      </button>

      {/* Right: Project actions, environment status & window controls */}
      <div className="flex items-center flex-shrink-0" style={noDrag}>
        <div className="flex items-center gap-0.5">
          <ToolButton
            onClick={onToggleDiff}
            icon={<GitCompare size={13} />}
            label={t.topbar.changes}
            title={t.topbar.changesHint}
            highlight={hasUncommittedDiff}
            badge={hasUncommittedDiff}
          />
          <ToolButton
            onClick={onOpenExportReport}
            icon={<FileDown size={13} />}
            label={t.topbar.report}
            title={t.topbar.reportHint}
          />
          <ToolButton
            onClick={onOpenGuide}
            icon={<CircleHelp size={13} />}
            label={t.topbar.help}
            title={t.topbar.helpHint}
          />

          <div
            className="ml-1.5 flex items-center gap-1.5 text-[10px] text-zinc-500 font-mono"
            title={doctor ? t.topbar.envReady(doctor.node.version) : t.topbar.envChecking}
          >
            <span className={`w-2 h-2 rounded-full ${doctor ? 'bg-emerald-500' : 'bg-zinc-600 animate-pulse'}`} />
            <span className="hidden xl:inline">{doctor ? t.topbar.ready : t.topbar.checking}</span>
          </div>
        </div>

        {/* Custom Frameless Window Controls */}
        {hasWindowControls && (
          <div className="flex items-center ml-2 -mr-2 h-9">
            <button
              onClick={() => window.warpApi.windowMinimize()}
              className="w-10 h-9 flex items-center justify-center text-zinc-400 hover:bg-zinc-900 hover:text-zinc-100 transition-colors"
              title={t.topbar.minimize}
            >
              <Minus size={13} />
            </button>
            <button
              onClick={() => window.warpApi.windowMaximizeToggle()}
              className="w-10 h-9 flex items-center justify-center text-zinc-400 hover:bg-zinc-900 hover:text-zinc-100 transition-colors"
              title={isMaximized ? t.topbar.restore : t.topbar.maximize}
            >
              {isMaximized ? <Copy size={11} className="rotate-90" /> : <Square size={11} />}
            </button>
            <button
              onClick={() => window.warpApi.windowClose()}
              className="w-10 h-9 flex items-center justify-center text-zinc-400 hover:bg-red-600 hover:text-white transition-colors"
              title={t.topbar.close}
            >
              <X size={14} />
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
