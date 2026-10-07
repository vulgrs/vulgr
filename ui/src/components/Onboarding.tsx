import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, Check, Copy, ExternalLink, Github, Loader2, Moon, Monitor, Sun, Terminal } from 'lucide-react';
import { useI18n, LANGUAGES, type Messages } from '../i18n/index.js';
import { useTheme, type ThemePreference } from '../theme.js';
import { useGitHubAuth } from '../hooks/useGitHubAuth.js';
import halftoneImage from '../assets/sidebar/halftone.png';
import agentIcon from '../assets/sidebar/agent.svg';
import branchIcon from '../assets/sidebar/branch.svg';
import folderIcon from '../assets/sidebar/folder.svg';
import duoLoopIcon from '../assets/sidebar/duo-loop.svg';
import agentSwarmIcon from '../assets/sidebar/agent-swarm.svg';
import orchestratorIcon from '../assets/sidebar/orchestrator.svg';
import { AgentSetupPanel } from './AgentSetupPanel.js';
import { AgentLogo } from './AgentLogo.js';
import { useAgentSetup } from '../hooks/useAgentSetup.js';

const STEPS = ['signin', 'prefs', 'install', 'terminals', 'split', 'command', 'agents', 'project', 'done'] as const;
type Step = (typeof STEPS)[number];

const MONO = "font-['Geist_Mono',ui-monospace,monospace]";

/* ---------- small mock pieces, drawn in the sidebar's own style ---------- */

const MockCard: React.FC<{ title: string; meta: string; active?: boolean; italic?: boolean; children?: React.ReactNode }> = ({
  title,
  meta,
  active,
  italic,
  children,
}) => (
  <div className={`rounded-[9px] bg-base-elevated border ${active ? 'border-zinc-600' : 'border-zinc-800'}`}>
    <div className="px-3 py-2">
      <div className="flex items-center gap-1.5">
        <img src={agentIcon} alt="" className="w-[9px] h-[11px]" />
        <span className={`text-[11px] ${active ? 'text-zinc-100' : 'text-zinc-500'} ${italic ? 'italic' : ''}`}>{title}</span>
      </div>
      <div className="flex items-center gap-1 pl-4 mt-0.5">
        <img src={branchIcon} alt="" className="w-[5px] h-[5px]" />
        <span className="text-[9px] text-zinc-500">{meta}</span>
      </div>
    </div>
    {children && <div className="px-1.5 pb-1.5 space-y-0.5">{children}</div>}
  </div>
);

const MockPaneRow: React.FC<{ title: string; active?: boolean }> = ({ title, active }) => (
  <div className={`flex items-center gap-2 px-2 py-1 rounded-[6px] ${active ? 'bg-white/[0.07]' : ''}`}>
    <span className="w-4 h-4 rounded-full border border-zinc-800 bg-base-app flex items-center justify-center text-zinc-500">
      <Terminal size={8} />
    </span>
    <span className={`text-[10px] ${active ? 'text-zinc-100' : 'text-zinc-400'}`}>{title}</span>
  </div>
);

const MockDock: React.FC<{ text: string; dim?: boolean }> = ({ text, dim }) => (
  <div className="border-t border-zinc-800 px-2.5 py-1.5 text-[10px]">
    <span className="text-zinc-500 font-bold mr-1.5">$</span>
    <span className={dim ? 'text-zinc-600' : 'text-zinc-200'}>{text}</span>
  </div>
);

/** The device code split into two boxed halves, the way GitHub's page asks for it. */
const CodeBoxes: React.FC<{ code: string }> = ({ code }) => (
  <div className="flex items-center gap-3">
    {code.split('-').map((half, i) => (
      <React.Fragment key={i}>
        {i > 0 && <span className="text-zinc-600 text-[22px]">–</span>}
        <div className="flex gap-1.5">
          {half.split('').map((ch, j) => (
            <span
              key={j}
              className="w-10 h-12 rounded-[8px] border border-zinc-700 bg-base-elevated flex items-center justify-center text-[24px] text-zinc-100"
            >
              {ch}
            </span>
          ))}
        </div>
      </React.Fragment>
    ))}
  </div>
);

/** The five agents as tiles, lit up once installed. */
const AGENT_TILES = [
  { id: 'claude', label: 'Claude Code' },
  { id: 'codex', label: 'Codex' },
  { id: 'opencode', label: 'OpenCode' },
  { id: 'agy', label: 'Antigravity' },
  { id: 'cursor', label: 'Cursor' },
];

const AgentTiles: React.FC = () => {
  const { agents } = useAgentSetup({ check: false });
  return (
    <div className="flex items-end gap-5">
      {AGENT_TILES.map((tile) => {
        const installed = agents.find((a) => a.id === tile.id)?.installed;
        return (
          <div key={tile.id} className="flex flex-col items-center gap-2">
            <span className="relative">
              <AgentLogo id={tile.id} name={tile.label} size={56} dim={!installed} />
              {installed && (
                <span className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-emerald-500 border-2 border-base-app flex items-center justify-center text-white">
                  <Check size={11} />
                </span>
              )}
            </span>
            <span className={`text-[10px] ${installed ? 'text-zinc-200' : 'text-zinc-500'}`}>{tile.label}</span>
          </div>
        );
      })}
    </div>
  );
};

const Visual: React.FC<{
  step: Step;
  t: Messages;
  avatarUrl?: string;
  userName?: string;
  userCode?: string;
  theme: string;
}> = ({ step, t, avatarUrl, userName, userCode, theme }) => {
  switch (step) {
    case 'signin':
      if (avatarUrl)
        return (
          <div className="flex flex-col items-center gap-3 animate-modal-in">
            <span className="relative">
              <img src={avatarUrl} alt="" className="w-20 h-20 rounded-full border border-zinc-700 object-cover" />
              <span className="absolute -bottom-0.5 -right-0.5 w-6 h-6 rounded-full bg-emerald-500 border-2 border-base-app flex items-center justify-center text-white">
                <Check size={13} />
              </span>
            </span>
            <span className="text-[13px] text-zinc-300">{userName}</span>
          </div>
        );
      if (userCode) return <CodeBoxes code={userCode} />;
      return (
        <div className="flex flex-col items-center justify-center gap-4">
          <img src="./logo-mark.svg" alt="" className="logo-mark w-16 h-16" />
          <div className="font-sans font-black text-[52px] leading-none tracking-tight text-zinc-100">Vulgr.</div>
        </div>
      );
    case 'done':
      return (
        <div className="flex flex-col items-center justify-center gap-4">
          <img src="./logo-mark.svg" alt="" className="logo-mark w-16 h-16" />
          <div className="font-sans font-black text-[52px] leading-none tracking-tight text-zinc-100">Vulgr.</div>
          <span className="flex items-center gap-1.5 text-[11px] text-emerald-400">
            <Check size={13} /> {t.onboarding.done.title}
          </span>
        </div>
      );
    case 'prefs':
      return (
        <div className="flex items-center gap-5">
          {(['dark', 'light'] as const).map((mode) => (
            <div
              key={mode}
              className={`w-40 h-28 rounded-[10px] border-2 overflow-hidden ${
                theme === mode ? 'border-primary' : 'border-zinc-800'
              } ${mode === 'dark' ? 'bg-[#08080a]' : 'bg-white'}`}
            >
              <div className={`h-4 border-b ${mode === 'dark' ? 'border-white/10 bg-[#131316]' : 'border-black/10 bg-[#f4f4f5]'}`} />
              <div className="flex h-full">
                <div className={`w-12 border-r ${mode === 'dark' ? 'border-white/10' : 'border-black/10'} p-1.5 space-y-1`}>
                  {[0, 1, 2].map((i) => (
                    <div key={i} className={`h-2 rounded ${mode === 'dark' ? 'bg-white/10' : 'bg-black/10'}`} />
                  ))}
                </div>
                <div className="flex-1 p-2 space-y-1">
                  <div className={`h-1.5 w-16 rounded ${mode === 'dark' ? 'bg-white/20' : 'bg-black/20'}`} />
                  <div className={`h-1.5 w-10 rounded ${mode === 'dark' ? 'bg-white/10' : 'bg-black/10'}`} />
                </div>
              </div>
            </div>
          ))}
        </div>
      );
    case 'install':
      return <AgentTiles />;
    case 'terminals':
      return (
        <div className="w-72 space-y-2">
          <MockCard title="npm test · git status" meta="main" active />
          <MockCard title={t.sidebar.untitled} meta="main" italic />
          <div className="flex items-center gap-2 px-1 pt-1">
            <span className="w-5 h-5 rounded-[5px] bg-base-elevated border border-zinc-800 flex items-center justify-center">
              <img src={folderIcon} alt="" className="w-[10px] h-[9px]" />
            </span>
            <span className="flex flex-col">
              <span className="text-[11px] text-zinc-100 leading-none">Frontend</span>
              <span className="text-[9px] text-zinc-500 mt-0.5">{t.sidebar.groupCount(1)}</span>
            </span>
          </div>
          <div className="ml-3 pl-3 border-l border-zinc-800">
            <MockCard title="Login" meta="main" />
          </div>
        </div>
      );
    case 'split':
      return (
        <div className="flex items-center gap-6">
          <div className="w-72 h-40 rounded-[10px] border border-zinc-800 bg-base-app overflow-hidden flex">
            {['npm run dev', 'git status'].map((cmd, i) => (
              <div key={cmd} className={`flex-1 flex flex-col ${i ? 'border-l border-zinc-800' : ''}`}>
                <div className="flex-1 p-2 text-[9px] text-zinc-600 space-y-1">
                  <div className="h-1 w-16 rounded bg-zinc-800" />
                  <div className="h-1 w-10 rounded bg-zinc-800" />
                </div>
                <MockDock text={cmd} />
              </div>
            ))}
          </div>
          <div className="w-44">
            <MockCard title="dev · status" meta={t.sidebar.panes(2)} active>
              <MockPaneRow title="npm run dev" />
              <MockPaneRow title="git status" active />
            </MockCard>
          </div>
        </div>
      );
    case 'command':
      return (
        <div className="w-96 rounded-[10px] border border-zinc-800 bg-base-app overflow-hidden">
          <MockDock text="git status" />
          <MockDock text="# port 3000'i kapat" />
          <div className="mx-2.5 mb-1.5 rounded-[6px] border border-zinc-800 bg-base-elevated px-2.5 py-1.5 text-[10px] text-zinc-300">
            <span className="text-zinc-500 mr-1.5">→</span>lsof -ti:3000 | xargs kill
          </div>
          <MockDock text="? bu hata neden oluyor" />
        </div>
      );
    case 'agents':
      return (
        <div className="w-64 space-y-1.5">
          {[
            { label: 'Duo Loop', icon: duoLoopIcon },
            { label: 'Agent Swarm', icon: agentSwarmIcon },
            { label: 'Orchestrator', icon: orchestratorIcon },
          ].map((m, i) => (
            <div
              key={m.label}
              className={`flex items-center gap-2.5 px-3 py-2 rounded-[9px] border ${
                i === 0 ? 'bg-base-elevated border-zinc-800' : 'border-transparent'
              }`}
            >
              <img src={m.icon} alt="" className="w-[11px] h-[11px]" />
              <span className="text-[12px] text-zinc-300">{m.label}</span>
            </div>
          ))}
        </div>
      );
    case 'project':
      return (
        <div className="w-96 rounded-[10px] border border-zinc-800 bg-base-app overflow-hidden text-[10px]">
          <div className="px-3 py-1.5 border-b border-zinc-800 text-zinc-400">src/login.ts</div>
          <div className="px-3 py-0.5 bg-red-500/10 text-red-400">- if (user) return true;</div>
          <div className="px-3 py-0.5 bg-emerald-500/10 text-emerald-400">+ if (user?.verified) return true;</div>
          <div className="px-3 py-0.5 text-zinc-500">  return false;</div>
          <div className="px-3 py-2 border-t border-zinc-800 flex justify-end">
            <span className="px-2 py-0.5 rounded-md bg-primary text-primary-foreground">Commit & Push</span>
          </div>
        </div>
      );
  }
};

/* ---------- the flow ---------- */

const ONBOARDED_KEY = 'vulgr.onboarded';

export const shouldShowOnboarding = (): boolean => {
  try {
    return localStorage.getItem(ONBOARDED_KEY) !== '1';
  } catch {
    return false;
  }
};

/** First launch: GitHub sign-in up front, preferences, then a tour of every part of the app. */
export const Onboarding: React.FC<{
  onDone: () => void;
  /** Leaves onboarding and opens a terminal tab running the command (agent sign-in). */
  onRunInTerminal?: (command: string, title: string) => void;
}> = ({ onDone, onRunInTerminal }) => {
  const { t, lang, setLang } = useI18n();
  const { theme, preference, setPreference } = useTheme();
  const { state, login, cancel, openProfile } = useGitHubAuth();
  const [index, setIndex] = useState(0);
  const [copied, setCopied] = useState(false);
  const step = STEPS[index];
  const isFirst = index === 0;
  const isLast = index === STEPS.length - 1;
  const user = state.status === 'signed-in' ? state.user : null;
  const pending = state.status === 'pending' ? state : null;
  // The sign-in screen waits for a decision: sign in, or "continue without".
  const blockedOnSignIn = step === 'signin' && !user;

  const finish = useCallback(() => {
    try {
      localStorage.setItem(ONBOARDED_KEY, '1');
    } catch {}
    onDone();
  }, [onDone]);

  const next = useCallback(() => (isLast ? finish() : setIndex((i) => i + 1)), [isLast, finish]);
  const back = useCallback(() => setIndex((i) => Math.max(0, i - 1)), []);

  // GitHub's page asks for the code: put it on the clipboard as soon as it exists.
  const copyCode = useCallback((code: string) => {
    navigator.clipboard.writeText(code).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }, []);
  useEffect(() => {
    if (pending?.userCode) copyCode(pending.userCode);
  }, [pending?.userCode, copyCode]);

  // Take keyboard focus from the command box underneath, so keys drive this flow
  // instead of typing into a terminal.
  const rootRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    (document.activeElement as HTMLElement | null)?.blur();
    rootRef.current?.focus();
  }, []);

  const onKeyDown = (e: React.KeyboardEvent) => {
    e.stopPropagation();
    // Enter on a focused button already clicks it.
    if (e.key === 'Enter' && (e.target as HTMLElement).tagName === 'BUTTON') return;
    if (blockedOnSignIn) {
      if (e.key === 'Enter' && state.status === 'signed-out') void login();
      return;
    }
    if (e.key === 'ArrowRight' || e.key === 'Enter') next();
    if (e.key === 'ArrowLeft') back();
  };

  const s = t.onboarding.signin;
  const text =
    step === 'signin'
      ? user
        ? { title: s.welcomeUser(user.name || user.login), body: s.signedInBody, points: undefined as string[] | undefined }
        : pending
          ? { title: s.codeTitle, body: s.codeBody, points: undefined }
          : { title: s.title, body: s.body, points: undefined }
      : step === 'install'
        ? { title: t.onboarding.install.title, body: t.onboarding.install.body, points: undefined as string[] | undefined }
        : step === 'prefs' || step === 'done'
        ? { ...t.onboarding[step], points: undefined as string[] | undefined }
        : t.onboarding[step];

  const themeOptions: { value: ThemePreference; label: string; icon: React.ReactNode }[] = [
    { value: 'dark', label: t.settings.themeDark, icon: <Moon size={12} /> },
    { value: 'light', label: t.settings.themeLight, icon: <Sun size={12} /> },
    { value: 'system', label: t.settings.themeSystem, icon: <Monitor size={12} /> },
  ];

  const choice = (active: boolean) =>
    `flex items-center gap-1.5 px-3 py-1.5 rounded-[7px] border text-[11px] transition-colors ${
      active ? 'border-zinc-500 bg-base-elevated text-zinc-100' : 'border-zinc-800 text-zinc-400 hover:text-zinc-100 hover:border-zinc-700'
    }`;

  return (
    <div
      ref={rootRef}
      tabIndex={-1}
      onKeyDown={onKeyDown}
      className={`fixed inset-0 z-[100] flex items-center justify-center bg-base-app ${MONO} select-none outline-none animate-overlay-in`}
    >
      <img
        src={halftoneImage}
        alt=""
        draggable={false}
        className="absolute bottom-0 right-0 w-[520px] opacity-60 brightness-[2.6] [.light_&]:brightness-100 pointer-events-none"
      />

      {!isLast && !blockedOnSignIn && (
        <button onClick={finish} className="absolute top-5 right-6 text-[11px] text-zinc-500 hover:text-zinc-100 transition-colors">
          {t.onboarding.skip}
        </button>
      )}

      <div className="relative w-[min(760px,92vw)] rounded-[16px] border border-zinc-800 bg-base-surface shadow-2xl overflow-hidden">
        <div className="h-[260px] flex items-center justify-center border-b border-zinc-800 bg-base-app">
          <Visual
            key={`${step}-${state.status}`}
            step={step}
            t={t}
            avatarUrl={user?.avatarUrl}
            userName={user ? user.name || user.login : undefined}
            userCode={pending?.userCode}
            theme={theme}
          />
        </div>

        <div key={`${step}-${state.status}`} className="px-9 pt-7 pb-6 min-h-[230px] animate-slide-in-up">
          {!isFirst && !isLast && (
            <div className="text-[10px] text-zinc-500 mb-2">{t.onboarding.stepOf(index, STEPS.length - 2)}</div>
          )}
          <h2 className="text-[22px] text-zinc-100 leading-tight">{text.title}</h2>
          <p className="mt-2 text-[12.5px] leading-relaxed text-zinc-400 max-w-[560px]">{text.body}</p>

          {text.points && (
            <ul className="mt-4 space-y-1.5">
              {text.points.map((point) => (
                <li key={point} className="flex items-start gap-2 text-[11.5px] text-zinc-300">
                  <span className="mt-[5px] w-1 h-1 rounded-full bg-zinc-500 flex-shrink-0" />
                  {point}
                </li>
              ))}
            </ul>
          )}

          {/* Sign-in: signed out → one clear button; waiting → what to do in the browser */}
          {step === 'signin' && !user && !pending && (
            <div className="mt-6 flex flex-col items-start gap-3">
              <button
                onClick={() => void login()}
                disabled={state.status === 'loading'}
                className="flex items-center gap-2.5 px-5 py-2.5 rounded-[9px] bg-zinc-100 text-zinc-900 text-[13px] hover:bg-zinc-200 transition-colors disabled:opacity-50"
              >
                <Github size={15} /> {s.continueWithGitHub}
              </button>
              {state.status === 'signed-out' && state.error && (
                <p className="text-[11px] text-red-400 max-w-[560px]">{t.profile.errors[state.error] ?? state.error}</p>
              )}
              <button onClick={next} className="text-[11px] text-zinc-500 hover:text-zinc-100 transition-colors">
                {s.skipForNow}
              </button>
            </div>
          )}

          {step === 'signin' && pending && (
            <div className="mt-5 space-y-4">
              <ol className="space-y-1.5">
                {[s.codeStep1, copied ? s.codeStep2Copied : s.codeStep2, s.codeStep3].map((line, i) => (
                  <li key={i} className="flex items-center gap-2.5 text-[11.5px] text-zinc-300">
                    <span className="w-4 h-4 rounded-full border border-zinc-700 text-[9px] text-zinc-400 flex items-center justify-center flex-shrink-0">
                      {i + 1}
                    </span>
                    {line}
                  </li>
                ))}
              </ol>
              <div className="flex items-center gap-4">
                <span className="flex items-center gap-1.5 text-[11px] text-zinc-500">
                  <Loader2 size={11} className="animate-spin" /> {t.profile.waiting}
                </span>
                <button
                  onClick={() => copyCode(pending.userCode)}
                  className="flex items-center gap-1 text-[11px] text-zinc-400 hover:text-zinc-100"
                >
                  {copied ? <Check size={11} className="text-emerald-400" /> : <Copy size={11} />} {t.profile.copyCode}
                </button>
                <button
                  onClick={() => openProfile(pending.verificationUri)}
                  className="flex items-center gap-1 text-[11px] text-zinc-400 hover:text-zinc-100"
                >
                  <ExternalLink size={11} /> {s.reopen}
                </button>
                <button onClick={cancel} className="text-[11px] text-zinc-500 hover:text-zinc-100">
                  {t.common.cancel}
                </button>
              </div>
            </div>
          )}

          {step === 'install' && (
            <div className="mt-4" onKeyDown={(e) => e.stopPropagation()}>
              <AgentSetupPanel
                compact
                onRunInTerminal={
                  onRunInTerminal &&
                  ((command, title) => {
                    finish();
                    onRunInTerminal(command, title);
                  })
                }
              />
            </div>
          )}

          {step === 'prefs' && (
            <div className="mt-5 space-y-3">
              <div className="flex items-center gap-3">
                <span className="w-14 text-[11px] text-zinc-500">{t.onboarding.prefs.language}</span>
                {LANGUAGES.map((l) => (
                  <button key={l.value} onClick={() => setLang(l.value)} className={choice(lang === l.value)}>
                    {l.label}
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-3">
                <span className="w-14 text-[11px] text-zinc-500">{t.onboarding.prefs.theme}</span>
                {themeOptions.map((o) => (
                  <button key={o.value} onClick={() => setPreference(o.value)} className={choice(preference === o.value)}>
                    {o.icon}
                    {o.label}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center justify-between px-9 pb-6">
          <div className="flex items-center gap-1.5">
            {STEPS.map((stepName, i) => (
              <button
                key={stepName}
                onClick={() => !blockedOnSignIn && setIndex(i)}
                className={`h-1.5 rounded-full transition-all ${i === index ? 'w-5 bg-zinc-200' : 'w-1.5 bg-zinc-700 hover:bg-zinc-500'}`}
                aria-label={String(i + 1)}
              />
            ))}
          </div>
          <div className="flex items-center gap-2">
            {!isFirst && (
              <button
                onClick={back}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-[8px] text-[12px] text-zinc-400 hover:text-zinc-100 transition-colors"
              >
                <ArrowLeft size={13} /> {t.onboarding.back}
              </button>
            )}
            {!blockedOnSignIn && (
              <button
                onClick={next}
                className="flex items-center gap-1.5 px-4 py-1.5 rounded-[8px] bg-zinc-100 text-zinc-900 text-[12px] hover:bg-zinc-200 transition-colors"
              >
                {isLast ? t.onboarding.finish : t.onboarding.next}
                {!isLast && <ArrowRight size={13} />}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
