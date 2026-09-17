import React, { useState } from 'react';
import { Terminal, Send, Sparkles, Shield, Bot, CheckCircle2, GitBranch, CornerDownLeft } from 'lucide-react';
import type { TerminalSession } from '../types/warp.js';

interface BottomCommandDockProps {
  activeSession: TerminalSession | null;
  onSendInput: (text: string) => void;
}

export const BottomCommandDock: React.FC<BottomCommandDockProps> = ({
  activeSession,
  onSendInput,
}) => {
  const [input, setInput] = useState('');

  const handleSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!input.trim() || !activeSession) return;
    onSendInput(input + '\r');
    setInput('');
  };

  return (
    <div className="h-13 bg-[#090b12]/90 backdrop-blur-xl border-t border-white/[0.08] flex items-center justify-between px-4 py-2 select-none flex-shrink-0 z-20 shadow-[0_-10px_30px_rgba(0,0,0,0.4)]">
      {/* Left: Active Session Indicator */}
      <div className="flex items-center space-x-2.5 min-w-0">
        <span className="text-[10px] font-mono text-slate-500 uppercase tracking-wider">
          Target:
        </span>
        {activeSession ? (
          <div className="flex items-center space-x-2 px-2.5 py-1 rounded-lg bg-white/[0.04] border border-white/[0.09] text-slate-200 font-mono text-xs shadow-sm">
            <span className="w-2 h-2 rounded-full bg-cyan-400 shadow-[0_0_8px_#00d8ff] animate-pulse" />
            <span className="font-semibold">{activeSession.title}</span>
          </div>
        ) : (
          <span className="text-xs text-slate-500 italic">Select a terminal pane</span>
        )}
      </div>

      {/* Center Quick Commands */}
      <div className="flex items-center space-x-2">
        <button
          onClick={() => onSendInput('claude\r')}
          className="flex items-center space-x-1.5 px-2.5 py-1 rounded-lg bg-purple-500/10 hover:bg-purple-500/20 border border-purple-500/25 text-purple-200 text-xs font-mono transition-all hover:scale-105 active:scale-95 shadow-sm"
          title="Type 'claude' in active terminal"
        >
          <Sparkles size={11} className="text-purple-400" />
          <span>claude</span>
        </button>

        <button
          onClick={() => onSendInput('agy\r')}
          className="flex items-center space-x-1.5 px-2.5 py-1 rounded-lg bg-cyan-500/10 hover:bg-cyan-500/20 border border-cyan-500/25 text-cyan-200 text-xs font-mono transition-all hover:scale-105 active:scale-95 shadow-sm"
          title="Type 'agy' in active terminal"
        >
          <Shield size={11} className="text-cyan-400" />
          <span>agy</span>
        </button>

        <button
          onClick={() => onSendInput('codex\r')}
          className="flex items-center space-x-1.5 px-2.5 py-1 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/25 text-emerald-200 text-xs font-mono transition-all hover:scale-105 active:scale-95 shadow-sm"
          title="Type 'codex' in active terminal"
        >
          <Bot size={11} className="text-emerald-400" />
          <span>codex</span>
        </button>

        <button
          onClick={() => onSendInput('npm test\r')}
          className="flex items-center space-x-1.5 px-2.5 py-1 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.08] text-slate-300 text-xs font-mono transition-all hover:scale-105 active:scale-95"
          title="Run test suite"
        >
          <CheckCircle2 size={11} className="text-emerald-400" />
          <span>npm test</span>
        </button>

        <button
          onClick={() => onSendInput('git status\r')}
          className="flex items-center space-x-1.5 px-2.5 py-1 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.08] text-slate-300 text-xs font-mono transition-all hover:scale-105 active:scale-95"
          title="Check git status"
        >
          <GitBranch size={11} className="text-amber-400" />
          <span>git status</span>
        </button>
      </div>

      {/* Right: Inline Input */}
      <form onSubmit={handleSubmit} className="flex items-center space-x-2">
        <div className="relative flex items-center">
          <span className="absolute left-2.5 text-cyan-400 font-mono text-xs select-none">❯</span>
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            disabled={!activeSession}
            placeholder={activeSession ? 'Send input to terminal...' : 'Select a terminal first'}
            className="w-80 glass-input rounded-xl pl-7 pr-3 py-1.5 text-slate-200 text-xs font-mono placeholder:text-slate-500 focus:outline-none focus:border-cyan-500/60 transition-all shadow-inner"
          />
        </div>
        <button
          type="submit"
          disabled={!input.trim() || !activeSession}
          className="flex items-center space-x-1 px-3 py-1.5 rounded-xl bg-gradient-to-r from-cyan-500 to-indigo-600 hover:from-cyan-400 hover:to-indigo-500 disabled:opacity-30 disabled:cursor-not-allowed text-white text-xs font-medium transition-all shadow-[0_0_12px_rgba(0,216,255,0.25)] hover:scale-105 active:scale-95"
        >
          <Send size={11} />
          <CornerDownLeft size={10} className="text-cyan-200" />
        </button>
      </form>
    </div>
  );
};
