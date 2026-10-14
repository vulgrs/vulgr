import React, { useState } from 'react';
import { Check, ChevronDown, ChevronRight, Loader2, TerminalSquare, TriangleAlert, X } from 'lucide-react';
import { DialogDescription, DialogTitle } from '@/components/ui/dialog.js';
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger } from '@/components/ui/select.js';
import { Switch } from '@/components/ui/switch.js';
import { AgentLogo } from './AgentLogo.js';

/**
 * Building blocks shared by the Duo Loop and Agent Swarm screens, drawn in the
 * app's own style (zinc surfaces, Geist Mono labels, agent logos) instead of
 * the stock form controls.
 */

export const MONO = "font-['Geist_Mono',ui-monospace,monospace]";

/** Dialog surface matching the sidebar and panels. */
export const FLOW_DIALOG =
  'flex max-h-[88vh] flex-col gap-0 overflow-hidden rounded-[14px] border border-zinc-800 bg-base-surface p-0 text-zinc-200 ring-0 shadow-[var(--shadow-modal)]';

/**
 * onOpenChange for the flow dialogs: they close only when the person asks
 * (X / Close button, Escape). A click outside or focus moving to the terminal
 * (e.g. when a run finishes) must not hide a run or its result.
 */
export const closeOnlyOnRequest =
  (onClose: () => void) =>
  (open: boolean, details?: { reason?: string }) => {
    if (!open && (details?.reason === 'close-press' || details?.reason === 'escape-key')) onClose();
  };

export interface AgentOption {
  value: string;
  label: string;
}

/** The main action of a flow, in the flow's own colour. */
export const ACCENT_BUTTON =
  'bg-[color:var(--flow-accent)] text-zinc-950 hover:bg-[color:color-mix(in_oklab,var(--flow-accent)_85%,white)] disabled:opacity-40';

/** Each flow has its own colour, set on the dialog as --flow-accent. */
export const ACCENT = {
  duo: '#f472b6',
  swarm: '#a78bfa',
  orchestra: '#f59e0b',
} as const;

export const accentStyle = (accent: string) => ({ '--flow-accent': accent }) as React.CSSProperties;

export const FlowHeader: React.FC<{
  icon: string;
  title: string;
  subtitle: string;
  /** Drawn left of the dialog's close button, e.g. the List / System switch. */
  actions?: React.ReactNode;
}> = ({ icon, title, subtitle, actions }) => (
  <div className="relative flex items-center gap-3 overflow-hidden border-b border-zinc-900 px-5 py-4 pr-12 bg-[linear-gradient(180deg,color-mix(in_oklab,var(--flow-accent)_10%,transparent),transparent)]">
    <span className="absolute inset-x-0 top-0 h-px bg-[linear-gradient(90deg,transparent,var(--flow-accent),transparent)] opacity-70" />
    <span className="relative flex size-9 flex-shrink-0 items-center justify-center rounded-[10px] border border-[color:color-mix(in_oklab,var(--flow-accent)_45%,transparent)] bg-[color-mix(in_oklab,var(--flow-accent)_12%,var(--color-base-elevated))]">
      <img src={icon} alt="" draggable={false} className="h-[15px] w-auto" />
    </span>
    <div className="relative min-w-0 flex-1">
      <DialogTitle className="text-[15px] font-medium text-zinc-100">{title}</DialogTitle>
      <DialogDescription className={`mt-0.5 text-[10.5px] text-zinc-500 ${MONO}`}>{subtitle}</DialogDescription>
    </div>
    {actions && <div className="relative flex-shrink-0">{actions}</div>}
  </div>
);

export const SectionLabel: React.FC<{ children: React.ReactNode; htmlFor?: string }> = ({ children, htmlFor }) => (
  <label htmlFor={htmlFor} className={`mb-2 block text-[9.5px] uppercase tracking-[0.1em] text-zinc-500 ${MONO}`}>
    {children}
  </label>
);

export const GoalInput: React.FC<{
  id: string;
  value: string;
  placeholder: string;
  disabled?: boolean;
  onChange: (value: string) => void;
  onSubmit: () => void;
}> = ({ id, value, placeholder, disabled, onChange, onSubmit }) => (
  <textarea
    id={id}
    autoFocus
    rows={3}
    value={value}
    disabled={disabled}
    placeholder={placeholder}
    onChange={(e) => onChange(e.target.value)}
    onKeyDown={(e) => {
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        onSubmit();
      }
    }}
    className="w-full resize-none rounded-[11px] border border-zinc-800 bg-base-app px-3.5 py-3 text-[13px] leading-relaxed text-zinc-100 outline-none transition-colors placeholder:text-zinc-600 focus:border-zinc-600 disabled:opacity-60"
  />
);

const OptionLogo: React.FC<{ value: string; label: string; size: number }> = ({ value, label, size }) =>
  value === 'shell' ? (
    <span
      className="flex flex-shrink-0 items-center justify-center border border-white/10 bg-[#18181b] text-zinc-300"
      style={{ width: size, height: size, borderRadius: size * 0.26 }}
    >
      <TerminalSquare size={size * 0.56} />
    </span>
  ) : (
    <AgentLogo id={value} name={label} size={size} />
  );

export type RoleState = 'idle' | 'active' | 'done' | 'warn' | 'failed';

/** One role in the flow: its step, the chosen agent (a picker with logos) and what it does. */
export const RoleCard: React.FC<{
  step: string;
  duty: string;
  value: string;
  options: AgentOption[];
  disabled?: boolean;
  state?: RoleState;
  onChange: (value: string) => void;
}> = ({ step, duty, value, options, disabled, state = 'idle', onChange }) => {
  const current = options.find((o) => o.value === value) ?? { value, label: value };
  const frame =
    state === 'active'
      ? 'border-[color:var(--flow-accent)] bg-[color-mix(in_oklab,var(--flow-accent)_8%,transparent)]'
      : state === 'failed'
        ? 'border-red-500/40 bg-red-500/[0.05]'
        : state === 'warn'
          ? 'border-amber-500/40 bg-amber-500/[0.05]'
          : 'border-zinc-800 bg-base-elevated/60';
  return (
    <div className={`min-w-0 flex-1 rounded-[11px] border px-3 py-2.5 transition-colors ${frame}`}>
      <div className="flex items-center justify-between gap-2">
        <span className={`text-[9.5px] uppercase tracking-[0.1em] text-zinc-500 ${MONO}`}>{step}</span>
        {state === 'active' && <Loader2 size={11} className="animate-spin text-[color:var(--flow-accent)]" />}
        {state === 'done' && <Check size={12} className="text-emerald-400" />}
        {state === 'warn' && <TriangleAlert size={11} className="text-amber-400" />}
        {state === 'failed' && <X size={12} className="text-red-400" />}
      </div>
      <Select
        // Remount when locked so a menu left open closes once the run starts.
        key={disabled ? 'locked' : 'editable'}
        items={options}
        value={value}
        disabled={disabled}
        onValueChange={(next) => {
          if (next) onChange(next as string);
        }}
      >
        <SelectTrigger
          className="mt-2 h-auto w-full min-w-0 gap-2 rounded-[8px] border-0 bg-transparent px-0 py-0 shadow-none hover:bg-transparent focus-visible:ring-0 disabled:opacity-100 dark:bg-transparent dark:hover:bg-transparent [&>svg:last-child]:hidden"
        >
          <OptionLogo value={current.value} label={current.label} size={26} />
          <span className="min-w-0 flex-1 truncate text-left text-[13px] text-zinc-100">{current.label}</span>
          {!disabled && <ChevronDown size={13} className="flex-shrink-0 text-zinc-500" />}
        </SelectTrigger>
        <SelectContent className="min-w-52">
          <SelectGroup>
            {options.map((o) => (
              <SelectItem key={o.value} value={o.value} className="gap-2 py-1.5">
                <OptionLogo value={o.value} label={o.label} size={18} />
                {o.label}
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
      <p className="mt-2 text-[11px] leading-snug text-zinc-500">{duty}</p>
    </div>
  );
};

/** The arrow between two role cards. */
export const FlowArrow: React.FC<{ icon?: React.ReactNode }> = ({ icon }) => (
  <span className="flex flex-shrink-0 items-center self-center text-zinc-600">{icon ?? <ChevronRight size={14} />}</span>
);

/** Collapsed "Settings · summary" row that opens the less used options. */
export const SettingsDisclosure: React.FC<{ label: string; summary: string; children: React.ReactNode }> = ({
  label,
  summary,
  children,
}) => {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-1.5 rounded-[7px] py-1 text-[11.5px] text-zinc-400 transition-colors hover:text-zinc-200"
      >
        <ChevronRight size={13} className={`transition-transform ${open ? 'rotate-90' : ''}`} />
        {label}
        <span className={`ml-auto truncate pl-3 text-[10.5px] text-zinc-500 ${MONO}`}>{summary}</span>
      </button>
      {open && (
        <div className="mt-2 divide-y divide-zinc-800/70 rounded-[11px] border border-zinc-800 bg-base-elevated/40">
          {children}
        </div>
      )}
    </div>
  );
};

/** One option inside the settings box: label and hint on the left, the control on the right or below. */
export const SettingRow: React.FC<{
  label: string;
  hint: string;
  htmlFor?: string;
  control: React.ReactNode;
  stacked?: boolean;
}> = ({ label, hint, htmlFor, control, stacked }) => (
  <div className={`px-3.5 py-3 ${stacked ? '' : 'flex items-center gap-4'}`}>
    <div className="min-w-0 flex-1">
      <label htmlFor={htmlFor} className="block text-[12px] text-zinc-200">
        {label}
      </label>
      <p className="mt-0.5 text-[10.5px] leading-snug text-zinc-500">{hint}</p>
    </div>
    <div className={stacked ? 'mt-2' : 'flex-shrink-0'}>{control}</div>
  </div>
);

export const FlowInput: React.FC<React.InputHTMLAttributes<HTMLInputElement>> = ({ className = '', ...props }) => (
  <input
    {...props}
    className={`h-8 w-full rounded-[8px] border border-zinc-800 bg-base-app px-2.5 text-[12px] text-zinc-100 outline-none transition-colors placeholder:text-zinc-600 focus:border-zinc-600 disabled:opacity-60 ${MONO} ${className}`}
  />
);

/** Small segmented control, e.g. for the number of rounds. */
export const Segmented: React.FC<{
  value: string;
  items: { value: string; label: string }[];
  disabled?: boolean;
  onChange: (value: string) => void;
}> = ({ value, items, disabled, onChange }) => (
  <div className="flex rounded-[8px] border border-zinc-800 bg-base-app p-0.5">
    {items.map((item) => (
      <button
        key={item.value}
        type="button"
        disabled={disabled}
        onClick={() => onChange(item.value)}
        className={`min-w-7 rounded-[6px] px-2 py-1 text-[11px] transition-colors ${MONO} ${
          item.value === value ? 'bg-zinc-800 text-zinc-100' : 'text-zinc-500 hover:text-zinc-300'
        }`}
      >
        {item.label}
      </button>
    ))}
  </div>
);

export const FlowSwitch = Switch;

export const Kbd: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <kbd className={`rounded-[5px] border border-zinc-800 bg-base-elevated px-1.5 py-0.5 text-[10px] text-zinc-400 ${MONO}`}>
    {children}
  </kbd>
);

export const isMac = typeof navigator !== 'undefined' && /Mac/i.test(navigator.platform);

/** Footer: a hint or the "not installed" link on the left, the actions on the right. */
export const FlowFooter: React.FC<{ left?: React.ReactNode; children: React.ReactNode }> = ({ left, children }) => (
  <div className="flex items-center gap-3 border-t border-zinc-900 px-5 py-3">
    <div className="flex min-w-0 flex-1 items-center gap-2 text-[11px] text-zinc-500">{left}</div>
    <div className="flex flex-shrink-0 items-center gap-2">{children}</div>
  </div>
);

/** "Not installed: Codex, Cursor · Install" for the footer. */
export const MissingAgents: React.FC<{ names: string[]; text: (names: string) => string; action: string; onInstall?: () => void }> = ({
  names,
  text,
  action,
  onInstall,
}) =>
  names.length === 0 ? null : (
    <span className="min-w-0 truncate">
      {text(names.join(', '))}
      {onInstall && (
        <>
          {' · '}
          <button type="button" onClick={onInstall} className="text-zinc-300 underline-offset-2 hover:underline">
            {action}
          </button>
        </>
      )}
    </span>
  );

/** Lines fanning out from one card to many (split) or back into one (join), for the Orchestrator's tree. */
export const TreeFan: React.FC<{ branches: number; join?: boolean }> = ({ branches, join }) => {
  const n = Math.max(1, Math.min(branches, 5));
  const xs = Array.from({ length: n }, (_, i) => (n === 1 ? 50 : 14 + (72 * i) / (n - 1)));
  return (
    <svg viewBox="0 0 100 24" preserveAspectRatio="none" className="h-6 w-full" aria-hidden>
      {xs.map((x) => (
        <path
          key={x}
          d={join ? `M ${x} 0 C ${x} 14, 50 10, 50 24` : `M 50 0 C 50 14, ${x} 10, ${x} 24`}
          fill="none"
          stroke="color-mix(in oklab, var(--flow-accent) 55%, transparent)"
          strokeWidth={1.25}
          vectorEffect="non-scaling-stroke"
        />
      ))}
    </svg>
  );
};

/** A role card drawn as a small terminal pane, for Duo Loop where each agent gets a pane. */
export const PaneFrame: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <div className="min-w-0 flex-1 overflow-hidden rounded-[11px] border border-zinc-800 bg-base-app">
    <div className="flex items-center gap-1.5 border-b border-zinc-900 px-2.5 py-1.5">
      <span className="size-[7px] rounded-full bg-zinc-700" />
      <span className="size-[7px] rounded-full bg-zinc-700" />
      <span className="size-[7px] rounded-full bg-zinc-700" />
      <span className={`ml-1.5 truncate text-[9.5px] uppercase tracking-[0.1em] text-zinc-500 ${MONO}`}>{title}</span>
    </div>
    <div className="p-1.5 [&>div]:border-0 [&>div]:bg-transparent">{children}</div>
  </div>
);

/** Duo Loop's centre piece: a ring with arrows going round, the loop the two agents run. */
export const LoopRing: React.FC<{ label?: string; spinning?: boolean }> = ({ label, spinning }) => (
  <div className="relative flex size-[64px] flex-shrink-0 items-center justify-center self-center">
    <svg viewBox="0 0 64 64" className={`absolute inset-0 ${spinning ? 'animate-[spin_6s_linear_infinite]' : ''}`} aria-hidden>
      <circle cx="32" cy="32" r="26" fill="none" stroke="var(--color-zinc-800)" strokeWidth="1.5" />
      <path d="M 32 6 A 26 26 0 0 1 58 32" fill="none" stroke="var(--flow-accent)" strokeWidth="2" strokeLinecap="round" />
      <path d="M 32 58 A 26 26 0 0 1 6 32" fill="none" stroke="var(--flow-accent)" strokeWidth="2" strokeLinecap="round" />
      <path d="M 55 26 L 58 32 L 61 26" fill="none" stroke="var(--flow-accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M 9 38 L 6 32 L 3 38" fill="none" stroke="var(--flow-accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
    {label && <span className={`relative text-[10px] text-zinc-300 ${MONO}`}>{label}</span>}
  </div>
);

/** Swarm's pipeline: numbered stops on a vertical rail, one role per stop. */
export const RailStep: React.FC<{ n: number; last?: boolean; state?: RoleState; children: React.ReactNode }> = ({ n, last, state = 'idle', children }) => (
  <div className="relative flex gap-3">
    {!last && <span className="absolute top-8 bottom-[-8px] left-[13px] w-px bg-zinc-800" />}
    <span
      className={`relative z-[1] mt-2.5 flex size-[27px] flex-shrink-0 items-center justify-center rounded-full border text-[11px] ${MONO} ${
        state === 'active'
          ? 'border-[color:var(--flow-accent)] bg-[color-mix(in_oklab,var(--flow-accent)_18%,var(--color-base-app))] text-zinc-100'
          : state === 'done'
            ? 'border-emerald-500/50 bg-emerald-500/10 text-emerald-300'
            : 'border-zinc-800 bg-base-app text-zinc-500'
      }`}
    >
      {n}
    </span>
    <div className="min-w-0 flex-1 pb-2">{children}</div>
  </div>
);
