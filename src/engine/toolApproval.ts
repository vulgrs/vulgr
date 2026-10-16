/**
 * Tool approvals for headless Claude Code runs. With
 * `--permission-prompt-tool stdio` the CLI doesn't refuse a tool its
 * permission mode doesn't allow (a shell command under acceptEdits); it sends a
 * `control_request` on stdout and waits for our `control_response` on stdin.
 */
import type { ToolApprovalRequest } from '../types/index.js';

/** How tool approvals are answered: ask the user, allow everything, or refuse as before. */
export type ApprovalMode = 'ask' | 'auto' | 'deny';

export function parseApprovalMode(raw: unknown): ApprovalMode {
  return raw === 'auto' || raw === 'deny' ? raw : 'ask';
}

export type { ToolApprovalRequest };

/** CLI flags that route approvals to us; nothing in 'deny' mode. */
export function approvalArgs(mode: ApprovalMode | undefined): string[] {
  return mode && mode !== 'deny' ? ['--permission-prompt-tool', 'stdio'] : [];
}

function inputSummary(input: any): string {
  if (!input || typeof input !== 'object') return typeof input === 'string' ? input : '';
  const v = input.command ?? input.file_path ?? input.path ?? input.url ?? input.pattern ?? input.query;
  if (typeof v === 'string') return v;
  try {
    return JSON.stringify(input).slice(0, 400);
  } catch {
    return '';
  }
}

/** The approval request inside a `control_request` event, if it is one. */
export function readApprovalRequest(event: any): (ToolApprovalRequest & { requestId: string; rawInput: unknown }) | null {
  if (event?.type !== 'control_request' || event.request?.subtype !== 'can_use_tool') return null;
  if (typeof event.request_id !== 'string') return null;
  const req = event.request;
  return {
    requestId: event.request_id,
    tool: String(req.display_name || req.tool_name || 'Tool'),
    input: inputSummary(req.input),
    description: typeof req.description === 'string' ? req.description : undefined,
    rawInput: req.input ?? {},
  };
}

/** The stdin line that answers an approval request. */
export function approvalResponseLine(requestId: string, allow: boolean, rawInput: unknown, isTr = false): string {
  const response = allow
    ? { behavior: 'allow', updatedInput: rawInput ?? {} }
    : {
        behavior: 'deny',
        message: isTr ? 'Kullanıcı bu işlemi onaylamadı.' : 'The user did not approve this.',
      };
  return JSON.stringify({ type: 'control_response', response: { subtype: 'success', request_id: requestId, response } }) + '\n';
}
