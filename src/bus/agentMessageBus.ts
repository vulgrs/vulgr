import { existsSync, mkdirSync, writeFileSync, appendFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';

export type AgentRole = 'claude' | 'agy' | 'gemini' | 'codex' | 'orchestrator';

export type MessageType =
  | 'USER_TASK'             // Orchestrator -> Builder
  | 'CODE_READY'            // Builder -> Verifier
  | 'VERIFICATION_FAILED'   // Verifier -> Builder (compiler errors, test failures)
  | 'VERIFICATION_PASSED'   // Verifier -> Auditor
  | 'PATCH_APPLIED'         // Builder -> Verifier (remediation)
  | 'SECURITY_CONCERN'      // Auditor -> Builder (vulnerabilities)
  | 'CONSENSUS_APPROVED';   // Auditor -> Orchestrator (final signoff)

export interface MessagePayload {
  summary: string;
  details?: string;
  gitDiff?: string;
  errorTrace?: string;
  filesChanged?: string[];
  recommendations?: string[];
}

export interface AgentMessage {
  id: string;
  runId: string;
  from: AgentRole;
  to: AgentRole | 'broadcast';
  type: MessageType;
  payload: MessagePayload;
  timestamp: string;
}

export type MessageHandler = (message: AgentMessage) => void | Promise<void>;

export class AgentMessageBus {
  private readonly busDir: string;
  private readonly messagesFile: string;
  private subscribers: Array<{
    filter?: { from?: AgentRole; to?: AgentRole | 'broadcast'; type?: MessageType };
    handler: MessageHandler;
  }> = [];

  constructor(workspaceDir: string = process.cwd()) {
    this.busDir = join(workspaceDir, '.ai-bridge', 'bus');
    if (!existsSync(this.busDir)) {
      mkdirSync(this.busDir, { recursive: true });
    }
    this.messagesFile = join(this.busDir, 'messages.jsonl');
  }

  /**
   * Publishes a message to the bus and notifies all matching subscribers.
   */
  async publish(
    runId: string,
    from: AgentRole,
    to: AgentRole | 'broadcast',
    type: MessageType,
    payload: MessagePayload
  ): Promise<AgentMessage> {
    const message: AgentMessage = {
      id: `msg-${Date.now()}-${randomBytes(3).toString('hex')}`,
      runId,
      from,
      to,
      type,
      payload,
      timestamp: new Date().toISOString(),
    };

    // 1. Persist to disk (append-only JSONL)
    appendFileSync(this.messagesFile, JSON.stringify(message) + '\n', 'utf-8');

    // 2. Dispatch to live subscribers
    for (const sub of this.subscribers) {
      if (sub.filter) {
        if (sub.filter.from && sub.filter.from !== from) continue;
        if (sub.filter.to && sub.filter.to !== to && to !== 'broadcast') continue;
        if (sub.filter.type && sub.filter.type !== type) continue;
      }
      try {
        await sub.handler(message);
      } catch (err) {
        console.error(`[AgentMessageBus] Handler error for message ${message.id}:`, err);
      }
    }

    return message;
  }

  /**
   * Subscribes to messages matching an optional filter.
   */
  subscribe(
    handler: MessageHandler,
    filter?: { from?: AgentRole; to?: AgentRole | 'broadcast'; type?: MessageType }
  ): () => void {
    const entry = { filter, handler };
    this.subscribers.push(entry);

    return () => {
      this.subscribers = this.subscribers.filter((s) => s !== entry);
    };
  }

  /**
   * Retrieves all historical messages for a given runId.
   */
  getRunMessages(runId: string): AgentMessage[] {
    if (!existsSync(this.messagesFile)) return [];

    const content = readFileSync(this.messagesFile, 'utf-8');
    const lines = content.split('\n').filter((l) => l.trim().length > 0);
    const messages: AgentMessage[] = [];

    for (const line of lines) {
      try {
        const msg = JSON.parse(line) as AgentMessage;
        if (msg.runId === runId) {
          messages.push(msg);
        }
      } catch {}
    }

    return messages;
  }

  /**
   * Cleans the message bus file.
   */
  clear(): void {
    if (existsSync(this.messagesFile)) {
      writeFileSync(this.messagesFile, '', 'utf-8');
    }
  }
}
