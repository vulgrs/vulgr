import React, { useState, useEffect } from 'react';
import {
  X,
  Settings,
  Shield,
  Terminal,
  Cpu,
  Layers,
  Check,
  AlertTriangle,
  RotateCcw,
  Sparkles,
  Bot,
  Sliders,
  Eye,
  EyeOff,
  GitBranch,
} from 'lucide-react';
import type { WarpConfig, ShellType, CursorStyleType } from '../types/warp.js';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfigChanged?: (config: WarpConfig) => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  onConfigChanged,
}) => {
  const [activeTab, setActiveTab] = useState<'permissions' | 'terminal' | 'safety'>('permissions');
  const [config, setConfig] = useState<WarpConfig | null>(null);
  const [savedToast, setSavedToast] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    loadConfig();
  }, [isOpen]);

  const loadConfig = async () => {
    if (window.warpApi?.getConfig) {
      try {
        const c = await window.warpApi.getConfig();
        setConfig(c);
      } catch (err) {
        console.error('Failed to load config:', err);
      }
    }
  };

  const handleSave = async () => {
    if (!config || !window.warpApi?.updateConfig) return;

    try {
      const updated = await window.warpApi.updateConfig(config);
      setConfig(updated);
      onConfigChanged?.(updated);
      setSavedToast(true);
      setTimeout(() => setSavedToast(false), 2000);
    } catch (err) {
      console.error('Failed to update config:', err);
    }
  };

  const handleReset = async () => {
    if (!window.warpApi?.resetConfig) return;

    try {
      const reset = await window.warpApi.resetConfig();
      setConfig(reset);
      onConfigChanged?.(reset);
      setSavedToast(true);
      setTimeout(() => setSavedToast(false), 2000);
    } catch (err) {
      console.error('Failed to reset config:', err);
    }
  };

  if (!isOpen || !config) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 animate-fadeIn select-none text-slate-200">
      <div className="relative w-full max-w-4xl h-[80vh] bg-[#0c0e17]/95 border border-white/[0.12] rounded-2xl shadow-[0_25px_70px_rgba(0,0,0,0.8)] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-white/[0.08] flex items-center justify-between bg-white/[0.02]">
          <div className="flex items-center space-x-3">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-zinc-500 via-zinc-500 to-zinc-400 flex items-center justify-center text-white shadow-[0_0_15px_rgba(168,85,247,0.3)]">
              <Settings size={17} />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h2 className="text-sm font-bold text-white tracking-wide">WARP SETTINGS & CLI PERMISSIONS</h2>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-mono bg-zinc-500/15 text-zinc-300 border border-zinc-500/30">
                  Global Config
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Configure CLI flags, AI model choices, terminal shells, and safety sandboxes
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-white/[0.06] transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Navigation Tabs Bar */}
        <div className="px-6 py-2.5 bg-white/[0.01] border-b border-white/[0.06] flex items-center space-x-2">
          <button
            onClick={() => setActiveTab('permissions')}
            className={`flex items-center space-x-2 px-3 py-1.5 rounded-xl text-xs font-medium transition-all ${
 activeTab === 'permissions'
 ? 'bg-zinc-500/20 text-zinc-300 border border-zinc-500/40 font-semibold shadow-sm'
 : 'text-slate-400 hover:text-white hover:bg-white/[0.04]'
 }`}
          >
            <Shield size={13} />
            <span>CLI Flags & Models</span>
          </button>

          <button
            onClick={() => setActiveTab('terminal')}
            className={`flex items-center space-x-2 px-3 py-1.5 rounded-xl text-xs font-medium transition-all ${
 activeTab === 'terminal'
 ? 'bg-zinc-500/20 text-zinc-300 border border-zinc-500/40 font-semibold shadow-sm'
 : 'text-slate-400 hover:text-white hover:bg-white/[0.04]'
 }`}
          >
            <Terminal size={13} />
            <span>Terminal & Shell</span>
          </button>

          <button
            onClick={() => setActiveTab('safety')}
            className={`flex items-center space-x-2 px-3 py-1.5 rounded-xl text-xs font-medium transition-all ${
 activeTab === 'safety'
 ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 font-semibold shadow-sm'
 : 'text-slate-400 hover:text-white hover:bg-white/[0.04]'
 }`}
          >
            <GitBranch size={13} />
            <span>Safety & Sandbox</span>
          </button>
        </div>

        {/* Tab 1: CLI Flags & Models */}
        {activeTab === 'permissions' && (
          <div className="flex-1 overflow-y-auto p-6 space-y-6">
            {/* Claude Code Section */}
            <div className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.06] space-y-4">
              <div className="flex items-center space-x-2">
                <Sparkles size={16} className="text-zinc-400" />
                <h3 className="text-xs font-bold text-white tracking-wide uppercase">Claude Code CLI Configuration</h3>
              </div>

              {/* Dangerous Skip Permissions Switch */}
              <div className="flex items-start justify-between p-3.5 rounded-xl bg-zinc-500/5 border border-zinc-500/25">
                <div className="space-y-1 max-w-xl">
                  <div className="flex items-center space-x-2">
                    <span className="text-xs font-semibold text-zinc-200">
                      Dangerously Skip Permissions
                    </span>
                    <code className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-500/20 text-zinc-300 font-mono">
                      --dangerously-skip-permissions
                    </code>
                  </div>
                  <p className="text-[11px] text-slate-400 leading-relaxed">
                    Bypasses interactive confirmation prompts for file edits and terminal commands. Allows Claude to iterate autonomously in mesh loops without blocking for user approval.
                  </p>
                </div>

                <label className="relative inline-flex items-center cursor-pointer ml-4 mt-1">
                  <input
                    type="checkbox"
                    checked={config.claude.skipPermissions}
                    onChange={(e) =>
                      setConfig({
                        ...config,
                        claude: { ...config.claude, skipPermissions: e.target.checked },
                      })
                    }
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-zinc-600"></div>
                </label>
              </div>

              {/* Model Picker & Retries */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-xs font-medium text-slate-300">Claude Model</label>
                  <select
                    value={config.claude.model}
                    onChange={(e) =>
                      setConfig({
                        ...config,
                        claude: { ...config.claude, model: e.target.value },
                      })
                    }
                    className="w-full px-3 py-2 bg-black/40 border border-white/[0.1] rounded-xl text-xs text-white font-mono focus:outline-none focus:border-zinc-500/60"
                  >
                    <option value="claude-3-7-sonnet">Claude 3.7 Sonnet (Hybrid Reasoning)</option>
                    <option value="claude-3-5-sonnet">Claude 3.5 Sonnet (Balanced Code)</option>
                    <option value="claude-3-5-haiku">Claude 3.5 Haiku (High Speed)</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-medium text-slate-300">Max Autonomous Repair Retries</label>
                  <input
                    type="number"
                    min={1}
                    max={10}
                    value={config.claude.maxRetries}
                    onChange={(e) =>
                      setConfig({
                        ...config,
                        claude: { ...config.claude, maxRetries: parseInt(e.target.value) || 3 },
                      })
                    }
                    className="w-full px-3 py-2 bg-black/40 border border-white/[0.1] rounded-xl text-xs text-white font-mono focus:outline-none focus:border-zinc-500/60"
                  />
                </div>
              </div>
            </div>

            {/* Google AGY Engine Section */}
            <div className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.06] space-y-4">
              <div className="flex items-center space-x-2">
                <Shield size={16} className="text-zinc-400" />
                <h3 className="text-xs font-bold text-white tracking-wide uppercase">Google AGY Engine Configuration</h3>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-xs font-medium text-slate-300">AGY Gemini Model</label>
                  <select
                    value={config.agy.model}
                    onChange={(e) =>
                      setConfig({
                        ...config,
                        agy: { ...config.agy, model: e.target.value },
                      })
                    }
                    className="w-full px-3 py-2 bg-black/40 border border-white/[0.1] rounded-xl text-xs text-white font-mono focus:outline-none focus:border-zinc-500/60"
                  >
                    <option value="gemini-2.5-pro">Gemini 2.5 Pro (Deep Code Analysis)</option>
                    <option value="gemini-2.5-flash">Gemini 2.5 Flash (Sub-Second Verify)</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-medium text-slate-300">Self-Correction Budget (Rounds)</label>
                  <input
                    type="number"
                    min={1}
                    max={5}
                    value={config.agy.budget}
                    onChange={(e) =>
                      setConfig({
                        ...config,
                        agy: { ...config.agy, budget: parseInt(e.target.value) || 3 },
                      })
                    }
                    className="w-full px-3 py-2 bg-black/40 border border-white/[0.1] rounded-xl text-xs text-white font-mono focus:outline-none focus:border-zinc-500/60"
                  />
                </div>
              </div>
            </div>

            {/* OpenAI Codex Section */}
            <div className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.06] space-y-4">
              <div className="flex items-center space-x-2">
                <Bot size={16} className="text-emerald-400" />
                <h3 className="text-xs font-bold text-white tracking-wide uppercase">OpenAI Codex CLI Configuration</h3>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-xs font-medium text-slate-300">Codex Model</label>
                  <select
                    value={config.codex.model}
                    onChange={(e) =>
                      setConfig({
                        ...config,
                        codex: { ...config.codex, model: e.target.value },
                      })
                    }
                    className="w-full px-3 py-2 bg-black/40 border border-white/[0.1] rounded-xl text-xs text-white font-mono focus:outline-none focus:border-emerald-500/60"
                  >
                    <option value="gpt-4o">GPT-4o (Standard Multimodal)</option>
                    <option value="o3-mini">o3-mini (High-Speed Reasoning)</option>
                    <option value="o1">o1 (Deep Mathematics & Logic)</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-medium text-slate-300">Local CLI Binary Command</label>
                  <input
                    type="text"
                    placeholder="codex"
                    value={config.codex.binaryPath || 'codex'}
                    onChange={(e) =>
                      setConfig({
                        ...config,
                        codex: { ...config.codex, binaryPath: e.target.value },
                      })
                    }
                    className="w-full px-3 py-2 bg-black/40 border border-white/[0.1] rounded-xl text-xs text-white font-mono focus:outline-none focus:border-emerald-500/60"
                  />
                  <span className="text-[10px] text-zinc-500 block">Runs via local subprocess in terminal without API keys</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Tab 2: Terminal & Appearance */}
        {activeTab === 'terminal' && (
          <div className="flex-1 overflow-y-auto p-6 space-y-6">
            <div className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.06] space-y-4">
              <h3 className="text-xs font-bold text-white tracking-wide uppercase">Shell Environment & Font</h3>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-xs font-medium text-slate-300">Default Shell</label>
                  <select
                    value={config.defaultShell}
                    onChange={(e) =>
                      setConfig({
                        ...config,
                        defaultShell: e.target.value as ShellType,
                      })
                    }
                    className="w-full px-3 py-2 bg-black/40 border border-white/[0.1] rounded-xl text-xs text-white font-mono focus:outline-none focus:border-zinc-500/60"
                  >
                    <option value="powershell">Windows PowerShell (powershell.exe)</option>
                    <option value="cmd">Command Prompt (cmd.exe)</option>
                    <option value="wsl">WSL Bash (wsl.exe)</option>
                    <option value="bash">Git Bash / POSIX (bash.exe)</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-medium text-slate-300">Cursor Style</label>
                  <select
                    value={config.cursorStyle}
                    onChange={(e) =>
                      setConfig({
                        ...config,
                        cursorStyle: e.target.value as CursorStyleType,
                      })
                    }
                    className="w-full px-3 py-2 bg-black/40 border border-white/[0.1] rounded-xl text-xs text-white font-mono focus:outline-none focus:border-zinc-500/60"
                  >
                    <option value="bar">Bar ( | )</option>
                    <option value="block">Block ( █ )</option>
                    <option value="underline">Underline ( _ )</option>
                  </select>
                </div>
              </div>

              <div className="space-y-2 pt-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-medium text-slate-300">Font Size</span>
                  <span className="font-mono text-zinc-400 font-bold">{config.fontSize}px</span>
                </div>
                <input
                  type="range"
                  min={11}
                  max={20}
                  value={config.fontSize}
                  onChange={(e) =>
                    setConfig({
                      ...config,
                      fontSize: parseInt(e.target.value),
                    })
                  }
                  className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-zinc-500"
                />
              </div>
            </div>
          </div>
        )}

        {/* Tab 3: Safety & Sandboxing */}
        {activeTab === 'safety' && (
          <div className="flex-1 overflow-y-auto p-6 space-y-6">
            <div className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.06] space-y-4">
              <h3 className="text-xs font-bold text-white tracking-wide uppercase">Autonomous Agent Sandbox</h3>

              <div className="flex items-start justify-between p-3.5 rounded-xl bg-emerald-500/5 border border-emerald-500/25">
                <div className="space-y-1 max-w-xl">
                  <div className="flex items-center space-x-2">
                    <span className="text-xs font-semibold text-emerald-200">
                      Auto-Sandbox Autonomous Runs
                    </span>
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 font-mono">
                      Git Worktree
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-400 leading-relaxed">
                    When enabled, Agent Mesh and Autonomous Squads execute inside ephemeral git worktrees (<code className="text-emerald-300">.warp-worktrees/</code>), completely protecting uncommitted files and active branches.
                  </p>
                </div>

                <label className="relative inline-flex items-center cursor-pointer ml-4 mt-1">
                  <input
                    type="checkbox"
                    checked={config.autoSandbox}
                    onChange={(e) =>
                      setConfig({
                        ...config,
                        autoSandbox: e.target.checked,
                      })
                    }
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-600"></div>
                </label>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-medium text-slate-300">Default Build Verification Command</label>
                <input
                  type="text"
                  value={config.defaultVerifyCmd}
                  onChange={(e) =>
                    setConfig({
                      ...config,
                      defaultVerifyCmd: e.target.value,
                    })
                  }
                  className="w-full px-3 py-2 bg-black/40 border border-white/[0.1] rounded-xl text-xs text-white font-mono focus:outline-none focus:border-emerald-500/60"
                  placeholder="npm test"
                />
              </div>
            </div>
          </div>
        )}

        {/* Footer Toolbar */}
        <div className="px-6 py-4 border-t border-white/[0.08] flex items-center justify-between bg-white/[0.02]">
          <button
            onClick={handleReset}
            className="flex items-center space-x-1.5 px-3 py-2 rounded-xl text-xs font-medium text-slate-400 hover:text-white hover:bg-white/[0.06] transition-colors"
          >
            <RotateCcw size={13} />
            <span>Reset to Defaults</span>
          </button>

          <div className="flex items-center space-x-3">
            {savedToast && (
              <span className="text-xs font-mono text-emerald-400 flex items-center space-x-1 animate-fadeIn">
                <Check size={14} />
                <span>Settings Saved!</span>
              </span>
            )}

            <button
              onClick={handleSave}
              className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-zinc-600 to-zinc-600 hover:from-zinc-500 hover:to-zinc-500 text-white font-semibold text-xs shadow-[0_0_20px_rgba(168,85,247,0.3)] transition-all hover:scale-[1.02] active:scale-[0.98]"
            >
              Save Configuration
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
