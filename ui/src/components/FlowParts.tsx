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

export interface AgentOption {
  value: string;
  label: string;
}

export const FlowHeader: React.FC<{ icon: string; title: string; subtitle: string }> = ({ icon, title, subtitle }) => (
  <div className="flex items-center gap-3 border-b border-zinc-900 px-5 py-4 pr-12">
    <span className="flex size-9 flex-shrink-0 items-center justify-center rounded-[10px] border border-zinc-800 bg-base-elevated">
      <img src={icon} alt="" draggable={false} className="h-[15px] w-auto" />
    </span>
    <div className="min-w-0">
      <DialogTitle className="text-[15px] font-medium text-zinc-100">{title}</DialogTitle>
      <DialogDescription className={`mt-0.5 text-[10.5px] text-zinc-500 ${MONO}`}>{subtitle}</DialogDescription>
    </div>
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
      ? 'border-primary/60 bg-primary/[0.07]'
      : state === 'failed'
        ? 'border-red-500/40 bg-red-500/[0.05]'
        : state === 'warn'
          ? 'border-amber-500/40 bg-amber-500/[0.05]'
          : 'border-zinc-800 bg-base-elevated/60';
  return (
    <div className={`min-w-0 flex-1 rounded-[11px] border px-3 py-2.5 transition-colors ${frame}`}>
      <div className="flex items-center justify-between gap-2">
        <span className={`text-[9.5px] uppercase tracking-[0.1em] text-zinc-500 ${MONO}`}>{step}</span>
        {state === 'active' && <Loader2 size={11} className="animate-spin text-primary" />}
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
