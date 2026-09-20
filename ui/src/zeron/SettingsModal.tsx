import React, { useEffect, useState } from 'react';
import { X, ShieldCheck, ShieldAlert, Loader2, Check, KeyRound } from 'lucide-react';

const SYSTEM_ONE_MODELS = [
  { id: 'poolside/laguna-s-2.1-20260720:free', label: 'Poolside Laguna S 2.1 (free)' },
  { id: 'deepseek/deepseek-chat-v3.1:free', label: 'DeepSeek V3.1 (free)' },
  { id: 'qwen/qwen-2.5-coder-32b-instruct:free', label: 'Qwen 2.5 Coder 32B (free)' },
  { id: 'meta-llama/llama-3.3-70b-instruct:free', label: 'Llama 3.3 70B (free)' },
];

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({ isOpen, onClose }) => {
  const api = typeof window !== 'undefined' ? (window as any).warpApi : undefined;
  const [skipPermissions, setSkipPermissions] = useState(false);
  const [additionalFlags, setAdditionalFlags] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [systemOneModel, setSystemOneModel] = useState('poolside/laguna-s-2.1-20260720:free');
  const [loading, setLoading] = useState(true);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!isOpen || !api) return;
    setLoading(true);
    (async () => {
      try {
        const cfg = await api.getConfig?.();
        if (cfg?.claude) {
          setSkipPermissions(!!cfg.claude.skipPermissions);
          setAdditionalFlags((cfg.claude.additionalFlags || []).join(' '));
        }
        if (cfg) {
          setApiKey(cfg.openRouterApiKey || '');
          setSystemOneModel(cfg.systemOneModel || 'poolside/laguna-s-2.1-20260720:free');
        }
      } catch {}
      setLoading(false);
    })();
  }, [isOpen, api]);

  const save = async (next: {
    skipPermissions?: boolean;
    additionalFlags?: string;
    openRouterApiKey?: string;
    systemOneModel?: string;
  }) => {
    const skip = next.skipPermissions ?? skipPermissions;
    const flagsStr = next.additionalFlags ?? additionalFlags;
    const flags = flagsStr.trim() ? flagsStr.trim().split(/\s+/) : [];
    try {
      await api?.updateConfig?.({
        claude: { skipPermissions: skip, additionalFlags: flags },
        openRouterApiKey: next.openRouterApiKey ?? apiKey,
        systemOneModel: next.systemOneModel ?? systemOneModel,
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 1200);
    } catch {}
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 animate-[overlay-in_0.14s_ease-out]"
      onClick={onClose}
    >
      <div
        className="w-[460px] max-w-[92vw] rounded-2xl border border-white/10 bg-[#141416] shadow-[0_24px_60px_-12px_rgba(0,0,0,0.8)] animate-[modal-in_0.16s_cubic-bezier(0.16,1,0.3,1)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-white/[0.06]">
          <span className="text-[14px] font-semibold text-zinc-100">Settings</span>
          <button
            onClick={onClose}
            className="p-1 rounded-md text-zinc-500 hover:text-zinc-200 hover:bg-white/5"
          >
            <X size={16} />
          </button>
        </div>

        {loading ? (
          <div className="p-8 flex items-center justify-center text-zinc-500">
            <Loader2 size={18} className="animate-spin" />
          </div>
        ) : (
          <div className="p-5 space-y-5">
            {/* Permission mode */}
            <div>
              <div className="text-[12.5px] font-medium text-zinc-200 mb-1.5">Permissions</div>
              <p className="text-[11.5px] text-zinc-500 mb-2.5 leading-relaxed">
                Bypass lets Claude Code create files and run commands autonomously without asking.
                Accept edits only auto-applies file edits.
              </p>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => {
                    setSkipPermissions(false);
                    save({ skipPermissions: false });
                  }}
                  className={`flex items-center gap-2 px-3 py-2.5 rounded-xl border text-left transition-colors ${
                    !skipPermissions
                      ? 'border-emerald-500/40 bg-emerald-500/10 text-zinc-100'
                      : 'border-white/10 text-zinc-400 hover:bg-white/[0.04]'
                  }`}
                >
                  <ShieldCheck size={16} className="text-emerald-400 flex-shrink-0" />
                  <span className="text-[12px] font-medium">Accept edits</span>
                </button>
                <button
                  onClick={() => {
                    setSkipPermissions(true);
                    save({ skipPermissions: true });
                  }}
                  className={`flex items-center gap-2 px-3 py-2.5 rounded-xl border text-left transition-colors ${
                    skipPermissions
                      ? 'border-amber-500/40 bg-amber-500/10 text-zinc-100'
                      : 'border-white/10 text-zinc-400 hover:bg-white/[0.04]'
                  }`}
                >
                  <ShieldAlert size={16} className="text-amber-400 flex-shrink-0" />
                  <span className="text-[12px] font-medium">Bypass (autonomous)</span>
                </button>
              </div>
            </div>

            {/* Anthropic API key (System 1) */}
            <div>
              <div className="flex items-center gap-1.5 text-[12.5px] font-medium text-zinc-200 mb-1.5">
                <KeyRound size={13} className="text-zinc-400" /> OpenRouter API Key
              </div>
              <p className="text-[11.5px] text-zinc-500 mb-2 leading-relaxed">
                System 1 JSON derleyicisi için gerekir. .env içindeki OPENROUTER_API_KEY önceliklidir; buradaki değer yerelde saklanır.
              </p>
              <input
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                onBlur={() => save({})}
                placeholder="sk-or-v1-..."
                className="w-full rounded-lg bg-black/40 border border-white/10 focus:border-white/25 outline-none px-3 py-2 text-[12.5px] font-mono text-zinc-200 placeholder:text-zinc-600"
              />
              <div className="mt-2">
                <label className="text-[11px] text-zinc-500">System 1 modeli</label>
                <select
                  value={systemOneModel}
                  onChange={(e) => {
                    setSystemOneModel(e.target.value);
                    save({ systemOneModel: e.target.value });
                  }}
                  className="mt-1 w-full rounded-lg bg-black/40 border border-white/10 focus:border-white/25 outline-none px-3 py-2 text-[12.5px] text-zinc-200"
                >
                  {SYSTEM_ONE_MODELS.map((m) => (
                    <option key={m.id} value={m.id} className="bg-[#141416]">
                      {m.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Additional flags */}
            <div>
              <div className="text-[12.5px] font-medium text-zinc-200 mb-1.5">Additional CLI flags</div>
              <input
                value={additionalFlags}
                onChange={(e) => setAdditionalFlags(e.target.value)}
                onBlur={() => save({})}
                placeholder="e.g. --add-dir ../shared"
                className="w-full rounded-lg bg-black/40 border border-white/10 focus:border-white/25 outline-none px-3 py-2 text-[12.5px] font-mono text-zinc-200 placeholder:text-zinc-600"
              />
            </div>

            <div className="flex items-center justify-end h-4">
              {saved && (
                <span className="flex items-center gap-1 text-[11px] text-emerald-400">
                  <Check size={12} /> Saved
                </span>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
