import { BrowserWindow } from 'electron';
import type { ToolApprovalRequest } from '../src/engine/toolApproval.js';

interface Pending {
  chatId: string;
  resolve: (allow: boolean) => void;
}

/**
 * Carries tool approval requests from agent processes to the chat window and
 * the user's answer back. A request nobody can answer (window closed, chat
 * stopped) is refused, so an agent never waits forever.
 */
export class ApprovalBroker {
  private window: BrowserWindow | null = null;
  private pending = new Map<string, Pending>();
  private seq = 0;

  setWindow(win: BrowserWindow) {
    this.window = win;
  }

  /** Asks the user; `chatId` is the chat run (Claude session or team run) the request belongs to. */
  request(chatId: string, req: ToolApprovalRequest & { agent?: string }): Promise<boolean> {
    const win = this.window;
    if (!win || win.isDestroyed()) return Promise.resolve(false);
    const requestId = `appr-${Date.now()}-${++this.seq}`;
    return new Promise<boolean>((resolve) => {
      this.pending.set(requestId, { chatId, resolve });
      win.webContents.send('approval:request', {
        requestId,
        chatId,
        agent: req.agent ?? 'claude',
        tool: req.tool,
        input: req.input,
        description: req.description,
      });
    });
  }

  respond(requestId: string, allow: boolean): void {
    const p = this.pending.get(requestId);
    if (!p) return;
    this.pending.delete(requestId);
    p.resolve(allow);
  }

  /** Refuses whatever a stopped or finished chat run still has open, and clears its cards. */
  cancelChat(chatId: string): void {
    const ids: string[] = [];
    for (const [id, p] of this.pending) {
      if (p.chatId !== chatId) continue;
      this.pending.delete(id);
      p.resolve(false);
      ids.push(id);
    }
    if (ids.length && this.window && !this.window.isDestroyed()) {
      this.window.webContents.send('approval:cancelled', { requestIds: ids });
    }
  }
}
