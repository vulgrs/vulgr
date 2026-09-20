import type { ChatMessage, ChatSessionMeta } from '../types/warp.js';

/** A raw Claude Code stream-json event (loosely typed). */
export type ClaudeEvent = Record<string, any> & { type?: string };

export interface ChatReducerState {
  messages: ChatMessage[];
  meta: ChatSessionMeta;
  /** Live text accumulated from partial-message deltas, shown as a transient bubble. */
  streamingText: string;
}

const STREAMING_ID = '__streaming__';

let counter = 0;
function nextId(prefix: string): string {
  counter += 1;
  return `${prefix}-${Date.now()}-${counter}`;
}

function now(): string {
  return new Date().toISOString();
}

/** Normalize a tool_use input object into a short, human-readable line. */
export function summarizeToolInput(name: string, input: any): string {
  if (!input || typeof input !== 'object') return '';
  switch (name) {
    case 'Bash':
      return String(input.command ?? '').slice(0, 400);
    case 'Read':
    case 'Edit':
    case 'Write':
    case 'NotebookEdit':
      return String(input.file_path ?? input.path ?? '');
    case 'Glob':
      return String(input.pattern ?? '');
    case 'Grep':
      return String(input.pattern ?? '') + (input.path ? ` in ${input.path}` : '');
    case 'WebFetch':
      return String(input.url ?? '');
    case 'TodoWrite':
      return Array.isArray(input.todos) ? `${input.todos.length} todos` : '';
    default: {
      try {
        const s = JSON.stringify(input);
        return s.length > 300 ? s.slice(0, 300) + '…' : s;
      } catch {
        return '';
      }
    }
  }
}

/** Flatten Anthropic content (string | block[]) into plain text. */
function contentToText(content: any): string {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .map((block) => {
        if (typeof block === 'string') return block;
        if (block?.type === 'text') return block.text ?? '';
        if (block?.type === 'tool_result') return contentToText(block.content);
        return '';
      })
      .filter(Boolean)
      .join('\n');
  }
  return '';
}

export function initialChatState(): ChatReducerState {
  return { messages: [], meta: {}, streamingText: '' };
}

function withoutStreaming(messages: ChatMessage[]): ChatMessage[] {
  return messages.filter((m) => m.id !== STREAMING_ID);
}

/**
 * Fold one Claude Code stream-json event into chat state.
 * Pure: returns a new state object.
 */
export function reduceChatEvent(state: ChatReducerState, event: ClaudeEvent): ChatReducerState {
  const type = event?.type;

  switch (type) {
    case 'system': {
      // init event carries session id / model / cwd / tool list
      const meta: ChatSessionMeta = {
        ...state.meta,
        claudeSessionId: event.session_id ?? state.meta.claudeSessionId,
        model: event.model ?? state.meta.model,
        cwd: event.cwd ?? state.meta.cwd,
      };
      return { ...state, meta };
    }

    case 'stream_event': {
      // Partial message deltas: accumulate a live preview bubble.
      const inner = event.event;
      if (inner?.type === 'message_start') {
        return { ...state, streamingText: '' };
      }
      if (inner?.type === 'content_block_delta' && inner.delta?.type === 'text_delta') {
        const streamingText = state.streamingText + (inner.delta.text ?? '');
        const others = withoutStreaming(state.messages);
        const bubble: ChatMessage = {
          id: STREAMING_ID,
          kind: 'assistant',
          text: streamingText,
          streaming: true,
          timestamp: now(),
        };
        return { ...state, streamingText, messages: [...others, bubble] };
      }
      return state;
    }

    case 'assistant': {
      // Finalized assistant turn: drop the streaming preview, emit real bubbles.
      const blocks = event.message?.content;
      const messages = withoutStreaming(state.messages);
      const additions: ChatMessage[] = [];

      if (Array.isArray(blocks)) {
        for (const block of blocks) {
          if (block?.type === 'text' && block.text?.trim()) {
            additions.push({
              id: nextId('assistant'),
              kind: 'assistant',
              text: block.text,
              timestamp: now(),
            });
          } else if (block?.type === 'thinking' && (block.thinking || '').trim()) {
            additions.push({
              id: nextId('thinking'),
              kind: 'thinking',
              text: block.thinking,
              timestamp: now(),
            });
          } else if (block?.type === 'tool_use') {
            additions.push({
              id: block.id || nextId('tool'),
              kind: 'tool_use',
              text: '',
              toolName: block.name,
              toolInput: summarizeToolInput(block.name, block.input),
              timestamp: now(),
            });
          }
        }
      } else {
        const text = contentToText(event.message?.content);
        if (text.trim()) {
          additions.push({ id: nextId('assistant'), kind: 'assistant', text, timestamp: now() });
        }
      }

      const meta = event.message?.model ? { ...state.meta, model: event.message.model } : state.meta;
      return { ...state, meta, streamingText: '', messages: [...messages, ...additions] };
    }

    case 'user': {
      // Tool results are delivered as synthetic user messages.
      const blocks = event.message?.content;
      const additions: ChatMessage[] = [];
      if (Array.isArray(blocks)) {
        for (const block of blocks) {
          if (block?.type === 'tool_result') {
            additions.push({
              id: nextId('result'),
              kind: 'tool_result',
              text: contentToText(block.content),
              isError: !!block.is_error,
              toolUseId: block.tool_use_id,
              timestamp: now(),
            });
          }
        }
      }
      if (additions.length === 0) return state;
      return { ...state, messages: [...state.messages, ...additions] };
    }

    case 'result': {
      const meta: ChatSessionMeta = {
        ...state.meta,
        claudeSessionId: event.session_id ?? state.meta.claudeSessionId,
        totalCostUsd: event.total_cost_usd ?? state.meta.totalCostUsd,
        numTurns: event.num_turns ?? state.meta.numTurns,
        durationMs: event.duration_ms ?? state.meta.durationMs,
      };
      // Only surface an explicit bubble on error turns; success is implicit.
      if (event.is_error || (typeof event.subtype === 'string' && event.subtype !== 'success')) {
        const errText = String(event.result ?? event.subtype ?? 'Turn ended with an error.');
        const base = withoutStreaming(state.messages);
        // Deduplicate: Claude often emits the same text as an assistant message
        // AND as the error result (e.g. spend-limit notices). Don't show twice.
        const last = base[base.length - 1];
        if (last && last.text.trim() === errText.trim()) {
          return { ...state, meta, streamingText: '', messages: base };
        }
        const bubble: ChatMessage = {
          id: nextId('result'),
          kind: 'error',
          text: errText,
          isError: true,
          timestamp: now(),
        };
        return { ...state, meta, messages: [...base, bubble] };
      }
      return { ...state, meta, streamingText: '', messages: withoutStreaming(state.messages) };
    }

    case 'stderr':
    case 'fatal':
    case 'raw': {
      const text = String(event.text ?? '').trim();
      if (!text) return state;
      const bubble: ChatMessage = {
        id: nextId('err'),
        kind: type === 'raw' ? 'assistant' : 'error',
        text,
        isError: type !== 'raw',
        timestamp: now(),
      };
      return { ...state, messages: [...state.messages, bubble] };
    }

    default:
      return state;
  }
}

/** Append a locally-authored user message (echoed immediately on send). */
export function appendUserMessage(
  state: ChatReducerState,
  text: string,
  images?: string[]
): ChatReducerState {
  const bubble: ChatMessage = {
    id: nextId('user'),
    kind: 'user',
    text,
    images: images && images.length > 0 ? images : undefined,
    timestamp: now(),
  };
  return { ...state, messages: [...state.messages, bubble] };
}
