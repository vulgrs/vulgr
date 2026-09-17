import React, { useEffect, useRef, useState } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import {
  Sparkles,
  Shield,
  Bot,
  Terminal as TerminalIcon,
  X,
  SplitSquareHorizontal,
  SplitSquareVertical,
  Wrench,
  AlertTriangle,
  Layers,
  Play,
} from 'lucide-react';
import { TerminalBlock } from './TerminalBlock.js';
import type { TerminalSession, SessionType, TerminalCommandBlock } from '../types/warp.js';

interface XtermPaneProps {
  session: TerminalSession;
  isActive: boolean;
  onFocus: () => void;
  onClose: () => void;
  onSplit: (direction: 'h' | 'v') => void;
  onPipeErrorToAgent: (targetType: 'claude' | 'agy' | 'codex', errorSnippet: string) => void;
}

export const XtermPane: React.FC<XtermPaneProps> = ({
  session,
  isActive,
  onFocus,
  onClose,
  onSplit,
  onPipeErrorToAgent,
}) => {
  const terminalRef = useRef<HTMLDivElement>(null);
  const xtermInstance = useRef<Terminal | null>(null);
  const fitAddon = useRef<FitAddon | null>(null);
  const [detectedError, setDetectedError] = useState<string | null>(null);

  const [viewMode, setViewMode] = useState<'terminal' | 'blocks'>('terminal');
  const [blocks, setBlocks] = useState<TerminalCommandBlock[]>(() => {
    if (session.command) {
      return [
        {
          id: `blk-${Date.now()}`,
          command: session.command,
          cwd: session.cwd,
          timestamp: new Date().toLocaleTimeString(),
          exitCode: 0,
          stdout: `Process "${session.command}" initialized. Streaming active output.`,
          stderr: '',
          isExecuting: false,
        },
      ];
    }
    return [];
  });

  const activeBlockRef = useRef<TerminalCommandBlock | null>(null);
  const inputLineRef = useRef<string>('');

  useEffect(() => {
    if (!terminalRef.current) return;

    const term = new Terminal({
      cursorBlink: true,
      cursorStyle: 'bar',
      fontSize: 13,
      fontFamily: "'Fira Code', 'Cascadia Code', 'JetBrains Mono', Consolas, monospace",
      theme: {
        background: '#0c0d12',
        foreground: '#e2e8f0',
        cursor: '#00d8ff',
        cursorAccent: '#0c0d12',
        selectionBackground: '#262a3b',
        black: '#14161f',
        red: '#ef4444',
        green: '#22c55e',
        yellow: '#f59e0b',
        blue: '#38bdf8',
        magenta: '#a855f7',
        cyan: '#00d8ff',
        white: '#f8fafc',
        brightBlack: '#475569',
        brightRed: '#f87171',
        brightGreen: '#4ade80',
        brightYellow: '#fbbf24',
        brightBlue: '#60a5fa',
        brightMagenta: '#c084fc',
        brightCyan: '#38bdf8',
        brightWhite: '#ffffff',
      },
    });

    const fit = new FitAddon();
    term.loadAddon(fit);
    term.loadAddon(new WebLinksAddon());

    term.open(terminalRef.current);
    fit.fit();

    xtermInstance.current = term;
    fitAddon.current = fit;

    // Initialize backend PTY
    if (window.warpApi) {
      window.warpApi.createTerminal({
        id: session.id,
        command: session.command,
        cwd: session.cwd,
        cols: term.cols,
        rows: term.rows,
      });

      // Stream data from backend to terminal & blocks
      const unsubscribeData = window.warpApi.onTerminalData(({ id, data }: { id: string; data: string }) => {
        if (id === session.id) {
          term.write(data);

          const clean = data.replace(/\x1B\[[0-?]*[ -/]*[@-~]/g, '');

          // Error sniffer for self-correction trigger
          if (
            /(?:error\s+TS\d+:|TS\d{4}:|FAIL\s+|Tests:\s+\d+\s+failed|AssertionError|Traceback \(most recent call last\):|error\[E\d+\]:|npm ERR!)/i.test(
              data
            )
          ) {
            if (clean.trim().length > 20) {
              setDetectedError(clean.trim());
            }
          }

          // Accumulate output into current active block if running
          if (activeBlockRef.current) {
            activeBlockRef.current.stdout += clean;
            if (/(?:FAIL|error\s+TS|npm ERR!|AssertionError)/i.test(clean)) {
              activeBlockRef.current.exitCode = 1;
              activeBlockRef.current.stderr += clean;
            } else if (/(?:PASS|0 failed|compiled successfully)/i.test(clean)) {
              activeBlockRef.current.exitCode = 0;
            }

            setBlocks((prev) =>
              prev.map((b) => (b.id === activeBlockRef.current?.id ? { ...activeBlockRef.current } : b))
            );
          }
        }
      });

      // Stream user input from terminal to backend PTY & capture command blocks
      term.onData((data) => {
        window.warpApi.writeTerminal(session.id, data);

        if (data === '\r' || data === '\n') {
          const cmd = inputLineRef.current.trim();
          if (cmd) {
            const newBlock: TerminalCommandBlock = {
              id: `blk-${Date.now()}`,
              command: cmd,
              cwd: session.cwd,
              timestamp: new Date().toLocaleTimeString(),
              exitCode: null,
              stdout: '',
              stderr: '',
              isExecuting: true,
            };
            activeBlockRef.current = newBlock;
            setBlocks((prev) => [...prev, newBlock]);
            inputLineRef.current = '';
          }
        } else if (data === '\u007f' || data === '\b') {
          inputLineRef.current = inputLineRef.current.slice(0, -1);
        } else if (data.length === 1 && data >= ' ') {
          inputLineRef.current += data;
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

      return () => {
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

  const handleRerun = (cmd: string) => {
    if (window.warpApi) {
      window.warpApi.writeTerminal(session.id, cmd + '\r');
      setViewMode('terminal');
    }
  };

  const handleExplainWithClaude = (cmd: string, output: string) => {
    const prompt = `Please explain this command and output:\n\`\`\`sh\n$ ${cmd}\n\`\`\`\nOutput:\n\`\`\`\n${output.slice(
      0,
      2000
    )}\n\`\`\``;
    onPipeErrorToAgent('claude', prompt);
  };

  const handleFixWithAgy = (cmd: string, errorSnippet: string) => {
    const prompt = `The command '$ ${cmd}' failed with:\n\`\`\`\n${errorSnippet.slice(
      0,
      2000
    )}\n\`\`\`\nPlease diagnose and repair this error.`;
    onPipeErrorToAgent('agy', prompt);
  };

  const getSessionBadge = (type: SessionType) => {
    switch (type) {
      case 'claude':
        return {
          icon: <Sparkles size={12} className="text-purple-400 animate-pulse" />,
          label: 'Claude Code',
          color: 'border-purple-500/40 bg-purple-500/10 text-purple-200 shadow-[0_0_10px_rgba(168,85,247,0.15)]',
          dot: 'bg-purple-400',
        };
      case 'agy':
        return {
          icon: <Shield size={12} className="text-cyan-400" />,
          label: 'AGY Engine',
          color: 'border-cyan-500/40 bg-cyan-500/10 text-cyan-200 shadow-[0_0_10px_rgba(0,216,255,0.15)]',
          dot: 'bg-cyan-400',
        };
      case 'codex':
        return {
          icon: <Bot size={12} className="text-emerald-400" />,
          label: 'Codex CLI',
          color: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-200 shadow-[0_0_10px_rgba(34,197,94,0.15)]',
          dot: 'bg-emerald-400',
        };
      case 'shell':
      default:
        return {
          icon: <TerminalIcon size={12} className="text-slate-300" />,
          label: 'Terminal',
          color: 'border-white/[0.1] bg-white/[0.05] text-slate-200',
          dot: 'bg-slate-400',
        };
    }
  };

  const badge = getSessionBadge(session.type);

  return (
    <div
      onClick={onFocus}
      className={`flex flex-col h-full w-full rounded-xl overflow-hidden border transition-all duration-200 ${
        isActive
          ? 'border-cyan-500/50 shadow-[0_0_24px_rgba(0,216,255,0.1)] ring-1 ring-cyan-500/20 bg-[#08090f]'
          : 'border-white/[0.07] hover:border-white/[0.14] bg-[#090b12]/80 backdrop-blur-md'
      }`}
    >
      {/* Sleek Pane Chrome / Header */}
      <div className="h-9 bg-white/[0.03] backdrop-blur-md border-b border-white/[0.06] flex items-center justify-between px-3 select-none text-xs">
        {/* Left: Traffic light subtle dots & Session info */}
        <div className="flex items-center space-x-2.5">
          {/* Subtle Window Dots */}
          <div className="flex items-center space-x-1.5 pr-1">
            <span
              onClick={(e) => {
                e.stopPropagation();
                onClose();
              }}
              className="w-2.5 h-2.5 rounded-full bg-[#ff5f56]/70 hover:bg-[#ff5f56] transition-colors cursor-pointer"
              title="Close Pane"
            />
            <span
              onClick={(e) => {
                e.stopPropagation();
                onSplit('h');
              }}
              className="w-2.5 h-2.5 rounded-full bg-[#ffbd2e]/70 hover:bg-[#ffbd2e] transition-colors cursor-pointer"
              title="Split Horizontal"
            />
            <span
              onClick={(e) => {
                e.stopPropagation();
                onSplit('v');
              }}
              className="w-2.5 h-2.5 rounded-full bg-[#27c93f]/70 hover:bg-[#27c93f] transition-colors cursor-pointer"
              title="Split Vertical"
            />
          </div>

          {/* Model / CLI Badge */}
          <div className={`flex items-center space-x-1.5 px-2.5 py-0.5 rounded-lg border ${badge.color}`}>
            {badge.icon}
            <span className="font-semibold text-[11px] font-sans">{badge.label}</span>
          </div>

          {/* Command or Title Breadcrumb */}
          <span className="font-mono text-[11px] text-slate-400 truncate max-w-[160px]">
            {session.command ? `$ ${session.command}` : session.title}
          </span>

          {/* Warp View Switcher: Terminal vs Blocks */}
          <div className="flex items-center p-0.5 rounded-lg bg-white/[0.04] border border-white/[0.08] ml-2">
            <button
              onClick={(e) => {
                e.stopPropagation();
                setViewMode('terminal');
              }}
              className={`flex items-center space-x-1 px-2 py-0.5 rounded-md text-[10px] font-medium transition-all ${
                viewMode === 'terminal'
                  ? 'bg-white/[0.1] text-white shadow-sm font-semibold'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
              title="Interactive Terminal Emulator"
            >
              <TerminalIcon size={10} />
              <span>Terminal</span>
            </button>

            <button
              onClick={(e) => {
                e.stopPropagation();
                setViewMode('blocks');
              }}
              className={`flex items-center space-x-1 px-2 py-0.5 rounded-md text-[10px] font-medium transition-all ${
                viewMode === 'blocks'
                  ? 'bg-cyan-500/20 text-cyan-200 border border-cyan-500/30 shadow-sm font-semibold'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
              title="Warp Command Blocks Stream"
            >
              <Layers size={10} />
              <span>Blocks ({blocks.length})</span>
            </button>
          </div>
        </div>

        {/* Right: Quick Action Icons */}
        <div className="flex items-center space-x-1 text-slate-400">
          <button
            onClick={(e) => {
              e.stopPropagation();
              onSplit('h');
            }}
            className="p-1 rounded-md hover:text-white hover:bg-white/[0.08] transition-colors"
            title="Split Pane Horizontally (Ctrl+Shift+D)"
          >
            <SplitSquareHorizontal size={13} />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onSplit('v');
            }}
            className="p-1 rounded-md hover:text-white hover:bg-white/[0.08] transition-colors"
            title="Split Pane Vertically (Ctrl+Shift+E)"
          >
            <SplitSquareVertical size={13} />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onClose();
            }}
            className="p-1 rounded-md hover:text-red-400 hover:bg-red-500/10 transition-colors"
            title="Close Terminal Pane (Ctrl+Shift+W)"
          >
            <X size={13} />
          </button>
        </div>
      </div>

      {/* Floating Error Sniffer & Self-Correction Banner */}
      {detectedError && (
        <div className="bg-amber-950/85 border-b border-amber-500/40 px-3 py-2 text-xs flex items-center justify-between text-amber-200 backdrop-blur-lg z-10 animate-in slide-in-from-top-2 duration-150 shadow-[0_4px_20px_rgba(245,158,11,0.15)]">
          <div className="flex items-center space-x-2 min-w-0">
            <div className="p-1 rounded-md bg-amber-500/20 text-amber-300">
              <AlertTriangle size={14} className="animate-pulse" />
            </div>
            <span className="font-semibold text-[11px]">Self-Correction Sniffer:</span>
            <span className="font-mono text-[10px] text-amber-300/90 truncate max-w-sm">
              {detectedError.slice(0, 65)}...
            </span>
          </div>

          <div className="flex items-center space-x-1.5 flex-shrink-0">
            <span className="text-[10px] text-amber-400/80 font-sans mr-0.5">Repair with:</span>
            <button
              onClick={() => {
                onPipeErrorToAgent('claude', detectedError);
                setDetectedError(null);
              }}
              className="flex items-center space-x-1 px-2.5 py-1 rounded-lg bg-purple-600/30 hover:bg-purple-600/50 border border-purple-500/50 text-purple-200 text-[10px] font-semibold transition-all shadow-sm"
            >
              <Sparkles size={10} />
              <span>Claude</span>
            </button>
            <button
              onClick={() => {
                onPipeErrorToAgent('agy', detectedError);
                setDetectedError(null);
              }}
              className="flex items-center space-x-1 px-2.5 py-1 rounded-lg bg-cyan-600/30 hover:bg-cyan-600/50 border border-cyan-500/50 text-cyan-200 text-[10px] font-semibold transition-all shadow-sm"
            >
              <Shield size={10} />
              <span>AGY</span>
            </button>
            <button
              onClick={() => {
                onPipeErrorToAgent('codex', detectedError);
                setDetectedError(null);
              }}
              className="flex items-center space-x-1 px-2.5 py-1 rounded-lg bg-emerald-600/30 hover:bg-emerald-600/50 border border-emerald-500/50 text-emerald-200 text-[10px] font-semibold transition-all shadow-sm"
            >
              <Bot size={10} />
              <span>Codex</span>
            </button>
            <button
              onClick={() => setDetectedError(null)}
              className="p-1 rounded-md text-amber-400 hover:text-white hover:bg-white/[0.08] transition-colors ml-1"
              title="Dismiss"
            >
              <X size={12} />
            </button>
          </div>
        </div>
      )}

      {/* View 1: Blocks Stream */}
      {viewMode === 'blocks' && (
        <div className="flex-1 w-full h-full p-3 overflow-y-auto space-y-3 bg-[#07080c] select-text">
          {blocks.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center p-6 text-slate-500">
              <div className="w-12 h-12 rounded-xl bg-white/[0.03] border border-white/[0.08] flex items-center justify-center text-cyan-400 mb-2">
                <Layers size={20} />
              </div>
              <p className="text-xs font-semibold text-slate-300">Warp Command Blocks Stream</p>
              <p className="text-[11px] text-slate-500 mt-1 max-w-xs">
                Each command you execute creates an isolated block with execution time, exit code, and 1-click AI actions (Explain with Claude / Fix with AGY).
              </p>
              <div className="flex items-center space-x-2 mt-4">
                <button
                  onClick={() => handleRerun('npm test')}
                  className="flex items-center space-x-1 px-2.5 py-1 rounded-lg bg-white/[0.05] hover:bg-white/[0.1] border border-white/[0.08] text-slate-300 text-xs font-mono"
                >
                  <Play size={10} className="text-cyan-400" />
                  <span>Run 'npm test'</span>
                </button>
                <button
                  onClick={() => handleRerun('git status')}
                  className="flex items-center space-x-1 px-2.5 py-1 rounded-lg bg-white/[0.05] hover:bg-white/[0.1] border border-white/[0.08] text-slate-300 text-xs font-mono"
                >
                  <Play size={10} className="text-amber-400" />
                  <span>Run 'git status'</span>
                </button>
              </div>
            </div>
          ) : (
            blocks.map((b) => (
              <TerminalBlock
                key={b.id}
                block={b}
                onExplainWithClaude={handleExplainWithClaude}
                onFixWithAgy={handleFixWithAgy}
                onRerunCommand={handleRerun}
              />
            ))
          )}
        </div>
      )}

      {/* View 2: Interactive Terminal Canvas */}
      <div
        ref={terminalRef}
        className={
          viewMode === 'terminal'
            ? 'flex-1 w-full h-full p-2 overflow-hidden bg-[#07080c]'
            : 'hidden'
        }
      />
    </div>
  );
};
