import { existsSync, mkdirSync, readdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

/** A chat from the Chat view, as the app saved it. Messages are the UI's own objects. */
export interface ChatRecord {
  id: string;
  title: string;
  /** Folder the chat worked in. */
  cwd: string;
  mode?: 'solo' | 'team';
  /** Agents that answered in it, e.g. ['claude', 'codex']. */
  agents?: string[];
  createdAt: number;
  updatedAt: number;
  /** Claude Code session to resume when the chat continues. */
  claudeSessionId?: string;
  claudeCwd?: string;
  messages: Array<Record<string, unknown>>;
}

/** What the list shows: a record without its messages. */
export type ChatSummary = Omit<ChatRecord, 'messages'> & { messageCount: number };

const MAX_MESSAGES = 1500;
const MAX_TEXT = 20_000;

/** Ids become file names, so only plain characters. */
const safeId = (id: string) => /^[\w-]{1,80}$/.test(id);

/**
 * Saved chats, one JSON file each plus a small index for the list, so the
 * history survives restarts and opening the list never reads whole chats.
 * The oldest chats go past `limit`.
 */
export class ChatHistoryStore {
  constructor(private readonly dir: string, private readonly limit = 300) {}

  private file(id: string) {
    return join(this.dir, `${id}.json`);
  }

  private get indexFile() {
    return join(this.dir, 'index.json');
  }

  private readIndex(): ChatSummary[] {
    if (existsSync(this.indexFile)) {
      try {
        const parsed = JSON.parse(readFileSync(this.indexFile, 'utf-8'));
        if (Array.isArray(parsed)) return parsed;
      } catch {
        // Rebuilt below from the chat files.
      }
    }
    if (!existsSync(this.dir)) return [];
    const out: ChatSummary[] = [];
    for (const name of readdirSync(this.dir)) {
      if (!name.endsWith('.json') || name === 'index.json') continue;
      try {
        out.push(summarize(JSON.parse(readFileSync(join(this.dir, name), 'utf-8'))));
      } catch {
        // A damaged file is skipped, not fatal.
      }
    }
    return out;
  }

  private writeIndex(list: ChatSummary[]) {
    mkdirSync(this.dir, { recursive: true });
    writeFileSync(this.indexFile, JSON.stringify(list), 'utf-8');
  }

  /** Newest first; only the given folder's chats when `cwd` is set. */
  list(cwd?: string): ChatSummary[] {
    return this.readIndex()
      .filter((c) => !cwd || c.cwd === cwd)
      .sort((a, b) => b.updatedAt - a.updatedAt);
  }

  get(id: string): ChatRecord | null {
    if (!safeId(id) || !existsSync(this.file(id))) return null;
    try {
      return JSON.parse(readFileSync(this.file(id), 'utf-8'));
    } catch {
      return null;
    }
  }

  /** Saves (or replaces) a chat; returns its summary, or null when it is not a valid chat. */
  save(input: ChatRecord): ChatSummary | null {
    if (!input || !safeId(String(input.id)) || !Array.isArray(input.messages)) return null;
    if (typeof input.cwd !== 'string' || !Number.isFinite(input.createdAt)) return null;
    const record: ChatRecord = {
      ...input,
      title: String(input.title || '').slice(0, 200),
      updatedAt: Number.isFinite(input.updatedAt) ? input.updatedAt : Date.now(),
      messages: input.messages.slice(-MAX_MESSAGES).map(trimMessage),
    };
    mkdirSync(this.dir, { recursive: true });
    writeFileSync(this.file(record.id), JSON.stringify(record), 'utf-8');

    const summary = summarize(record);
    const list = [summary, ...this.readIndex().filter((c) => c.id !== record.id)].sort(
      (a, b) => b.updatedAt - a.updatedAt
    );
    for (const old of list.slice(this.limit)) {
      if (existsSync(this.file(old.id))) unlinkSync(this.file(old.id));
    }
    this.writeIndex(list.slice(0, this.limit));
    return summary;
  }

  remove(id: string): boolean {
    if (!safeId(id)) return false;
    const existed = existsSync(this.file(id));
    if (existed) unlinkSync(this.file(id));
    const list = this.readIndex();
    if (list.some((c) => c.id === id)) this.writeIndex(list.filter((c) => c.id !== id));
    return existed;
  }
}

function summarize(record: ChatRecord): ChatSummary {
  const { messages, ...rest } = record;
  return { ...rest, messageCount: Array.isArray(messages) ? messages.length : 0 };
}

/** Drops pasted image data (it can be megabytes) and caps very long texts. */
function trimMessage(m: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = { ...m, streaming: false };
  delete out.images;
  if (typeof out.text === 'string' && out.text.length > MAX_TEXT) out.text = `${out.text.slice(0, MAX_TEXT)}\n…`;
  return out;
}
