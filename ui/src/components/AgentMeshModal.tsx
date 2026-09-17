import React, { useState, useEffect, useRef } from 'react';
import {
  Sparkles,
  Shield,
  Bot,
  Terminal,
  CheckCircle2,
  AlertTriangle,
  X,
  Send,
  Loader2,
  ArrowRight,
  RefreshCw,
} from 'lucide-react';

export interface AgentMessage {
  id: string;
  runId: string;
  from: 'claude' | 'agy' | 'gemini' | 'codex' | 'orchestrator';
  to: 'claude' | 'agy' | 'gemini' | 'codex' | 'broadcast';
  type: string;
  payload: {
    summary: string;
    details?: string;
    gitDiff?: string;
    errorTrace?: string;
    filesChanged?: string[];
  };
  timestamp: string;
}

interface AgentMeshModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const AgentMeshModal: React.FC<AgentMeshModalProps> = ({ isOpen, onClose }) => {
  const [goal, setGoal] = useState('');
  const [builder, setBuilder] = useState('claude');
  const [verifier, setVerifier] = useState('agy');
  const [auditor, setAuditor] = useState('gemini');
  const [isRunning, setIsRunning] = useState(false);
  const [messages, setMessages] = useState<AgentMessage[]>([]);
  const [isCompleted, setIsCompleted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const feedEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    feedEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    if (!window.warpApi) return;

    const unsubscribe = window.warpApi.onMeshEvent((msg: AgentMessage) => {
      setMessages((prev) => [...prev, msg]);
      if (msg.type === 'CONSENSUS_APPROVED') {
        setIsCompleted(true);
        setIsRunning(false);
      }
    });

    return () => unsubscribe();
  }, []);

  if (!isOpen) return null;

  const handleStartMesh = async () => {
    if (!goal.trim() || isRunning) return;

    setIsRunning(true);
    setMessages([]);
    setIsCompleted(false);
    setError(null);

    try {
      await window.warpApi.runAgentMesh({
        goal: goal.trim(),
        builder,
        verifier,
        auditor,
      });
    } catch (err: any) {
      setError(err.message || String(err));
      setIsRunning(false);
    }
  };

  const getAgentBadge = (agent: string) => {
    switch (agent) {
      case 'claude':
        return {
          icon: <Sparkles size={11} className="text-purple-400 animate-pulse" />,
          label: 'Claude Code',
          role: 'Builder',
          color: 'bg-purple-500/10 border-purple-500/30 text-purple-200',
          dot: 'bg-purple-400',
        };
      case 'agy':
        return {
          icon: <Shield size={11} className="text-cyan-400" />,
          label: 'AGY Engine',
          role: 'Verifier',
          color: 'bg-cyan-500/10 border-cyan-500/30 text-cyan-200',
          dot: 'bg-cyan-400',
        };
      case 'gemini':
        return {
          icon: <Bot size={11} className="text-emerald-400" />,
          label: 'Gemini CLI',
          role: 'Auditor',
          color: 'bg-emerald-500/10 border-emerald-500/30 text-emerald-200',
          dot: 'bg-emerald-400',
        };
      case 'codex':
        return {
          icon: <Bot size={11} className="text-blue-400" />,
          label: 'Codex CLI',
          role: 'Builder/Reviewer',
          color: 'bg-blue-500/10 border-blue-500/30 text-blue-200',
          dot: 'bg-blue-400',
        };
      default:
        return {
          icon: <Terminal size={11} className="text-amber-400" />,
          label: 'Orchestrator',
          role: 'Coordinator',
          color: 'bg-amber-500/10 border-amber-500/30 text-amber-200',
          dot: 'bg-amber-400',
        };
    }
  };

  const lastSender = messages.length > 0 ? messages[messages.length - 1].from : null;

  return (
    <div className="fixed inset-0 bg-black/75 backdrop-blur-md z-50 flex items-center justify-center p-4 select-none">
      <div className="w-[900px] max-h-[88vh] glass-modal rounded-2xl shadow-[0_20px_60px_rgba(0,0,0,0.8)] flex flex-col overflow-hidden animate-in zoom-in-95 duration-150 border border-white/[0.1]">
        {/* Modal Header */}
        <div className="h-14 px-5 bg-white/[0.03] border-b border-white/[0.08] flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-7 h-7 rounded-xl bg-gradient-to-tr from-cyan-400 via-indigo-500 to-purple-500 flex items-center justify-center font-bold text-xs text-black shadow-[0_0_15px_rgba(0,216,255,0.4)]">
              ⚡
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <span className="font-bold text-sm text-slate-100 font-sans tracking-wide">
                  Autonomous Multi-CLI Agent Mesh
                </span>
                <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded-full bg-cyan-500/15 border border-cyan-500/30 text-cyan-300">
                  Zero Human Intervention
                </span>
              </div>
              <p className="text-[11px] text-slate-400 font-mono">
                Asynchronous Inter-CLI Protocol • .ai-bridge/bus/messages.jsonl
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/[0.08] transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        {/* Visual Topology Pipeline */}
        <div className="px-5 py-2.5 bg-[#090a10]/80 border-b border-white/[0.06] flex items-center justify-between text-xs">
          <div className="flex items-center space-x-2 text-[11px] text-slate-400 font-mono">
            <span>Pipeline Topology:</span>
          </div>

          <div className="flex items-center space-x-2">
            {/* Orchestrator Node */}
            <div
              className={`flex items-center space-x-1.5 px-2.5 py-1 rounded-lg border transition-all ${
                lastSender === 'orchestrator'
                  ? 'border-amber-500/80 bg-amber-500/20 text-amber-200 shadow-[0_0_10px_rgba(245,158,11,0.3)]'
                  : 'border-white/[0.08] bg-white/[0.02] text-slate-400'
              }`}
            >
              <Terminal size={11} className="text-amber-400" />
              <span className="font-semibold text-[11px]">Orchestrator</span>
            </div>

            <ArrowRight size={12} className="text-slate-600" />

            {/* Builder Node */}
            <div
              className={`flex items-center space-x-1.5 px-2.5 py-1 rounded-lg border transition-all ${
                lastSender === builder
                  ? 'border-purple-500/80 bg-purple-500/20 text-purple-200 shadow-[0_0_10px_rgba(168,85,247,0.3)]'
                  : 'border-white/[0.08] bg-white/[0.02] text-slate-400'
              }`}
            >
              <Sparkles size={11} className="text-purple-400" />
              <span className="font-semibold text-[11px] capitalize">{builder}</span>
              <span className="text-[9px] text-purple-400/80 font-mono">(Builder)</span>
            </div>

            <ArrowRight size={12} className="text-slate-600" />

            {/* Verifier Node */}
            <div
              className={`flex items-center space-x-1.5 px-2.5 py-1 rounded-lg border transition-all ${
                lastSender === verifier
                  ? 'border-cyan-500/80 bg-cyan-500/20 text-cyan-200 shadow-[0_0_10px_rgba(0,216,255,0.3)]'
                  : 'border-white/[0.08] bg-white/[0.02] text-slate-400'
              }`}
            >
              <Shield size={11} className="text-cyan-400" />
              <span className="font-semibold text-[11px] capitalize">{verifier}</span>
              <span className="text-[9px] text-cyan-400/80 font-mono">(Verifier)</span>
            </div>

            <ArrowRight size={12} className="text-slate-600" />

            {/* Auditor Node */}
            <div
              className={`flex items-center space-x-1.5 px-2.5 py-1 rounded-lg border transition-all ${
                lastSender === auditor
                  ? 'border-emerald-500/80 bg-emerald-500/20 text-emerald-200 shadow-[0_0_10px_rgba(34,197,94,0.3)]'
                  : 'border-white/[0.08] bg-white/[0.02] text-slate-400'
              }`}
            >
              <Bot size={11} className="text-emerald-400" />
              <span className="font-semibold text-[11px] capitalize">{auditor}</span>
              <span className="text-[9px] text-emerald-400/80 font-mono">(Auditor)</span>
            </div>
          </div>
        </div>

        {/* Goal Input & Mesh Configuration */}
        <div className="p-4 bg-white/[0.02] border-b border-white/[0.08] space-y-3">
          <div className="flex items-center space-x-2">
            <div className="relative flex-1">
              <span className="absolute left-3 top-2.5 text-cyan-400 font-mono text-xs select-none">❯</span>
              <input
                type="text"
                value={goal}
                onChange={(e) => setGoal(e.target.value)}
                disabled={isRunning}
                placeholder="Assign high-level goal (e.g. 'JWT refresh token servisi ekle ve test et')..."
                className="w-full glass-input rounded-xl pl-7 pr-3 py-2 text-xs font-mono text-slate-100 placeholder:text-slate-500 focus:outline-none"
                onKeyDown={(e) => e.key === 'Enter' && handleStartMesh()}
              />
            </div>

            <button
              onClick={handleStartMesh}
              disabled={!goal.trim() || isRunning}
              className="flex items-center space-x-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-cyan-500 via-indigo-600 to-purple-600 hover:from-cyan-400 hover:via-indigo-500 hover:to-purple-500 text-white font-semibold text-xs transition-all shadow-[0_0_20px_rgba(0,216,255,0.25)] hover:shadow-[0_0_25px_rgba(0,216,255,0.4)] disabled:opacity-40 disabled:cursor-not-allowed disabled:shadow-none"
            >
              {isRunning ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
              <span>{isRunning ? 'Mesh Running...' : 'Start Autonomous Mesh'}</span>
            </button>
          </div>

          {/* Model Roles */}
          <div className="flex items-center space-x-4 text-xs">
            <div className="flex items-center space-x-1.5">
              <span className="text-[11px] text-slate-500 font-medium">Builder:</span>
              <select
                value={builder}
                onChange={(e) => setBuilder(e.target.value)}
                disabled={isRunning}
                className="bg-white/[0.04] border border-white/[0.1] rounded-lg px-2.5 py-1 text-purple-300 font-mono text-xs focus:outline-none focus:border-purple-500/50"
              >
                <option value="claude" className="bg-[#0c0d16] text-purple-300">Claude Code (Official)</option>
                <option value="agy" className="bg-[#0c0d16] text-cyan-300">AGY Engine (Official)</option>
                <option value="gemini" className="bg-[#0c0d16] text-emerald-300">Gemini (Official)</option>
                <option value="codex" className="bg-[#0c0d16] text-blue-300">Codex CLI (Official)</option>
                <option value="mock" className="bg-[#0c0d16] text-slate-300">Mock Simulator</option>
              </select>
            </div>

            <ArrowRight size={12} className="text-slate-600" />

            <div className="flex items-center space-x-1.5">
              <span className="text-[11px] text-slate-500 font-medium">Verifier:</span>
              <select
                value={verifier}
                onChange={(e) => setVerifier(e.target.value)}
                disabled={isRunning}
                className="bg-white/[0.04] border border-white/[0.1] rounded-lg px-2.5 py-1 text-cyan-300 font-mono text-xs focus:outline-none focus:border-cyan-500/50"
              >
                <option value="agy" className="bg-[#0c0d16] text-cyan-300">AGY Engine (Official)</option>
                <option value="claude" className="bg-[#0c0d16] text-purple-300">Claude Code (Official)</option>
                <option value="codex" className="bg-[#0c0d16] text-blue-300">Codex CLI (Official)</option>
                <option value="mock" className="bg-[#0c0d16] text-slate-300">Mock Simulator</option>
              </select>
            </div>

            <ArrowRight size={12} className="text-slate-600" />

            <div className="flex items-center space-x-1.5">
              <span className="text-[11px] text-slate-500 font-medium">Auditor:</span>
              <select
                value={auditor}
                onChange={(e) => setAuditor(e.target.value)}
                disabled={isRunning}
                className="bg-white/[0.04] border border-white/[0.1] rounded-lg px-2.5 py-1 text-emerald-300 font-mono text-xs focus:outline-none focus:border-emerald-500/50"
              >
                <option value="gemini" className="bg-[#0c0d16] text-emerald-300">Gemini (Official)</option>
                <option value="codex" className="bg-[#0c0d16] text-blue-300">Codex CLI (Official)</option>
                <option value="claude" className="bg-[#0c0d16] text-purple-300">Claude Code (Official)</option>
                <option value="mock" className="bg-[#0c0d16] text-slate-300">Mock Simulator</option>
              </select>
            </div>
          </div>
        </div>

        {/* Live Inter-CLI Communication Timeline */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3 select-text min-h-[350px] bg-[#07080c]/60">
          {messages.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center p-8 text-slate-500">
              <div className="w-14 h-14 rounded-2xl bg-white/[0.03] border border-white/[0.08] flex items-center justify-center text-cyan-400 mb-3 shadow-[0_0_30px_rgba(0,216,255,0.15)]">
                <RefreshCw size={24} className={isRunning ? 'animate-spin' : ''} />
              </div>
              <p className="text-sm font-medium text-slate-300 font-sans">Autonomous Inter-CLI Bus Ready</p>
              <p className="text-xs text-slate-500 max-w-md mt-1 leading-relaxed">
                Assign a goal above to start the loop. Builder writes code, Verifier executes tests, and Auditor inspects the git diff. If tests fail, patches are sent automatically without manual copying.
              </p>
            </div>
          ) : (
            messages.map((msg) => {
              const fromBadge = getAgentBadge(msg.from);
              const toBadge = getAgentBadge(msg.to);
              const isError = msg.type === 'VERIFICATION_FAILED' || msg.type === 'SECURITY_CONCERN';
              const isSuccess = msg.type === 'CONSENSUS_APPROVED' || msg.type === 'VERIFICATION_PASSED';

              return (
                <div
                  key={msg.id}
                  className={`p-3.5 rounded-xl border text-xs space-y-2 transition-all duration-200 ${
                    isError
                      ? 'bg-red-950/20 border-red-500/40 shadow-[0_0_15px_rgba(239,68,68,0.1)]'
                      : isSuccess
                      ? 'bg-emerald-950/20 border-emerald-500/40 shadow-[0_0_15px_rgba(34,197,94,0.1)]'
                      : 'glass-card border-white/[0.08]'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-2">
                      <span className={`flex items-center space-x-1 px-2.5 py-0.5 rounded-lg border text-[11px] font-mono ${fromBadge.color}`}>
                        {fromBadge.icon}
                        <span className="font-semibold">{fromBadge.label}</span>
                      </span>

                      <ArrowRight size={11} className="text-slate-500" />

                      <span className={`flex items-center space-x-1 px-2.5 py-0.5 rounded-lg border text-[11px] font-mono ${toBadge.color}`}>
                        {toBadge.icon}
                        <span className="font-semibold">{toBadge.label}</span>
                      </span>

                      <span
                        className={`text-[9px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full ${
                          isError
                            ? 'bg-red-500/20 border border-red-500/40 text-red-300'
                            : isSuccess
                            ? 'bg-emerald-500/20 border border-emerald-500/40 text-emerald-300'
                            : 'bg-white/[0.06] text-slate-300 border border-white/[0.08]'
                        }`}
                      >
                        {msg.type}
                      </span>
                    </div>

                    <span className="font-mono text-[10px] text-slate-500">
                      {new Date(msg.timestamp).toLocaleTimeString()}
                    </span>
                  </div>

                  <p className="text-slate-200 font-medium leading-relaxed">{msg.payload.summary}</p>

                  {msg.payload.errorTrace && (
                    <pre className="p-2.5 rounded-lg bg-black/70 border border-red-500/30 font-mono text-[10px] text-red-300 max-h-36 overflow-y-auto whitespace-pre-wrap">
                      {msg.payload.errorTrace}
                    </pre>
                  )}
                </div>
              );
            })
          )}
          <div ref={feedEndRef} />
        </div>

        {/* Footer */}
        {isCompleted && (
          <div className="p-3.5 bg-emerald-950/40 border-t border-emerald-500/40 flex items-center justify-between text-xs text-emerald-200">
            <div className="flex items-center space-x-2">
              <CheckCircle2 size={16} className="text-emerald-400" />
              <span className="font-semibold text-sm font-sans">Autonomous Consensus Achieved! All tests passed and code audited.</span>
            </div>
            <button
              onClick={onClose}
              className="px-4 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold transition-all shadow-[0_0_15px_rgba(34,197,94,0.3)]"
            >
              Done
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
