import React, { useEffect, useRef, useState } from 'react';
import { Check, Copy, Download, ExternalLink, Loader2, LogIn, RotateCw, Square, TerminalSquare } from 'lucide-react';
import { toast } from 'sonner';
import { useI18n } from '../i18n/index.js';
import { useAgentSetup, type AgentStatus } from '../hooks/useAgentSetup.js';
import { AgentLogo } from './AgentLogo.js';

const MONO = "font-['Geist_Mono',ui-monospace,monospace]";

const iconButton =
  'flex items-center gap-1.5 px-2.5 py-1.5 rounded-[7px] text-[11px] text-zinc-400 hover:text-zinc-100 hover:bg-white/[0.06] transition-colors disabled:opacity-40';

const AgentRow: React.FC<{
  agent: AgentStatus;
  onRunInTerminal?: (command: string, title: string) => void;
}> = ({ agent, onRunInTerminal }) => {
  const { t } = useI18n();
  const s = t.agentSetup;
  const { phase, log, install, cancel } = useAgentSetup({ check: false });
  const [copied, setCopied] = useState(false);
  const [showLog, setShowLog] = useState(false);
  const logRef = useRef<HTMLPreElement>(null);
  const current = phase[agent.id] || 'idle';
  const output = log[agent.id] || '';
  const busy = current === 'installing';

  useEffect(() => {
    if (busy || current === 'failed') setShowLog(true);
  }, [busy, current]);
  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [output]);

  const copy = () => {
    if (!agent.command) return;
    navigator.clipboard.writeText(agent.command).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const runInstall = async () => {
    const result = await install(agent.id);
    if (result === 'installed') toast.success(s.installedToast(agent.name));
    else if (result === 'not-on-path') toast.warning(s.notFoundAfter(agent.name));
    else toast.error(s.failedToast(agent.name));
  };

  return (
    <div className="rounded-[11px] border border-zinc-800 bg-base-elevated/60">
      <div className="flex items-center gap-3 px-3.5 py-3">
        <AgentLogo id={agent.id} name={agent.name} size={36} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-[13px] text-zinc-100">{agent.name}</span>
            <span className="text-[10px] text-zinc-500">{agent.vendor}</span>
          </div>
          <div className={`mt-0.5 text-[10.5px] truncate ${MONO}`}>
            {busy ? (
              <span className="flex items-center gap-1.5 text-primary">
                <Loader2 size={10} className="animate-spin" /> {s.installing}
              </span>
            ) : agent.installed ? (
              <span className="flex items-center gap-1.5 text-emerald-400">
                <Check size={11} /> {s.installed}
                {agent.version && <span className="text-zinc-500">v{agent.version}</span>}
              </span>
            ) : agent.missing ? (
              <span className="text-amber-400">{s.missing(agent.missing)}</span>
            ) : (
              <span className="text-zinc-500" title={agent.command ?? ''}>
                {agent.command}
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-0.5 flex-shrink-0">
          <a href={agent.docs} target="_blank" rel="noreferrer" className={iconButton} title={s.docs}>
            <ExternalLink size={12} />
            <span className="hidden sm:inline">{s.docs}</span>
          </a>
          {!agent.installed && agent.command && (
            <button onClick={copy} className={iconButton} title={s.copy}>
              {copied ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />}
            </button>
          )}
          {!agent.installed && agent.command && onRunInTerminal && !busy && (
            <button onClick={() => onRunInTerminal(agent.command!, agent.name)} className={iconButton} title={s.runInTerminal}>
              <TerminalSquare size={12} />
            </button>
          )}
          {agent.installed ? (
            onRunInTerminal && (
              <button
                onClick={() => onRunInTerminal(agent.login, agent.name)}
                className="ml-1 flex items-center gap-1.5 px-3 py-1.5 rounded-[8px] border border-zinc-700 text-[11.5px] text-zinc-200 hover:bg-white/[0.06] transition-colors"
                title={s.signInHint(agent.login)}
              >
                <LogIn size={12} /> {s.signIn}
              </button>
            )
          ) : busy ? (
            <button
              onClick={() => cancel(agent.id)}
              className="ml-1 flex items-center gap-1.5 px-3 py-1.5 rounded-[8px] border border-zinc-700 text-[11.5px] text-zinc-300 hover:bg-white/[0.06] transition-colors"
            >
              <Square size={10} /> {s.cancel}
            </button>
          ) : (
            <button
              onClick={() => void runInstall()}
              disabled={!agent.command}
              className="ml-1 flex items-center gap-1.5 px-3 py-1.5 rounded-[8px] bg-zinc-100 text-zinc-900 text-[11.5px] hover:bg-zinc-200 transition-colors disabled:opacity-40"
            >
              {current === 'failed' ? <RotateCw size={12} /> : <Download size={12} />}
              {current === 'failed' ? s.retry : s.install}
            </button>
          )}
        </div>
      </div>

      {output && showLog && (
        <pre
          ref={logRef}
          className={`mx-3.5 mb-3 max-h-36 overflow-auto rounded-[8px] border border-zinc-800 bg-base-app px-3 py-2 text-[10.5px] leading-relaxed text-zinc-400 whitespace-pre-wrap break-all select-text ${MONO}`}
        >
          {output}
        </pre>
      )}
    </div>
  );
};

/** The list of agent CLIs with install / sign-in actions; used in the dialog and in onboarding. */
export const AgentSetupPanel: React.FC<{
  onRunInTerminal?: (command: string, title: string) => void;
  compact?: boolean;
}> = ({ onRunInTerminal, compact }) => {
  const { t } = useI18n();
  const s = t.agentSetup;
  const { agents, checking, refresh } = useAgentSetup();
  const count = agents.filter((a) => a.installed).length;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className={`text-[11px] text-zinc-500 ${MONO}`}>
          {agents.length ? s.summary(count, agents.length) : s.checking}
        </span>
        <button onClick={() => void refresh()} disabled={checking} className={iconButton}>
          <RotateCw size={11} className={checking ? 'animate-spin' : ''} /> {checking ? s.checking : s.refresh}
        </button>
      </div>
      <div className={`space-y-2 ${compact ? 'max-h-[260px] overflow-y-auto pr-1' : ''}`}>
        {agents.map((agent) => (
          <AgentRow key={agent.id} agent={agent} onRunInTerminal={onRunInTerminal} />
        ))}
      </div>
    </div>
  );
};
