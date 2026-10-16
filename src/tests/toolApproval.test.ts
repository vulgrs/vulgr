import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  approvalArgs,
  approvalResponseLine,
  parseApprovalMode,
  readApprovalRequest,
} from '../engine/toolApproval.js';

describe('toolApproval', () => {
  const event = {
    type: 'control_request',
    request_id: 'r1',
    request: {
      subtype: 'can_use_tool',
      tool_name: 'Bash',
      display_name: 'Bash',
      input: { command: 'npm test', description: 'Run tests' },
      description: 'Run tests',
    },
  };

  it('reads a can_use_tool request and ignores other events', () => {
    assert.deepStrictEqual(readApprovalRequest(event), {
      requestId: 'r1',
      tool: 'Bash',
      input: 'npm test',
      description: 'Run tests',
      rawInput: { command: 'npm test', description: 'Run tests' },
    });
    assert.strictEqual(readApprovalRequest({ type: 'assistant' }), null);
    assert.strictEqual(readApprovalRequest({ type: 'control_request', request: { subtype: 'interrupt' } }), null);
  });

  it('answers with allow (keeping the input) or deny', () => {
    const allow = JSON.parse(approvalResponseLine('r1', true, { command: 'npm test' }));
    assert.deepStrictEqual(allow, {
      type: 'control_response',
      response: { subtype: 'success', request_id: 'r1', response: { behavior: 'allow', updatedInput: { command: 'npm test' } } },
    });
    const deny = JSON.parse(approvalResponseLine('r1', false, {}));
    assert.strictEqual(deny.response.response.behavior, 'deny');
    assert.ok(deny.response.response.message);
  });

  it('only routes approvals to us when not refusing', () => {
    assert.deepStrictEqual(approvalArgs('ask'), ['--permission-prompt-tool', 'stdio']);
    assert.deepStrictEqual(approvalArgs('auto'), ['--permission-prompt-tool', 'stdio']);
    assert.deepStrictEqual(approvalArgs('deny'), []);
    assert.strictEqual(parseApprovalMode('bogus'), 'ask');
    assert.strictEqual(parseApprovalMode('auto'), 'auto');
  });
});
