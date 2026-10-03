import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Terminal, type IMarker, type IDecoration } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import {
  Sparkles,
  Shield,
  Bot,
  X,
  SplitSquareHorizontal,
  SplitSquareVertical,
  AlertTriangle,
} from 'lucide-react';
import type { TerminalSession } from '../types/warp.js';

interface XtermPaneProps {
  session: TerminalSession;
  isActive: boolean;
  isSplitView?: boolean;
  onFocus: () => void;
  onClose: () => void;
  onSplit: (direction: 'h' | 'v') => void;
  onPipeErrorToAgent: (targetType: 'claude' | 'agy' | 'codex', errorSnippet: string) => void;
  onRegisterCommandHandler?: (sessionId: string, handler: ((command: string) => void) | null) => void;
  onSessionState?: (sessionId: string, state: { busy: boolean; cwd: string; agent?: boolean }) => void;
}

const HOME_PATH = /^((?:[A-Za-z]:)?[\\/](?:Users|home)[\\/][^\\/]+)(.*)$/;

export function formatCwdLabel(cwd: string): string {
  if (!cwd) return '~';
  const m = HOME_PATH.exec(cwd);
  if (!m) return cwd;
  return m[2] ? `~${m[2]}` : '~';
}

function formatElapsed(ms: number, live = false): string {
  const seconds = ms / 1000;
  if (seconds < 60) return live ? `${Math.floor(seconds)}s` : `${seconds.toFixed(3)}s`;
  const mins = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return `${mins}m ${live ? Math.floor(rest) : rest.toFixed(2)}s`;
}

export const XtermPane: React.FC<XtermPaneProps> = ({
  session,
  isActive,
  isSplitView,
  onFocus,
  onClose,
  onSplit,
  onPipeErrorToAgent,
  onRegisterCommandHandler,
  onSessionState,
}) => {
  const terminalRef = useRef<HTMLDivElement>(null);
  const xtermInstance = useRef<Terminal | null>(null);
  const fitAddon = useRef<FitAddon | null>(null);
  const [detectedError, setDetectedError] = useState<string | null>(null);
  const isShellSession = session.type === 'shell';

  // Shell sessions: the block manager (created with the terminal below) exposes
  // its "user submitted a command" entry point here so BottomCommandDock can
  // drive it. It writes the command to the PTY and opens a block header.
  const submitCommandRef = useRef<((command: string) => void) | null>(null);
  const onSessionStateRef = useRef(onSessionState);
  onSessionStateRef.current = onSessionState;
  const onPipeErrorRef = useRef(onPipeErrorToAgent);
  onPipeErrorRef.current = onPipeErrorToAgent;

  useEffect(() => {
    if (!isShellSession || !onRegisterCommandHandler) return;
    onRegisterCommandHandler(session.id, (command) => submitCommandRef.current?.(command));
    return () => onRegisterCommandHandler(session.id, null);
  }, [session.id, isShellSession, onRegisterCommandHandler]);

  useEffect(() => {
    if (!terminalRef.current) return;

    const term = new Terminal({
      allowProposedApi: true, // registerDecoration (command block headers)
      cursorBlink: true,
      cursorStyle: 'bar',
      fontSize: 13,
      fontFamily: "'Fira Code', 'Cascadia Code', 'JetBrains Mono', Consolas, monospace",
      theme: {
        background: '#000000',
        foreground: '#e4e4e7',
        cursor: '#ededed',
        cursorAccent: '#000000',
        selectionBackground: '#27272a',
        black: '#18181b',
        red: '#ef4444',
        green: '#22c55e',
        yellow: '#eab308',
        blue: '#3b82f6',
        magenta: '#a855f7',
        cyan: '#06b6d4',
        white: '#f4f4f5',
        brightBlack: '#52525b',
        brightRed: '#f87171',
        brightGreen: '#4ade80',
        brightYellow: '#fde047',
        brightBlue: '#60a5fa',
        brightMagenta: '#c084fc',
        brightCyan: '#22d3ee',
        brightWhite: '#ffffff',
      },
    });

    const fit = new FitAddon();
    term.loadAddon(fit);
    term.loadAddon(new WebLinksAddon());

    term.open(terminalRef.current);

    xtermInstance.current = term;
    fitAddon.current = fit;

    // The header row above the terminal changes the container's settled size
    // slightly after mount, so fit() right away can compute 0/near-0 rows and
    // leave the terminal effectively dead. Retry on the next frame once layout
    // has actually settled, and swallow any transient fit() errors.
    try {
      fit.fit();
    } catch {}
    requestAnimationFrame(() => {
      try {
        fit.fit();
        if (isActive) term.focus();
      } catch {}
    });

    // Initialize backend PTY
    if (window.warpApi) {
      window.warpApi.createTerminal({
        id: session.id,
        command: session.command,
        cwd: session.cwd,
        cols: term.cols,
        rows: term.rows,
      });

      // Stream data from backend to terminal
      const unsubscribeData = window.warpApi.onTerminalData(({ id, data }: { id: string; data: string }) => {
        if (id === session.id) {
          term.write(data);

          // Error sniffer for self-correction trigger
          const errorPattern =
            /(?:error\s+TS\d+:|TS\d{4}:|FAIL\s+|Tests:\s+\d+\s+failed|AssertionError|Traceback \(most recent call last\):|error\[E\d+\]:|npm ERR!)/i;
          if (errorPattern.test(data)) {
            const escapeCodePattern = /\x1B\[[0-9;?]*[ -\/]*[@-~]/g;
            const clean = data.replace(escapeCodePattern, '');
            if (clean.trim().length > 20) {
              setDetectedError(clean.trim());
            }
          }
        }
      });

      // ---- Shell command blocks --------------------------------------------
      // The shell prompt is replaced (see PtyManager) by an invisible
      // OSC 633;D;<exitCode>;<cwd> marker plus a newline. That gives every
      // command two reserved rows: a header row painted by us as an xterm
      // decoration ("<cwd> (elapsed)") and the row where the shell echoes the
      // command. The marker also tells us when a command finished, so the dock
      // can hide while a program (e.g. claude) owns the terminal.
      interface Block {
        marker: IMarker;
        deco?: IDecoration;
        el?: HTMLElement;
        label?: HTMLElement;
        actions?: HTMLElement;
        startedAt: number;
        cwd: string;
        running: boolean;
        exitCode: number | null;
        endLine: number;
        endMs?: number;
        command?: string;
        rows: number;
      }

      const BUSY_DELAY_MS = 250;
      let pendingMarker: IMarker | null = null;
      let active: Block | null = null;
      let currentCwd = session.cwd || '';
      let hadInput = false;
      let ready = false;
      const queued: string[] = [];
      const blocks: Block[] = [];
      let busyTimer: ReturnType<typeof setTimeout> | undefined;
      let tickTimer: ReturnType<typeof setInterval> | undefined;

      // The command the shell has echoed on the row(s) right after the prompt
      // marker, i.e. what is about to be executed (handles Tab completion, history
      // recall and wrapped lines, which raw keystroke tracking can't).
      const readEcho = (): string => {
        const m = pendingMarker;
        if (!m || m.isDisposed) return '';
        const buf = term.buffer.active;
        const last = buf.baseY + buf.cursorY;
        let out = '';
        for (let i = m.line + 1; i <= last; i++) {
          const line = buf.getLine(i);
          if (!line) break;
          const nextWraps = buf.getLine(i + 1)?.isWrapped && i < last;
          out += line.translateToString(!nextWraps);
          if (i < last && !nextWraps) out += '\n';
        }
        return out.trim();
      };

      // Rows the shell needs for the echoed command: header row + wrapped echo rows.
      const headerRows = (command?: string) => {
        if (!command) return 2;
        const echo = command.split('\n').reduce((n, l) => n + Math.max(1, Math.ceil(l.length / term.cols)), 0);
        return 1 + echo;
      };

      // Agent CLIs (claude/agy/codex) own the whole pane: the dock is removed
      // outright instead of leaving a placeholder strip. That changes the terminal's
      // height, so it is done BEFORE the command is sent - resizing under a running
      // TUI would make ConPTY repaint and shift everything.
      const AGENT_RE = /^(claude|agy|codex)(\s|$)/i;
      const AGENT_SETTLE_MS = 300;
      let agentRunning = false;
      let agentLaunching = false;

      const reportState = (busy: boolean) =>
        onSessionStateRef.current?.(session.id, { busy, cwd: currentCwd, agent: agentRunning });

      const launchAgent = (command: string, send: () => void) => {
        agentLaunching = true;
        agentRunning = true;
        reportState(true);
        setTimeout(() => {
          agentLaunching = false;
          send();
          startBlock(command);
          term.focus();
        }, AGENT_SETTLE_MS);
      };

      const blockText = (b: Block): string => {
        const first = b.marker.line + b.rows;
        const lines: string[] = [];
        for (let i = first; i < b.endLine; i++) {
          lines.push(term.buffer.active.getLine(i)?.translateToString(true) ?? '');
        }
        return lines.join('\n').trim();
      };

      const paintLabel = (b: Block) => {
        if (!b.label) return;
        // Running: whole seconds, updated once a second (kept quiet on purpose);
        // finished: the precise duration.
        const label = formatCwdLabel(b.cwd);
        const ms = b.running ? Date.now() - b.startedAt : b.endMs ?? 0;
        b.label.textContent =
          b.running && ms < 1000 ? label : `${label} (${formatElapsed(ms, b.running)})`;
      };

      const addAction = (b: Block, title: string, html: string, onClick: () => void) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.title = title;
        btn.innerHTML = html;
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          onClick();
        });
        b.actions?.appendChild(btn);
      };

      const refreshHeader = (b: Block) => {
        if (!b.el || !b.actions) return;
        b.el.classList.toggle('is-running', b.running);
        b.el.classList.toggle('is-failed', !b.running && b.exitCode !== null && b.exitCode !== 0);
        b.actions.replaceChildren();
        if (b.running) return;
        addAction(
          b,
          'Copy output',
          '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>',
          () => void navigator.clipboard.writeText(blockText(b))
        );
        if (b.exitCode !== null && b.exitCode !== 0) {
          addAction(b, 'Fix with Claude', 'Fix', () =>
            onPipeErrorRef.current('claude', `A shell command failed (exit ${b.exitCode}). Output:\n${blockText(b)}`)
          );
        }
      };

      const buildHeader = (b: Block, el: HTMLElement) => {
        el.classList.add('dx-block-header');
        el.style.width = '100%';
        const rowPx = parseFloat(el.style.height) / b.rows;
        if (rowPx > 0) el.style.setProperty('--dx-row', `${rowPx}px`);
        if (b.el === el) return;
        b.el = el;
        el.replaceChildren();
        const label = document.createElement('div');
        label.className = 'dx-label';
        b.label = label;
        const actions = document.createElement('div');
        actions.className = 'dx-actions';
        b.actions = actions;
        el.append(label);
        if (b.command) {
          // Opaque header + our own command text: the shell's echo underneath is hidden.
          el.classList.add('has-cmd');
          const cmd = document.createElement('div');
          cmd.className = 'dx-cmd';
          cmd.textContent = b.command;
          el.append(cmd);
        }
        el.append(actions);
        paintLabel(b);
        refreshHeader(b);
      };

      const attachHeader = (b: Block) => {
        b.el = undefined;
        b.deco = term.registerDecoration({ marker: b.marker, x: 0, width: term.cols, height: b.rows });
        b.deco?.onRender((el) => buildHeader(b, el));
      };

      const startBlock = (command?: string) => {
        if (active) return;
        command = command || readEcho() || undefined;
        const marker =
          pendingMarker && !pendingMarker.isDisposed ? pendingMarker : term.registerMarker(-1);
        pendingMarker = null;
        if (!marker) return;

        const b: Block = {
          marker,
          startedAt: Date.now(),
          cwd: currentCwd,
          running: true,
          exitCode: null,
          endLine: marker.line + headerRows(command),
          command,
          rows: headerRows(command),
        };
        active = b;
        blocks.push(b);
        attachHeader(b);

        clearInterval(tickTimer);
        tickTimer = setInterval(() => active && paintLabel(active), 1000);

        busyTimer = setTimeout(() => {
          if (active !== b) return;
          reportState(true);
          term.focus();
        }, BUSY_DELAY_MS);
      };

      const endBlock = (exitCode: number) => {
        clearTimeout(busyTimer);
        clearInterval(tickTimer);
        const b = active;
        active = null;
        if (!b) return;
        b.running = false;
        b.exitCode = exitCode;
        b.endMs = Date.now() - b.startedAt;
        b.endLine = term.buffer.active.baseY + term.buffer.active.cursorY;
        paintLabel(b);
        refreshHeader(b);
      };

      // `clear` wipes the screen and scrollback. Stale headers would be left
      // floating over blank rows, so drop them and re-anchor the clear block
      // itself (its echoed command is gone) at the top, painting the command in the header.
      const relocateAfterClear = () => {
        for (const b of blocks) if (b !== active) b.deco?.dispose();
        blocks.length = 0;
        pendingMarker?.dispose();
        pendingMarker = null;
        const b = active;
        if (!b) return;
        b.deco?.dispose();
        b.marker.dispose();
        const marker = term.registerMarker(0);
        if (!marker) return;
        b.marker = marker;
        b.command = b.command || 'clear';
        b.rows = 2;
        attachHeader(b);
        blocks.push(b);
      };

      const submitCommand = (command: string) => {
        if (!ready) {
          queued.push(command);
          return;
        }
        hadInput = true;
        if (!active && !agentLaunching && AGENT_RE.test(command.trim())) {
          launchAgent(command, () => window.warpApi.writeTerminal(session.id, command + '\r'));
          return;
        }
        window.warpApi.writeTerminal(session.id, command + '\r');
        startBlock(command);
      };

      if (isShellSession) {
        term.parser.registerOscHandler(633, (payload) => {
          const [kind, code, ...rest] = payload.split(';');
          if (kind === 'E') {
            relocateAfterClear();
            return true;
          }
          if (kind !== 'D') return false;
          if (rest.length) currentCwd = rest.join(';');
          endBlock(Number(code) || 0);
          agentRunning = false;
          pendingMarker?.dispose();
          pendingMarker = term.registerMarker(0) ?? null;
          reportState(false);
          if (!ready) {
            ready = true;
            // Commands submitted before the first prompt (e.g. launching an agent
            // into a fresh session) run now that the shell is listening.
            queueMicrotask(() => queued.splice(0).forEach(submitCommand));
          }
          return true;
        });

        submitCommandRef.current = submitCommand;
      }

      // Stream user input straight through to the backend PTY. For shell
      // sessions also notice a command being submitted straight from the terminal
      // (as opposed to BottomCommandDock) so its block header opens too.
      term.onData((data) => {
        const idle = isShellSession && !active && !agentLaunching;

        // Enter on a typed agent command: hold it until the dock is gone and the
        // terminal has settled at its final size (see launchAgent).
        if (idle && data === '\r') {
          const command = readEcho();
          if (AGENT_RE.test(command)) {
            hadInput = false;
            launchAgent(command, () => window.warpApi.writeTerminal(session.id, '\r'));
            return;
          }
        }

        window.warpApi.writeTerminal(session.id, data);

        if (!isShellSession || active) return;

        const printable = data
          .replace(/\x1b\[[0-9;?]*[A-Za-z~]/g, '')
          .replace(/[\r\n\x7f\x03\t]/g, '');
        if (data.includes('\r')) {
          // An empty Enter echoes nothing; readEcho is the source of truth, with
          // keystroke tracking only as a fallback when the echo hasn't rendered yet.
          if (readEcho() || hadInput || printable.length > 0) startBlock();
          hadInput = false;
        } else if (data === '\x03') {
          hadInput = false;
        } else if (printable.length > 0 || /\x1b\[[AB]/.test(data)) {
          hadInput = true;
        }
      });

      // Handle ResizeObserver
      const resizeObserver = new ResizeObserver(() => {
        try {
          fit.fit();
          window.warpApi.resizeTerminal(session.id, term.cols, term.rows);
        } catch {}
      });
      resizeObserver.observe(terminalRef.current);

      // Web fonts (index.html) can finish loading after the terminal measured its
      // cell size. The stale metrics leave the row count too high for the pane and
      // the bottom rows clipped, and nothing resizes so nothing refits. Re-measure
      // (xterm only re-measures when the option value changes) and refit.
      const remeasure = () => {
        try {
          const family = term.options.fontFamily || '';
          term.options.fontFamily = family.endsWith(' ') ? family.trimEnd() : family + ' ';
          fit.fit();
          window.warpApi.resizeTerminal(session.id, term.cols, term.rows);
        } catch {}
      };
      document.fonts?.addEventListener('loadingdone', remeasure);
      void document.fonts?.ready.then(remeasure);

      return () => {
        document.fonts?.removeEventListener('loadingdone', remeasure);
        clearTimeout(busyTimer);
        submitCommandRef.current = null;
        unsubscribeData();
        resizeObserver.disconnect();
        window.warpApi.killTerminal(session.id);
        term.dispose();
      };
    }

    return () => {
      term.dispose();
    };
  }, [session.id]);

  useEffect(() => {
    if (isActive && xtermInstance.current) {
      xtermInstance.current.focus();
    }
  }, [isActive]);

  return (
    <div
      onClick={() => {
        onFocus();
        xtermInstance.current?.focus();
      }}
      className={`group relative flex flex-col h-full w-full min-h-0 min-w-0 bg-base-app overflow-hidden ${
        isSplitView && isActive ? 'ring-1 ring-inset ring-accent-border' : ''
      }`}
    >
      {isShellSession ? (
        /* Shell sessions: no external header — per-command "~ <cwd>" markers
           are injected straight into the terminal's own scrollback instead
           (see the OSC 633 block manager), so the pane stays full-bleed. Controls float
           in the corner on hover only. */
        isSplitView && <div className="absolute top-2 right-2 z-20 flex items-center gap-0.5 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity bg-black/70 backdrop-blur-sm rounded-md border border-zinc-800/70 p-0.5">
          <button
            onClick={(e) => {
              e.stopPropagation();
              onSplit('h');
            }}
            className="p-1 rounded text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 transition-colors"
            title="Split Pane Horizontally (Ctrl+Shift+D)"
          >
            <SplitSquareHorizontal size={12} />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onSplit('v');
            }}
            className="p-1 rounded text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 transition-colors"
            title="Split Pane Vertically (Ctrl+Shift+E)"
          >
            <SplitSquareVertical size={12} />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onClose();
            }}
            className="p-1 rounded text-zinc-400 hover:text-red-400 hover:bg-red-500/10 transition-colors"
            title="Close Pane (Ctrl+Shift+W)"
          >
            <X size={12} />
          </button>
        </div>
      ) : (
        /* Thin header for standalone agent panes (squads): bold command, no counter.
            The whole agent session is one long-running block, since it's a single
            command (claude/agy/codex) whose own interactive UI streams below. */
        <div className="relative flex-shrink-0 px-4 pt-2.5 pb-1.5 border-b border-zinc-900/80">
          <div className="text-[13px] font-semibold text-zinc-100 font-mono">
            {session.command || session.title}
          </div>

          {/* Pane controls — hidden by default, appear on hover, anchored to the header
              so they don't float over live terminal content below */}
          <div className="absolute top-1.5 right-3 z-20 flex items-center gap-0.5 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity bg-black/70 backdrop-blur-sm rounded-md border border-zinc-800/70 p-0.5">
            <button
              onClick={(e) => {
                e.stopPropagation();
                onSplit('h');
              }}
              className="p-1 rounded text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 transition-colors"
              title="Split Pane Horizontally (Ctrl+Shift+D)"
            >
              <SplitSquareHorizontal size={12} />
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onSplit('v');
              }}
              className="p-1 rounded text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 transition-colors"
              title="Split Pane Vertically (Ctrl+Shift+E)"
            >
              <SplitSquareVertical size={12} />
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onClose();
              }}
              className="p-1 rounded text-zinc-400 hover:text-red-400 hover:bg-red-500/10 transition-colors"
              title="Close Pane (Ctrl+Shift+W)"
            >
              <X size={12} />
            </button>
          </div>
        </div>
      )}

      {/* Floating Error Sniffer & Self-Correction Banner */}
      {detectedError && (
        <div className="bg-amber-950/85 border-b border-amber-500/40 px-3 py-2 text-xs flex items-center justify-between text-amber-200 z-10 animate-slide-in-up shadow-[0_4px_20px_rgba(245,158,11,0.15)]">
          <div className="flex items-center space-x-2 min-w-0">
            <div className="p-1 rounded-md bg-amber-500/20 text-amber-300">
              <AlertTriangle size={14} className="" />
            </div>
            <span className="font-semibold text-[11px]">Self-Correction Sniffer:</span>
            <span className="font-mono text-[10px] text-amber-300/90 truncate max-w-sm">
              {detectedError.slice(0, 65)}...
            </span>
          </div>

          <div className="flex items-center space-x-1.5 flex-shrink-0">
            <button
              onClick={() => {
                onPipeErrorToAgent('claude', detectedError);
                setDetectedError(null);
              }}
              className="flex items-center space-x-1 px-3 py-1 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-500/40 text-emerald-200 text-[11px] font-semibold transition-all shadow-sm"
              title="Send this error trace directly to Claude Code to fix"
            >
              <Sparkles size={11} />
              <span>Fix with Claude Code</span>
            </button>
            <button
              onClick={() => setDetectedError(null)}
              className="p-1 rounded-md text-amber-400 hover:text-zinc-100 hover:bg-zinc-800 transition-colors ml-1"
              title="Dismiss"
            >
              <X size={12} />
            </button>
          </div>
        </div>
      )}

      {/* Interactive Terminal Canvas — full-bleed, no padding */}
      <div ref={terminalRef} className="flex-1 min-h-0 min-w-0 w-full overflow-hidden bg-base-app" />
    </div>
  );
};
