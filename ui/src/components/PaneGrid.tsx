import React, { useCallback, useRef } from 'react';
import { XtermPane } from './XtermPane.js';
import { Sparkles, Shield, Bot, Terminal, Zap } from 'lucide-react';
import type { WorkspaceTab, SessionType } from '../types/warp.js';

interface PaneGridProps {
  tab: WorkspaceTab;
  onSetActiveSession: (sessionId: string) => void;
  onCloseSession: (sessionId: string) => void;
  onSplitSession: (sessionId: string, direction: 'h' | 'v') => void;
  onPipeErrorToAgent: (targetType: SessionType, errorSnippet: string) => void;
  onResizePanes: (sizes: number[]) => void;
  onLaunchAgent?: (type: SessionType) => void;
}

const MIN_PANE_PCT = 12;

export const PaneGrid: React.FC<PaneGridProps> = ({
  tab,
  onSetActiveSession,
  onCloseSession,
  onSplitSession,
  onPipeErrorToAgent,
  onResizePanes,
  onLaunchAgent,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const dragState = useRef<{ index: number; startPos: number; sizes: number[]; axis: 'x' | 'y' } | null>(
    null
  );

  if (tab.sessions.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8 select-none font-sans">
        <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-cyan-400 via-indigo-500 to-purple-500 flex items-center justify-center font-bold text-xl text-black shadow-[0_0_30px_rgba(0,216,255,0.3)] mb-4">
          <Zap size={28} className="text-black fill-current" />
        </div>

        <h2 className="text-lg font-bold text-white tracking-wide">Workspace Ready</h2>
        <p className="text-xs text-slate-400 mt-1 max-w-sm text-center leading-relaxed">
          Open an AI agent or shell terminal pane to start collaborating.
        </p>

        {onLaunchAgent && (
          <div className="grid grid-cols-2 gap-3 mt-6 w-full max-w-md">
            <button
              onClick={() => onLaunchAgent('claude')}
              className="flex items-center space-x-3 p-3.5 rounded-xl glass-card hover:bg-purple-500/10 border border-purple-500/20 hover:border-purple-500/40 text-left transition-all group"
            >
              <div className="p-2 rounded-lg bg-purple-500/20 text-purple-400 group-hover:scale-110 transition-transform">
                <Sparkles size={16} />
              </div>
              <div>
                <div className="text-xs font-semibold text-slate-100">Claude Code</div>
                <div className="text-[10px] text-slate-400">Anthropic AI CLI</div>
              </div>
            </button>

            <button
              onClick={() => onLaunchAgent('agy')}
              className="flex items-center space-x-3 p-3.5 rounded-xl glass-card hover:bg-cyan-500/10 border border-cyan-500/20 hover:border-cyan-500/40 text-left transition-all group"
            >
              <div className="p-2 rounded-lg bg-cyan-500/20 text-cyan-400 group-hover:scale-110 transition-transform">
                <Shield size={16} />
              </div>
              <div>
                <div className="text-xs font-semibold text-slate-100">AGY Engine</div>
                <div className="text-[10px] text-slate-400">Antigravity 2.0 CLI</div>
              </div>
            </button>

            <button
              onClick={() => onLaunchAgent('codex')}
              className="flex items-center space-x-3 p-3.5 rounded-xl glass-card hover:bg-emerald-500/10 border border-emerald-500/20 hover:border-emerald-500/40 text-left transition-all group"
            >
              <div className="p-2 rounded-lg bg-emerald-500/20 text-emerald-400 group-hover:scale-110 transition-transform">
                <Bot size={16} />
              </div>
              <div>
                <div className="text-xs font-semibold text-slate-100">Codex CLI</div>
                <div className="text-[10px] text-slate-400">OpenAI Terminal CLI</div>
              </div>
            </button>

            <button
              onClick={() => onLaunchAgent('shell')}
              className="flex items-center space-x-3 p-3.5 rounded-xl glass-card hover:bg-white/[0.08] border border-white/[0.08] hover:border-white/[0.15] text-left transition-all group"
            >
              <div className="p-2 rounded-lg bg-white/[0.06] text-slate-300 group-hover:scale-110 transition-transform">
                <Terminal size={16} />
              </div>
              <div>
                <div className="text-xs font-semibold text-slate-100">Interactive Shell</div>
                <div className="text-[10px] text-slate-400">Bash / PowerShell PTY</div>
              </div>
            </button>
          </div>
        )}
      </div>
    );
  }

  const isSplit = tab.layout !== 'single' && tab.sessions.length > 1;
  const axis: 'x' | 'y' = tab.layout === 'split-v' ? 'y' : 'x';
  const containerClass = isSplit
    ? axis === 'x'
      ? 'flex flex-row'
      : 'flex flex-col'
    : 'flex flex-col';

  const count = tab.sessions.length;
  const equalShare = 100 / count;
  const sizes =
    tab.paneSizes && tab.paneSizes.length === count
      ? tab.paneSizes
      : new Array(count).fill(equalShare);

  const handleDividerMouseDown = useCallback(
    (index: number) => (e: React.MouseEvent) => {
      e.preventDefault();
      dragState.current = {
        index,
        startPos: axis === 'x' ? e.clientX : e.clientY,
        sizes: [...sizes],
        axis,
      };

      const handleMouseMove = (moveEvent: MouseEvent) => {
        const drag = dragState.current;
        const container = containerRef.current;
        if (!drag || !container) return;

        const rect = container.getBoundingClientRect();
        const containerExtent = drag.axis === 'x' ? rect.width : rect.height;
        const currentPos = drag.axis === 'x' ? moveEvent.clientX : moveEvent.clientY;
        const deltaPct = ((currentPos - drag.startPos) / containerExtent) * 100;

        const next = [...drag.sizes];
        const left = drag.index;
        const right = drag.index + 1;
        let newLeft = drag.sizes[left] + deltaPct;
        let newRight = drag.sizes[right] - deltaPct;

        if (newLeft < MIN_PANE_PCT) {
          newRight -= MIN_PANE_PCT - newLeft;
          newLeft = MIN_PANE_PCT;
        }
        if (newRight < MIN_PANE_PCT) {
          newLeft -= MIN_PANE_PCT - newRight;
          newRight = MIN_PANE_PCT;
        }

        next[left] = newLeft;
        next[right] = newRight;
        onResizePanes(next);
      };

      const handleMouseUp = () => {
        dragState.current = null;
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mouseup', handleMouseUp);
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
      };

      document.body.style.cursor = axis === 'x' ? 'col-resize' : 'row-resize';
      document.body.style.userSelect = 'none';
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    },
    [axis, sizes, onResizePanes]
  );

  return (
    <div ref={containerRef} className={`flex-1 w-full h-full p-2 min-h-0 min-w-0 ${containerClass}`}>
      {tab.sessions.map((session, i) => (
        <React.Fragment key={session.id}>
          <div
            className="min-h-0 min-w-0"
            style={
              isSplit
                ? axis === 'x'
                  ? { flex: `0 0 ${sizes[i]}%`, height: '100%' }
                  : { flex: `0 0 ${sizes[i]}%`, width: '100%' }
                : { flex: '1 1 auto', width: '100%', height: '100%' }
            }
          >
            <XtermPane
              session={session}
              isActive={session.id === tab.activeSessionId}
              onFocus={() => onSetActiveSession(session.id)}
              onClose={() => onCloseSession(session.id)}
              onSplit={(dir) => onSplitSession(session.id, dir)}
              onPipeErrorToAgent={onPipeErrorToAgent}
            />
          </div>

          {isSplit && i < count - 1 && (
            <div
              onMouseDown={handleDividerMouseDown(i)}
              className={`group flex-shrink-0 flex items-center justify-center z-10 transition-colors ${
                axis === 'x' ? 'w-2.5 cursor-col-resize px-0.5' : 'h-2.5 cursor-row-resize py-0.5'
              }`}
              title="Drag to resize"
            >
              <div
                className={`bg-white/[0.08] group-hover:bg-cyan-400 group-hover:shadow-[0_0_10px_#00d8ff] transition-all rounded-full ${
                  axis === 'x' ? 'w-[2px] h-full group-hover:w-[3px]' : 'h-[2px] w-full group-hover:h-[3px]'
                }`}
              />
            </div>
          )}
        </React.Fragment>
      ))}
    </div>
  );
};
