import React, { useCallback, useRef } from 'react';
import { XtermPane } from './XtermPane.js';
import { Sparkles, Shield, Bot, Terminal } from 'lucide-react';
import type { WorkspaceTab, SessionType, TerminalSession } from '../types/warp.js';
import { useI18n } from '../i18n/index.js';

interface PaneGridProps {
  tab: WorkspaceTab;
  onSetActiveSession: (sessionId: string) => void;
  onCloseSession: (sessionId: string) => void;
  onSplitSession: (sessionId: string, direction: 'h' | 'v') => void;
  onPipeErrorToAgent: (targetType: SessionType, errorSnippet: string) => void;
  onResizePanes: (sizes: number[]) => void;
  onLaunchAgent?: (type: SessionType) => void;
  onRegisterCommandHandler?: (sessionId: string, handler: ((command: string) => void) | null) => void;
  onSessionState?: (sessionId: string, state: { busy: boolean; cwd: string; agent?: boolean }) => void;
  onCommandFinished?: (sessionId: string, result: { command?: string; exitCode: number; output: string }) => void;
  /** Each pane's own command dock, rendered under its terminal (null for none). */
  renderDock?: (session: TerminalSession) => React.ReactNode;
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
  onRegisterCommandHandler,
  onSessionState,
  onCommandFinished,
  renderDock,
}) => {
  const { t } = useI18n();
  const containerRef = useRef<HTMLDivElement>(null);
  const dragState = useRef<{ index: number; startPos: number; sizes: number[]; axis: 'x' | 'y' } | null>(
    null
  );

  if (tab.sessions.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8 select-none font-sans">
        <img src="./logo-mark.svg" alt="Vulgr" className="logo-mark w-20 h-20 object-contain mb-4" draggable={false} />

        <h2 className="text-sm font-semibold text-zinc-100 tracking-wide">{t.workspace.workspaceReady}</h2>
        <p className="text-xs text-zinc-500 mt-1 max-w-sm text-center leading-relaxed">
          {t.workspace.workspaceReadyHint}
        </p>

        {onLaunchAgent && (
          <div className="grid grid-cols-2 gap-3 mt-6 w-full max-w-md">
            <button
              onClick={() => onLaunchAgent('claude')}
              className="flex items-center space-x-3 p-3.5 rounded-xl bg-zinc-950 hover:bg-zinc-900 border border-zinc-800/80 hover:border-zinc-700 text-left transition-all group"
            >
              <div className="p-2 rounded-lg bg-zinc-900 text-zinc-300 border border-zinc-800 group-hover:scale-105 transition-transform">
                <Sparkles size={16} className="text-violet-400" />
              </div>
              <div>
                <div className="text-xs font-semibold text-zinc-200">Claude Code</div>
                <div className="text-[10px] text-zinc-500">{t.workspace.claudeSubtitle}</div>
              </div>
            </button>

            <button
              onClick={() => onLaunchAgent('shell')}
              className="flex items-center space-x-3 p-3.5 rounded-xl bg-zinc-950 hover:bg-zinc-900 border border-zinc-800/80 hover:border-zinc-700 text-left transition-all group"
            >
              <div className="p-2 rounded-lg bg-zinc-900 text-zinc-300 border border-zinc-800 group-hover:scale-105 transition-transform">
                <Terminal size={16} />
              </div>
              <div>
                <div className="text-xs font-semibold text-zinc-200">{t.workspace.shellTitle}</div>
                <div className="text-[10px] text-zinc-500">{t.workspace.shellSubtitle}</div>
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
    <div ref={containerRef} className={`flex-1 w-full h-full min-h-0 min-w-0 ${containerClass}`}>
      {tab.sessions.map((session, i) => (
        <React.Fragment key={session.id}>
          <div
            className="min-h-0 min-w-0 flex flex-col"
            style={
              // Panes share what the dividers leave, in proportion to their sizes,
              // so the row never overflows the window.
              isSplit
                ? axis === 'x'
                  ? { flex: `${sizes[i]} 1 0`, height: '100%' }
                  : { flex: `${sizes[i]} 1 0`, width: '100%' }
                : { flex: '1 1 auto', width: '100%', height: '100%' }
            }
          >
            <div className="flex-1 min-h-0 min-w-0">
              <XtermPane
                session={session}
                isActive={session.id === tab.activeSessionId}
                isSplitView={isSplit}
                onFocus={() => onSetActiveSession(session.id)}
                onClose={() => onCloseSession(session.id)}
                onSplit={(dir) => onSplitSession(session.id, dir)}
                onPipeErrorToAgent={onPipeErrorToAgent}
                onRegisterCommandHandler={onRegisterCommandHandler}
                onSessionState={onSessionState}
                onCommandFinished={onCommandFinished}
              />
            </div>
            {renderDock && (
              // Typing in a pane's dock makes that pane the active one.
              <div onMouseDownCapture={() => onSetActiveSession(session.id)} onFocusCapture={() => onSetActiveSession(session.id)}>
                {renderDock(session)}
              </div>
            )}
          </div>

          {isSplit && i < count - 1 && (
            <div
              onMouseDown={handleDividerMouseDown(i)}
              className={`group flex-shrink-0 flex items-center justify-center z-10 transition-colors ${
 axis === 'x' ? 'w-2.5 cursor-col-resize px-0.5' : 'h-2.5 cursor-row-resize py-0.5'
 }`}
              title={t.workspace.dragToResize}
            >
              <div
                className={`bg-zinc-800/80 group-hover:bg-zinc-500 transition-all rounded-full ${
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
