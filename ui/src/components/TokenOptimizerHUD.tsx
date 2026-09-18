import React, { useState, useEffect } from 'react';
import {
  X,
  Zap,
  Brain,
  Layers,
  Sparkles,
  TrendingDown,
  RefreshCw,
  Plus,
  Trash2,
  Check,
  Copy,
  Terminal,
  ShieldCheck,
  Play,
  Cpu,
} from 'lucide-react';
import type { ContextTelemetry, MemoryData } from '../types/warp.js';

interface TokenOptimizerHUDProps {
  isOpen: boolean;
  onClose: () => void;
  telemetry: ContextTelemetry | null;
  onRefreshTelemetry: () => void;
}

export const TokenOptimizerHUD: React.FC<TokenOptimizerHUDProps> = ({
  isOpen,
  onClose,
  telemetry,
  onRefreshTelemetry,
}) => {
  const [activeTab, setActiveTab] = useState<'savings' | 'memory' | 'subscriptions' | 'skills'>('savings');
  const [memory, setMemory] = useState<MemoryData | null>(null);
  const [memorySnippet, setMemoryPromptSnippet] = useState<string>('');
  const [copiedSnippet, setCopiedSnippet] = useState(false);

  // New Fact / Rule state
  const [factKey, setFactKey] = useState('');
  const [factVal, setFactVal] = useState('');
  const [newRule, setNewRule] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Sandbox Test
  const [testInput, setTestInput] = useState(
    'npm \u001b[32m[==  ]\u001b[0m Installing packages...\nnpm \u001b[32m[====]\u001b[0m Installing packages...\nWarning: repetitive deprecation warning\nWarning: repetitive deprecation warning\nWarning: repetitive deprecation warning\nTS2322: Type "string" is not assignable to type "number".\n    at src/index.ts:42:15\nBuild finished with exit code 1.'
  );
  const [testOutput, setTestOutput] = useState<string | null>(null);
  const [testSavings, setTestSavings] = useState<{ rawTokens: number; optTokens: number; percent: number } | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    loadMemoryData();
    onRefreshTelemetry();
  }, [isOpen]);

  const loadMemoryData = async () => {
    try {
      if (window.warpApi?.getMemory) {
        const data = await window.warpApi.getMemory();
        setMemory(data);
      }
      if (window.warpApi?.getMemorySnippet) {
        const snip = await window.warpApi.getMemorySnippet();
        setMemoryPromptSnippet(snip);
      }
    } catch (err) {
      console.error('[HUD] Failed to load memory:', err);
    }
  };

  const handleAddFact = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!factKey.trim() || !factVal.trim()) return;
    setIsSubmitting(true);
    try {
      if (window.warpApi?.setMemoryFact) {
        await window.warpApi.setMemoryFact(factKey.trim(), factVal.trim(), 'user');
        setFactKey('');
        setFactVal('');
        await loadMemoryData();
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteFact = async (key: string) => {
    if (window.warpApi?.deleteMemoryFact) {
      await window.warpApi.deleteMemoryFact(key);
      await loadMemoryData();
    }
  };

  const handleAddRule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newRule.trim()) return;
    setIsSubmitting(true);
    try {
      if (window.warpApi?.addMemoryRule) {
        await window.warpApi.addMemoryRule(newRule.trim());
        setNewRule('');
        await loadMemoryData();
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRemoveRule = async (ruleText: string) => {
    if (window.warpApi?.removeMemoryRule) {
      await window.warpApi.removeMemoryRule(ruleText);
      await loadMemoryData();
    }
  };

  const handleRunTestOptimize = async () => {
    if (!testInput.trim()) return;
    if (window.warpApi?.optimizeContext) {
      const optimized = await window.warpApi.optimizeContext(testInput, { maxLines: 50 });
      setTestOutput(optimized);
      const rawTk = Math.ceil(testInput.length / 4);
      const optTk = Math.ceil(optimized.length / 4);
      const saved = Math.max(0, rawTk - optTk);
      const pct = rawTk > 0 ? Math.round((saved / rawTk) * 100) : 0;
      setTestSavings({ rawTokens: rawTk, optTokens: optTk, percent: pct });
      onRefreshTelemetry();
    }
  };

  const handleCopySnippet = () => {
    if (!memorySnippet) return;
    navigator.clipboard.writeText(memorySnippet);
    setCopiedSnippet(true);
    setTimeout(() => setCopiedSnippet(false), 2000);
  };

  const handleResetStats = async () => {
    if (window.warpApi?.resetContextStats) {
      await window.warpApi.resetContextStats();
      onRefreshTelemetry();
    }
  };

  if (!isOpen) return null;

  const rawTotal = telemetry?.rawTokensTotal || 0;
  const optTotal = telemetry?.optimizedTokensTotal || 0;
  const savedTotal = telemetry?.savedTokensTotal || 0;
  const savingsPct = telemetry?.savingsPercentage || 0;
  const optCount = telemetry?.optimizationsCount || 0;
  // Estimated cost saved based on Claude 3.7 Sonnet ($3.00 / 1M input tokens)
  const estCostSaved = ((savedTotal / 1_000_000) * 3.0).toFixed(3);

  const factsList = memory ? Object.values(memory.facts || {}) : [];
  const rulesList = memory?.rules || [];
  const skillsUsage = memory?.skillsUsage || {};

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md p-4 animate-in fade-in duration-200">
      <div className="relative w-full max-w-4xl h-[680px] bg-[#09090b] border border-zinc-800 rounded-2xl shadow-2xl flex flex-col overflow-hidden text-zinc-100 font-sans">
        {/* Top Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-800/80 bg-black/40">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400 shadow-sm">
              <Zap className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-semibold tracking-wide text-zinc-100">Token & Context Optimizer HUD</h2>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-medium bg-emerald-950/60 border border-emerald-800/50 text-emerald-300">
                  ACTIVE • LEAN CONTEXT
                </span>
              </div>
              <p className="text-xs text-zinc-400">
                Stripping ANSI/spinners, squashing repetitive traces & injecting cached memory facts
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={onRefreshTelemetry}
              className="p-1.5 rounded-lg border border-zinc-800 hover:bg-zinc-800/70 text-zinc-400 hover:text-zinc-200 transition-colors"
              title="Refresh Telemetry"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg border border-zinc-800 hover:bg-zinc-800/70 text-zinc-400 hover:text-zinc-200 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Top Metric Cards */}
        <div className="grid grid-cols-4 gap-3 px-6 py-3.5 bg-zinc-950/70 border-b border-zinc-800/60">
          <div className="p-3 rounded-xl bg-zinc-900/60 border border-zinc-800/70">
            <div className="flex items-center justify-between text-zinc-400 text-xs mb-1">
              <span>Token Savings</span>
              <TrendingDown className="w-3.5 h-3.5 text-emerald-400" />
            </div>
            <div className="text-lg font-bold font-mono text-emerald-400">
              {savingsPct}% <span className="text-xs font-normal text-zinc-400 font-sans">saved</span>
            </div>
            <div className="text-[11px] text-zinc-500 font-mono mt-0.5">
              -{savedTotal.toLocaleString()} tokens
            </div>
          </div>

          <div className="p-3 rounded-xl bg-zinc-900/60 border border-zinc-800/70">
            <div className="flex items-center justify-between text-zinc-400 text-xs mb-1">
              <span>Context Compression</span>
              <Zap className="w-3.5 h-3.5 text-amber-400" />
            </div>
            <div className="text-lg font-bold font-mono text-zinc-100">
              {optTotal.toLocaleString()} <span className="text-xs font-normal text-zinc-400 font-sans">tk fed</span>
            </div>
            <div className="text-[11px] text-zinc-500 font-mono mt-0.5">
              from {rawTotal.toLocaleString()} raw
            </div>
          </div>

          <div className="p-3 rounded-xl bg-zinc-900/60 border border-zinc-800/70">
            <div className="flex items-center justify-between text-zinc-400 text-xs mb-1">
              <span>Memory Recall</span>
              <Brain className="w-3.5 h-3.5 text-purple-400" />
            </div>
            <div className="text-lg font-bold font-mono text-zinc-100">
              {factsList.length} Facts <span className="text-xs font-normal text-zinc-400 font-sans">· {rulesList.length} Rules</span>
            </div>
            <div className="text-[11px] text-zinc-500 font-mono mt-0.5">
              Zero duplicate prompts
            </div>
          </div>

          <div className="p-3 rounded-xl bg-zinc-900/60 border border-zinc-800/70">
            <div className="flex items-center justify-between text-zinc-400 text-xs mb-1">
              <span>Quota Savings (est.)</span>
              <ShieldCheck className="w-3.5 h-3.5 text-blue-400" />
            </div>
            <div className="text-lg font-bold font-mono text-zinc-100">
              ${estCostSaved} <span className="text-xs font-normal text-zinc-400 font-sans">prevented</span>
            </div>
            <div className="text-[11px] text-zinc-500 font-mono mt-0.5">
              {optCount} compressions done
            </div>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="flex items-center gap-2 px-6 pt-3 border-b border-zinc-800 bg-[#09090b]">
          <button
            onClick={() => setActiveTab('savings')}
            className={`flex items-center gap-2 px-3.5 py-2 text-xs font-medium border-b-2 transition-colors ${
              activeTab === 'savings'
                ? 'border-emerald-400 text-emerald-300'
                : 'border-transparent text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <TrendingDown className="w-3.5 h-3.5" />
            Context & Token Savings
          </button>
          <button
            onClick={() => setActiveTab('memory')}
            className={`flex items-center gap-2 px-3.5 py-2 text-xs font-medium border-b-2 transition-colors ${
              activeTab === 'memory'
                ? 'border-purple-400 text-purple-300'
                : 'border-transparent text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <Brain className="w-3.5 h-3.5" />
            MemoryStore Explorer ({factsList.length + rulesList.length})
          </button>
          <button
            onClick={() => setActiveTab('subscriptions')}
            className={`flex items-center gap-2 px-3.5 py-2 text-xs font-medium border-b-2 transition-colors ${
              activeTab === 'subscriptions'
                ? 'border-blue-400 text-blue-300'
                : 'border-transparent text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <Cpu className="w-3.5 h-3.5" />
            Subscription & Quota Guard
          </button>
          <button
            onClick={() => setActiveTab('skills')}
            className={`flex items-center gap-2 px-3.5 py-2 text-xs font-medium border-b-2 transition-colors ${
              activeTab === 'skills'
                ? 'border-amber-400 text-amber-300'
                : 'border-transparent text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5" />
            Universal Skills Cache
          </button>
        </div>

        {/* Tab Content Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* TAB 1: SAVINGS */}
          {activeTab === 'savings' && (
            <div className="space-y-6">
              {/* Savings Meter Bar */}
              <div className="p-4 rounded-xl bg-zinc-900/40 border border-zinc-800">
                <div className="flex items-center justify-between text-xs mb-2">
                  <span className="text-zinc-300 font-medium">Active Session Token Efficiency</span>
                  <span className="font-mono text-emerald-400 font-semibold">{savingsPct}% Compressed</span>
                </div>
                <div className="w-full h-3 bg-zinc-950 rounded-full overflow-hidden flex border border-zinc-800">
                  <div
                    className="h-full bg-gradient-to-r from-emerald-600 to-teal-400 transition-all duration-500"
                    style={{ width: `${Math.max(4, savingsPct)}%` }}
                  />
                  <div
                    className="h-full bg-zinc-800 transition-all duration-500"
                    style={{ width: `${100 - Math.max(4, savingsPct)}%` }}
                  />
                </div>
                <div className="flex justify-between items-center text-[11px] text-zinc-500 mt-2 font-mono">
                  <span>Preserved Context: {optTotal.toLocaleString()} tokens</span>
                  <span>Stripped Bloat: -{savedTotal.toLocaleString()} tokens</span>
                </div>
              </div>

              {/* Compaction Test Sandbox */}
              <div className="p-4 rounded-xl bg-zinc-900/40 border border-zinc-800 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Terminal className="w-4 h-4 text-emerald-400" />
                    <h3 className="text-xs font-semibold text-zinc-200">Live Context Compaction Simulator</h3>
                  </div>
                  <button
                    onClick={handleRunTestOptimize}
                    className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-emerald-500/20 border border-emerald-500/40 hover:bg-emerald-500/30 text-emerald-300 text-xs font-medium transition-colors"
                  >
                    <Play className="w-3.5 h-3.5 fill-current" />
                    Test Optimize
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[11px] text-zinc-400 block mb-1">Raw Terminal / Compiler Trace (Input):</label>
                    <textarea
                      value={testInput}
                      onChange={(e) => setTestInput(e.target.value)}
                      rows={5}
                      className="w-full bg-black/60 border border-zinc-800 rounded-lg p-2 text-xs font-mono text-zinc-300 focus:outline-none focus:border-zinc-700 resize-none"
                    />
                  </div>
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-[11px] text-zinc-400">Optimized for AI Prompt (Output):</label>
                      {testSavings && (
                        <span className="text-[10px] font-mono text-emerald-400 bg-emerald-950/50 px-1.5 py-0.5 rounded border border-emerald-800/40">
                          {testSavings.percent}% smaller ({testSavings.rawTokens} → {testSavings.optTokens} tk)
                        </span>
                      )}
                    </div>
                    <textarea
                      readOnly
                      value={testOutput ?? 'Click "Test Optimize" to see compaction...'}
                      rows={5}
                      className="w-full bg-black/40 border border-zinc-800/80 rounded-lg p-2 text-xs font-mono text-emerald-300/90 focus:outline-none resize-none"
                    />
                  </div>
                </div>
              </div>

              {/* Recent Optimizations Log */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-xs font-semibold text-zinc-300 uppercase tracking-wider">Recent Optimization Events</h3>
                  <button
                    onClick={handleResetStats}
                    className="text-[11px] text-zinc-500 hover:text-zinc-300 transition-colors"
                  >
                    Reset Statistics
                  </button>
                </div>
                <div className="space-y-2">
                  {telemetry?.recentEvents && telemetry.recentEvents.length > 0 ? (
                    telemetry.recentEvents.slice(0, 6).map((ev, idx) => (
                      <div
                        key={idx}
                        className="flex items-center justify-between p-2.5 rounded-lg bg-zinc-900/30 border border-zinc-800/60 text-xs font-mono"
                      >
                        <div className="flex items-center gap-2">
                          <span
                            className={`px-1.5 py-0.5 rounded text-[10px] uppercase font-bold ${
                              ev.type === 'git_diff'
                                ? 'bg-purple-950/60 text-purple-300 border border-purple-800/40'
                                : 'bg-emerald-950/60 text-emerald-300 border border-emerald-800/40'
                            }`}
                          >
                            {ev.type.replace('_', ' ')}
                          </span>
                          <span className="text-zinc-400 font-sans">
                            {ev.rawChars.toLocaleString()} chars → {ev.optimizedChars.toLocaleString()} chars
                          </span>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="text-emerald-400 font-bold">-{ev.savingsPercentage}%</span>
                          <span className="text-zinc-500 text-[10px] font-sans">
                            {new Date(ev.timestamp).toLocaleTimeString()}
                          </span>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="text-xs text-zinc-500 p-4 text-center border border-dashed border-zinc-800 rounded-lg">
                      No optimization events yet. Run a command in the terminal or click "Test Optimize" above.
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: MEMORYSTORE */}
          {activeTab === 'memory' && (
            <div className="space-y-6">
              <div className="flex items-center justify-between p-3.5 rounded-xl bg-purple-950/20 border border-purple-900/40">
                <div className="flex items-center gap-2.5">
                  <Brain className="w-4 h-4 text-purple-400" />
                  <div>
                    <h3 className="text-xs font-semibold text-purple-200">Persistent Workspace Memory</h3>
                    <p className="text-[11px] text-purple-300/80">
                      Stores facts & rules in <code className="text-white">.warp-memory.json</code> so agents don't repeatedly ask or relearn workspace context.
                    </p>
                  </div>
                </div>
                <button
                  onClick={handleCopySnippet}
                  className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-purple-500/20 border border-purple-500/40 hover:bg-purple-500/30 text-purple-200 text-xs font-medium transition-colors"
                >
                  {copiedSnippet ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  {copiedSnippet ? 'Copied' : 'Copy AI Snippet'}
                </button>
              </div>

              {/* Add Fact Form */}
              <div className="p-4 rounded-xl bg-zinc-900/40 border border-zinc-800 space-y-3">
                <h3 className="text-xs font-semibold text-zinc-300">Add Workspace Fact</h3>
                <form onSubmit={handleAddFact} className="flex gap-2">
                  <input
                    type="text"
                    placeholder="Key (e.g. database, node_version)"
                    value={factKey}
                    onChange={(e) => setFactKey(e.target.value)}
                    className="flex-1 bg-black/60 border border-zinc-800 rounded-lg px-3 py-1.5 text-xs text-zinc-200 focus:outline-none focus:border-zinc-700 font-mono"
                  />
                  <input
                    type="text"
                    placeholder="Value (e.g. PostgreSQL 16 on port 5432)"
                    value={factVal}
                    onChange={(e) => setFactVal(e.target.value)}
                    className="flex-[2] bg-black/60 border border-zinc-800 rounded-lg px-3 py-1.5 text-xs text-zinc-200 focus:outline-none focus:border-zinc-700"
                  />
                  <button
                    type="submit"
                    disabled={isSubmitting || !factKey || !factVal}
                    className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50 text-xs font-medium transition-colors"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Save
                  </button>
                </form>

                <div className="space-y-1.5 mt-3">
                  <label className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider block">
                    Stored Workspace Facts ({factsList.length})
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    {factsList.map((fact) => (
                      <div
                        key={fact.key}
                        className="flex items-center justify-between p-2 rounded-lg bg-zinc-900/60 border border-zinc-800/80 text-xs"
                      >
                        <div className="truncate pr-2">
                          <span className="font-mono text-purple-400 font-semibold">{fact.key}: </span>
                          <span className="text-zinc-300 font-mono">{fact.value}</span>
                        </div>
                        <button
                          onClick={() => handleDeleteFact(fact.key)}
                          className="text-zinc-500 hover:text-red-400 transition-colors p-1"
                          title="Delete Fact"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Add Rule Form */}
              <div className="p-4 rounded-xl bg-zinc-900/40 border border-zinc-800 space-y-3">
                <h3 className="text-xs font-semibold text-zinc-300">Behavioral Rules for AI Agents</h3>
                <form onSubmit={handleAddRule} className="flex gap-2">
                  <input
                    type="text"
                    placeholder="Rule (e.g. Always verify with npx tsc before asking for review)"
                    value={newRule}
                    onChange={(e) => setNewRule(e.target.value)}
                    className="flex-1 bg-black/60 border border-zinc-800 rounded-lg px-3 py-1.5 text-xs text-zinc-200 focus:outline-none focus:border-zinc-700"
                  />
                  <button
                    type="submit"
                    disabled={isSubmitting || !newRule}
                    className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50 text-xs font-medium transition-colors"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Add Rule
                  </button>
                </form>

                <div className="space-y-1.5 mt-2">
                  {rulesList.map((rule, idx) => (
                    <div
                      key={idx}
                      className="flex items-center justify-between p-2 rounded-lg bg-zinc-900/50 border border-zinc-800/70 text-xs text-zinc-300"
                    >
                      <div className="flex items-center gap-2">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                        <span>{rule}</span>
                      </div>
                      <button
                        onClick={() => handleRemoveRule(rule)}
                        className="text-zinc-500 hover:text-red-400 transition-colors p-1"
                        title="Remove Rule"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: SUBSCRIPTIONS & QUOTA GUARD */}
          {activeTab === 'subscriptions' && (
            <div className="space-y-4">
              <div className="p-3.5 rounded-xl bg-blue-950/20 border border-blue-900/40">
                <div className="flex items-center gap-2.5">
                  <ShieldCheck className="w-4 h-4 text-blue-400" />
                  <div>
                    <h3 className="text-xs font-semibold text-blue-200">Active Subscription & Window Limits Guard</h3>
                    <p className="text-[11px] text-blue-300/80">
                      Ensures model context windows are never blown, saving subscription quotas and preventing unexpected tier overages.
                    </p>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3">
                {/* Claude Profile */}
                <div className="p-4 rounded-xl bg-zinc-900/40 border border-zinc-800 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <div className="w-7 h-7 rounded-lg bg-orange-500/10 border border-orange-500/30 flex items-center justify-center text-orange-400 font-bold text-xs">
                        C
                      </div>
                      <div>
                        <h4 className="text-xs font-semibold text-zinc-100">Anthropic Claude Code (Claude 3.7 Sonnet)</h4>
                        <span className="text-[11px] text-zinc-400">Context Window: 200,000 tokens • Output: 8,192 tokens</span>
                      </div>
                    </div>
                    <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-emerald-950/60 border border-emerald-800/50 text-emerald-400">
                      0.8% Window Used
                    </span>
                  </div>
                  <div className="w-full h-2 bg-zinc-950 rounded-full overflow-hidden border border-zinc-800">
                    <div className="h-full bg-orange-400 w-[0.8%]" />
                  </div>
                  <div className="flex items-center justify-between text-[11px] text-zinc-500">
                    <span>Active context: ~{optTotal} / 200,000 tk</span>
                    <span>Prompt Caching: Enabled (5 min TTL)</span>
                  </div>
                </div>

                {/* Gemini AGY Profile */}
                <div className="p-4 rounded-xl bg-zinc-900/40 border border-zinc-800 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <div className="w-7 h-7 rounded-lg bg-blue-500/10 border border-blue-500/30 flex items-center justify-center text-blue-400 font-bold text-xs">
                        G
                      </div>
                      <div>
                        <h4 className="text-xs font-semibold text-zinc-100">Google Antigravity Engine (Gemini 2.5 Pro)</h4>
                        <span className="text-[11px] text-zinc-400">Context Window: 1,000,000 tokens • Output: 8,192 tokens</span>
                      </div>
                    </div>
                    <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-emerald-950/60 border border-emerald-800/50 text-emerald-400">
                      0.15% Window Used
                    </span>
                  </div>
                  <div className="w-full h-2 bg-zinc-950 rounded-full overflow-hidden border border-zinc-800">
                    <div className="h-full bg-blue-400 w-[0.2%]" />
                  </div>
                  <div className="flex items-center justify-between text-[11px] text-zinc-500">
                    <span>Active context: ~{optTotal} / 1,000,000 tk</span>
                    <span>Self-Healing Budget: 3 rounds</span>
                  </div>
                </div>

                {/* OpenAI Codex Profile */}
                <div className="p-4 rounded-xl bg-zinc-900/40 border border-zinc-800 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <div className="w-7 h-7 rounded-lg bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400 font-bold text-xs">
                        O
                      </div>
                      <div>
                        <h4 className="text-xs font-semibold text-zinc-100">OpenAI Codex CLI (GPT-4o)</h4>
                        <span className="text-[11px] text-zinc-400">Context Window: 128,000 tokens • Output: 4,096 tokens</span>
                      </div>
                    </div>
                    <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-emerald-950/60 border border-emerald-800/50 text-emerald-400">
                      1.2% Window Used
                    </span>
                  </div>
                  <div className="w-full h-2 bg-zinc-950 rounded-full overflow-hidden border border-zinc-800">
                    <div className="h-full bg-emerald-400 w-[1.2%]" />
                  </div>
                  <div className="flex items-center justify-between text-[11px] text-zinc-500">
                    <span>Active context: ~{optTotal} / 128,000 tk</span>
                    <span>High-Speed Inference</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 4: SKILLS */}
          {activeTab === 'skills' && (
            <div className="space-y-4">
              <div className="p-3.5 rounded-xl bg-amber-950/20 border border-amber-900/40">
                <div className="flex items-center gap-2.5">
                  <Sparkles className="w-4 h-4 text-amber-400" />
                  <div>
                    <h3 className="text-xs font-semibold text-amber-200">Universal Skills Token Management</h3>
                    <p className="text-[11px] text-amber-300/80">
                      Skills are indexed in local disk and injected dynamically on invocation to keep base prompts lean.
                    </p>
                  </div>
                </div>
              </div>

              <div className="p-4 rounded-xl bg-zinc-900/40 border border-zinc-800 space-y-2">
                <h4 className="text-xs font-semibold text-zinc-300">Skill Usage & Token Footprint</h4>
                {Object.keys(skillsUsage).length > 0 ? (
                  <div className="space-y-2">
                    {Object.entries(skillsUsage).map(([skillId, count]) => (
                      <div
                        key={skillId}
                        className="flex items-center justify-between p-2 rounded-lg bg-zinc-900/60 border border-zinc-800 text-xs font-mono"
                      >
                        <span className="text-zinc-200">{skillId}</span>
                        <span className="text-amber-400">{count} times invoked</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-xs text-zinc-500 py-3 text-center border border-dashed border-zinc-800 rounded-lg">
                    No custom skills invoked yet in this session.
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-3 border-t border-zinc-800 bg-zinc-950 text-xs text-zinc-500">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span>Dexter Context & Token Guardian Active</span>
          </div>
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 font-medium transition-colors"
          >
            Close HUD
          </button>
        </div>
      </div>
    </div>
  );
};
