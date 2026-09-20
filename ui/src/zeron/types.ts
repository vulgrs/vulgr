import type { ChatReducerState } from '../utils/claudeStreamParser.js';

export type EffortLevel = 'Low' | 'Medium' | 'High' | 'xHigh' | 'Max';

/** Effort labels mapped to the CLI's --effort values. */
export const EFFORT_LEVELS: EffortLevel[] = ['Low', 'Medium', 'High', 'xHigh', 'Max'];

export function effortToCli(effort: EffortLevel): string {
  return effort.toLowerCase();
}

/** A selectable model: display label + CLI alias passed to --model. */
export interface ModelOption {
  id: string; // CLI alias, e.g. 'fable'
  label: string; // display, e.g. 'Claude Fable 5'
}

export const MODEL_OPTIONS: ModelOption[] = [
  { id: 'fable', label: 'Claude Fable 5' },
  { id: 'opus', label: 'Claude Opus 5' },
  { id: 'sonnet', label: 'Claude Sonnet 5' },
  { id: 'haiku', label: 'Claude Haiku 4.5' },
];

/** A base64 image attached to a prompt. */
export interface ImageAttachment {
  id: string;
  name: string;
  mediaType: string;
  data: string; // base64, no data-URI prefix
  previewUrl: string; // data URI for thumbnail rendering
}

export interface Session {
  /** Local id used to route Claude Code stream events. */
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  /** Chat transcript + session meta reduced from stream-json events. */
  chat: ChatReducerState;
  running: boolean;
  /** True once the first prompt has been dispatched to the CLI. */
  started: boolean;
  cwd: string;
}

/** Relative time like "1m", "10m", "2h". */
export function relativeTime(ts: number): string {
  const secs = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (secs < 60) return `${secs}s`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  return `${Math.floor(hrs / 24)}d`;
}

/** Derive a short session title from the opening prompt. */
export function titleFromPrompt(prompt: string): string {
  const cleaned = prompt.trim().replace(/\s+/g, ' ');
  if (!cleaned) return 'New Session';
  const words = cleaned.split(' ').slice(0, 5).join(' ');
  const title = words.charAt(0).toUpperCase() + words.slice(1);
  return title.length > 34 ? title.slice(0, 34) + '…' : title;
}
