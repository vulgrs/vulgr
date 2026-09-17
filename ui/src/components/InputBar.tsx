import React, { useState, useRef, useEffect } from 'react';
import { Terminal, Sparkles, Shield, CheckCircle2, ArrowRight, CornerDownLeft } from 'lucide-react';

interface InputBarProps {
  onRunShell: (command: string) => void;
  onRunAi: (prompt: string, verify: boolean, dual: boolean) => void;
  isExecuting: boolean;
  primaryModel: string;
  reviewerModel: string;
}

export const InputBar: React.FC<InputBarProps> = ({
  onRunShell,
  onRunAi,
  isExecuting,
  primaryModel,
  reviewerModel,
}) => {
  const [mode, setMode] = useState<'shell' | 'ai'>('ai');
  const [input, setInput] = useState('');
  const [verifyEnabled, setVerifyEnabled] = useState(true);
  const [dualEnabled, setDualEnabled] = useState(true);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    textareaRef.current?.focus();
  }, [mode]);

  const handleSubmit = () => {
    const trimmed = input.trim();
    if (!trimmed || isExecuting) return;

    if (mode === 'shell') {
      onRunShell(trimmed);
    } else {
      onRunAi(trimmed, verifyEnabled, dualEnabled);
    }
    setInput('');
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    } else if (e.key === 'Tab' && input === '') {
      e.preventDefault();
      setMode(mode === 'shell' ? 'ai' : 'shell');
    }
  };

  return (
    <div className="p-3 bg-warp-surface/90 backdrop-blur-md border-t border-warp-border flex-shrink-0">
      <div className="max-w-5xl mx-auto rounded-xl bg-warp-card border border-warp-border shadow-2xl overflow-hidden focus-within:border-cyan-500/70 transition-all">
        {/* Top Controls Bar */}
        <div className="px-3 py-1.5 bg-warp-bg/80 border-b border-warp-border flex items-center justify-between text-xs select-none">
          {/* Mode Switcher */}
          <div className="flex items-center space-x-1 p-0.5 rounded-lg bg-warp-card border border-warp-border">
            <button
              onClick={() => setMode('ai')}
              className={`flex items-center space-x-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-all ${
                mode === 'ai'
                  ? 'bg-gradient-to-r from-purple-600 to-indigo-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Sparkles size={12} />
              <span>AI Orchestrate</span>
            </button>
            <button
              onClick={() => setMode('shell')}
              className={`flex items-center space-x-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-all ${
                mode === 'shell'
                  ? 'bg-gradient-to-r from-cyan-600 to-blue-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Terminal size={12} />
              <span>Shell Command</span>
            </button>
          </div>

          {/* AI Configuration Pills */}
          {mode === 'ai' ? (
            <div className="flex items-center space-x-2 text-[11px]">
              {/* Verify Toggle */}
              <button
                onClick={() => setVerifyEnabled(!verifyEnabled)}
                className={`flex items-center space-x-1 px-2 py-0.5 rounded-full border transition-all ${
                  verifyEnabled
                    ? 'bg-amber-950/60 border-amber-700/80 text-amber-300 font-medium'
                    : 'bg-warp-card border-warp-border text-slate-500'
                }`}
                title="Automatically runs compiler & tests, auto-fixing errors within 2 attempts"
              >
                <CheckCircle2 size={11} />
                <span>Self-Correction: {verifyEnabled ? 'ON' : 'OFF'}</span>
              </button>

              {/* Dual Review Toggle */}
              <button
                onClick={() => setDualEnabled(!dualEnabled)}
                className={`flex items-center space-x-1 px-2 py-0.5 rounded-full border transition-all ${
                  dualEnabled
                    ? 'bg-cyan-950/60 border-cyan-700/80 text-cyan-300 font-medium'
                    : 'bg-warp-card border-warp-border text-slate-500'
                }`}
                title="Cross-examines git diff with secondary model for security and leaks"
              >
                <Shield size={11} />
                <span>Adversarial Review: {dualEnabled ? 'ON' : 'OFF'}</span>
              </button>

              <span className="text-slate-500 font-mono text-[10px]">
                {primaryModel} {dualEnabled && `→ ${reviewerModel}`}
              </span>
            </div>
          ) : (
            <div className="text-[11px] text-slate-500 font-mono">
              Press <kbd className="px-1 py-0.5 bg-warp-surface rounded border border-warp-border text-slate-400">Tab</kbd> to toggle AI mode
            </div>
          )}
        </div>

        {/* Input Textarea Field */}
        <div className="flex items-end p-2.5 space-x-2">
          <div className="text-slate-400 pb-1.5 pl-1 font-mono text-sm select-none">
            {mode === 'ai' ? (
              <span className="text-purple-400 font-bold">⚡</span>
            ) : (
              <span className="text-cyan-400 font-bold">$</span>
            )}
          </div>

          <textarea
            ref={textareaRef}
            rows={1}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={isExecuting}
            placeholder={
              mode === 'ai'
                ? 'Ask AI to write code, fix a bug, or build a feature (e.g. "JWT refresh token servisi ekle")...'
                : 'Enter terminal command (e.g. "git status", "npm test", "ls -la")...'
            }
            className="flex-1 bg-transparent text-slate-100 text-xs font-mono placeholder:text-slate-500 focus:outline-none resize-none min-h-[28px] max-h-32 py-1 leading-relaxed"
          />

          <button
            onClick={handleSubmit}
            disabled={!input.trim() || isExecuting}
            className={`flex items-center space-x-1 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all shadow-md ${
              !input.trim() || isExecuting
                ? 'bg-warp-surface text-slate-500 border border-warp-border cursor-not-allowed'
                : mode === 'ai'
                ? 'bg-gradient-to-r from-purple-600 to-indigo-600 text-white hover:from-purple-500 hover:to-indigo-500'
                : 'bg-cyan-600 text-white hover:bg-cyan-500'
            }`}
          >
            <span>Execute</span>
            <CornerDownLeft size={12} />
          </button>
        </div>
      </div>
    </div>
  );
};
