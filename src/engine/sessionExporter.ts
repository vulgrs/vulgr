import { ContextOptimizer } from './contextOptimizer.js';

export interface ReportCommandBlock {
  id: string;
  command: string;
  exitCode: number | null;
  timestamp: string;
  durationMs?: number;
  stdout: string;
  stderr: string;
  isExecuting?: boolean;
}

export interface ReportAgentEvent {
  agent: string;
  role?: string;
  action: string;
  status: 'success' | 'failed' | 'in_progress' | 'info';
  timestamp: string;
  details?: string;
}

export interface SessionReportData {
  title: string;
  workspacePath: string;
  branch?: string | null;
  timestamp: string;
  totalDurationSeconds?: number;
  commands: ReportCommandBlock[];
  agentEvents?: ReportAgentEvent[];
  gitDiff?: string;
  filesChanged?: string[];
  doctor?: {
    node?: boolean;
    git?: boolean;
    claude?: boolean;
    agy?: boolean;
    codex?: boolean;
  } | null;
}

export interface ExportOptions {
  includeDiff?: boolean;
  stripAnsi?: boolean;
  maxOutputLines?: number;
}

export class SessionExporter {
  /**
   * Generates a GitHub Flavored Markdown technical report.
   */
  static toMarkdown(data: SessionReportData, options: ExportOptions = {}): string {
    const { includeDiff = true, stripAnsi = true, maxOutputLines = 300 } = options;

    const totalCmds = data.commands.length;
    const passedCmds = data.commands.filter((c) => c.exitCode === 0).length;
    const failedCmds = data.commands.filter((c) => c.exitCode !== null && c.exitCode !== 0).length;
    const successRate = totalCmds > 0 ? Math.round((passedCmds / totalCmds) * 100) : 100;

    const lines: string[] = [];

    // Header & Meta
    lines.push(`# ⚡ Vulgr Technical Session Report`);
    lines.push(`> **Workspace:** \`${data.workspacePath || 'Active Workspace'}\`  `);
    lines.push(`> **Branch:** \`${data.branch || 'HEAD'}\` | **Generated:** ${data.timestamp}  `);
    lines.push('');

    // Summary Badges / Metrics Table
    lines.push('### 📋 Executive Summary');
    lines.push('| Metric | Value | Status |');
    lines.push('| :--- | :--- | :--- |');
    lines.push(`| **Total Commands** | ${totalCmds} | 🚀 |`);
    lines.push(`| **Passed** | ${passedCmds} | ${passedCmds > 0 ? '✅' : '⚪'} |`);
    lines.push(`| **Failed** | ${failedCmds} | ${failedCmds === 0 ? '✅ 0 Failures' : '⚠️ ' + failedCmds + ' Failed'} |`);
    lines.push(`| **Success Rate** | ${successRate}% | ${successRate >= 80 ? '🟢 Stable' : '🔴 Unstable'} |`);
    if (data.agentEvents && data.agentEvents.length > 0) {
      lines.push(`| **AI Agent Events** | ${data.agentEvents.length} | 🤖 Orchestrated |`);
    }
    if (data.filesChanged && data.filesChanged.length > 0) {
      lines.push(`| **Files Modified** | ${data.filesChanged.length} files | 📝 Working Copy |`);
    }
    lines.push('');

    // AI Agent Events Section (if available)
    if (data.agentEvents && data.agentEvents.length > 0) {
      lines.push('### 🤖 Autonomous Agent Handoffs & Verification');
      lines.push('');
      for (const ev of data.agentEvents) {
        const icon =
          ev.status === 'success' ? '✅' : ev.status === 'failed' ? '❌' : ev.status === 'in_progress' ? '🔄' : 'ℹ️';
        lines.push(`- **[${ev.timestamp}]** ${icon} **${ev.agent.toUpperCase()}**${ev.role ? ` (${ev.role})` : ''}: ${ev.action}`);
        if (ev.details) {
          lines.push(`  > ${ev.details.replace(/\n/g, ' ')}`);
        }
      }
      lines.push('');
    }

    // Command Timeline Section
    lines.push('### ⏱️ Terminal Execution Timeline');
    lines.push('');

    if (data.commands.length === 0) {
      lines.push('_No command blocks recorded in this session._');
      lines.push('');
    } else {
      data.commands.forEach((block, idx) => {
        const isSuccess = block.exitCode === 0;
        const statusBadge = isSuccess ? '`PASS (0)`' : block.exitCode !== null ? `\`FAIL (${block.exitCode})\`` : '`RUNNING`';
        const icon = isSuccess ? '✅' : '❌';

        lines.push(`#### ${idx + 1}. ${icon} \`${block.command}\` — ${statusBadge}`);
        lines.push(`*Recorded at ${block.timestamp}${block.durationMs ? ` • ${block.durationMs}ms` : ''}*`);
        lines.push('');

        let rawOutput = `${block.stdout}\n${block.stderr}`.trim();
        if (stripAnsi) {
          rawOutput = ContextOptimizer.stripAnsi(rawOutput);
        }

        if (rawOutput) {
          const outputLines = rawOutput.split('\n');
          const truncated =
            outputLines.length > maxOutputLines
              ? outputLines.slice(0, maxOutputLines).join('\n') + `\n\n... [${outputLines.length - maxOutputLines} lines truncated]`
              : rawOutput;

          lines.push('<details>');
          lines.push(`<summary><b>View Output (${outputLines.length} lines)</b></summary>`);
          lines.push('');
          lines.push('```text');
          lines.push(truncated);
          lines.push('```');
          lines.push('</details>');
        } else {
          lines.push('*(No terminal output)*');
        }
        lines.push('');
      });
    }

    // Git Diff & Uncommitted Changes Section
    if (includeDiff && data.gitDiff && data.gitDiff.trim().length > 0) {
      lines.push('### 🔍 Working Copy Git Changes');
      if (data.filesChanged && data.filesChanged.length > 0) {
        lines.push('**Modified Files:**');
        for (const file of data.filesChanged) {
          lines.push(`- \`${file}\``);
        }
        lines.push('');
      }

      const diffClean = stripAnsi ? ContextOptimizer.stripAnsi(data.gitDiff) : data.gitDiff;
      lines.push('<details>');
      lines.push(`<summary><b>Inspect Unified Git Diff</b></summary>`);
      lines.push('');
      lines.push('```diff');
      lines.push(diffClean);
      lines.push('```');
      lines.push('</details>');
      lines.push('');
    }

    lines.push('---');
    lines.push(`*Generated by [Vulgr CLI Orchestrator](https://github.com/google/vulgaris) on ${data.timestamp}*`);

    return lines.join('\n');
  }

  /**
   * Generates a standalone, dark-mode single-file HTML document.
   */
  static toHtml(data: SessionReportData, options: ExportOptions = {}): string {
    const { includeDiff = true, stripAnsi = true } = options;

    const totalCmds = data.commands.length;
    const passedCmds = data.commands.filter((c) => c.exitCode === 0).length;
    const failedCmds = data.commands.filter((c) => c.exitCode !== null && c.exitCode !== 0).length;
    const successRate = totalCmds > 0 ? Math.round((passedCmds / totalCmds) * 100) : 100;

    const escapeHtml = (str: string) =>
      str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');

    const commandsHtml = data.commands
      .map((cmd, idx) => {
        const isSuccess = cmd.exitCode === 0;
        let out = `${cmd.stdout}\n${cmd.stderr}`.trim();
        if (stripAnsi) out = ContextOptimizer.stripAnsi(out);

        return `
        <div class="command-card ${isSuccess ? 'pass' : 'fail'}" data-command="${escapeHtml(cmd.command.toLowerCase())}">
          <div class="command-header">
            <div class="cmd-info">
              <span class="cmd-index">#${idx + 1}</span>
              <span class="status-badge ${isSuccess ? 'badge-pass' : 'badge-fail'}">
                ${isSuccess ? '✔ PASS' : `✖ EXIT ${cmd.exitCode ?? 1}`}
              </span>
              <code class="cmd-text">$ ${escapeHtml(cmd.command)}</code>
            </div>
            <div class="cmd-meta">
              <span>${escapeHtml(cmd.timestamp)}</span>
              ${cmd.durationMs ? `<span>• ${cmd.durationMs}ms</span>` : ''}
              <button class="copy-btn" onclick="navigator.clipboard.writeText(${JSON.stringify(cmd.command)})">Copy</button>
            </div>
          </div>
          ${
            out
              ? `
          <div class="command-output">
            <pre><code>${escapeHtml(out)}</code></pre>
          </div>`
              : '<div class="no-output">(no output recorded)</div>'
          }
        </div>
      `;
      })
      .join('\n');

    let diffHtml = '';
    if (includeDiff && data.gitDiff && data.gitDiff.trim().length > 0) {
      const cleanDiff = stripAnsi ? ContextOptimizer.stripAnsi(data.gitDiff) : data.gitDiff;
      diffHtml = `
      <section class="card">
        <h2>🔍 Git Working Copy Diff</h2>
        ${
          data.filesChanged && data.filesChanged.length > 0
            ? `<div class="files-list"><strong>Files Changed:</strong> ${data.filesChanged
                .map((f) => `<code>${escapeHtml(f)}</code>`)
                .join(' ')}</div>`
            : ''
        }
        <div class="command-output">
          <pre><code class="diff-block">${escapeHtml(cleanDiff)}</code></pre>
        </div>
      </section>
      `;
    }

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Vulgr Session Report - ${escapeHtml(data.title || 'Terminal Session')}</title>
  <style>
    :root {
      --bg: #090a0f;
      --card-bg: #11131c;
      --border: rgba(255, 255, 255, 0.08);
      --text: #e2e8f0;
      --text-muted: #94a3b8;
      --cyan: #00d8ff;
      --purple: #a855f7;
      --green: #22c55e;
      --red: #ef4444;
      --font-mono: 'JetBrains Mono', 'Fira Code', monospace;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      background: var(--bg);
      color: var(--text);
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      padding: 32px 20px;
      line-height: 1.5;
    }
    .container { max-width: 1080px; margin: 0 auto; }
    header {
      background: var(--card-bg);
      border: 1px solid var(--border);
      border-radius: 16px;
      padding: 24px;
      margin-bottom: 24px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      flex-wrap: wrap;
      gap: 16px;
    }
    .brand { display: flex; align-items: center; gap: 12px; }
    .brand-icon {
      width: 36px; height: 36px; border-radius: 10px;
      background: linear-gradient(135deg, var(--cyan), var(--purple));
      display: flex; align-items: center; justify-content: center;
      font-weight: bold; color: black; font-size: 18px;
    }
    h1 { font-size: 20px; font-weight: 700; color: #fff; }
    .subtitle { font-size: 13px; color: var(--text-muted); font-family: var(--font-mono); }
    .metrics {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
      gap: 12px;
      margin-bottom: 24px;
    }
    .metric-card {
      background: var(--card-bg);
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 16px;
    }
    .metric-label { font-size: 11px; text-transform: uppercase; color: var(--text-muted); font-weight: 600; }
    .metric-val { font-size: 22px; font-weight: bold; color: #fff; margin-top: 4px; font-family: var(--font-mono); }
    .search-bar {
      margin-bottom: 20px;
      display: flex;
      gap: 10px;
    }
    .search-input {
      flex: 1;
      background: var(--card-bg);
      border: 1px solid var(--border);
      padding: 10px 14px;
      border-radius: 10px;
      color: #fff;
      font-size: 13px;
      outline: none;
    }
    .search-input:focus { border-color: var(--cyan); }
    .command-card {
      background: var(--card-bg);
      border: 1px solid var(--border);
      border-radius: 12px;
      margin-bottom: 12px;
      overflow: hidden;
      transition: all 0.15s ease;
    }
    .command-card.fail { border-color: rgba(239, 68, 68, 0.3); }
    .command-header {
      padding: 12px 16px;
      background: rgba(255, 255, 255, 0.02);
      border-bottom: 1px solid var(--border);
      display: flex;
      justify-content: space-between;
      align-items: center;
      flex-wrap: wrap;
      gap: 8px;
    }
    .cmd-info { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
    .cmd-index { font-size: 11px; font-family: var(--font-mono); color: var(--text-muted); }
    .status-badge {
      font-size: 11px;
      font-weight: 600;
      padding: 2px 8px;
      border-radius: 9999px;
      font-family: var(--font-mono);
    }
    .badge-pass { background: rgba(34, 197, 94, 0.15); color: var(--green); border: 1px solid rgba(34, 197, 94, 0.3); }
    .badge-fail { background: rgba(239, 68, 68, 0.15); color: var(--red); border: 1px solid rgba(239, 68, 68, 0.3); }
    .cmd-text { font-family: var(--font-mono); font-size: 13px; color: #fff; }
    .cmd-meta { display: flex; align-items: center; gap: 10px; font-size: 12px; color: var(--text-muted); }
    .copy-btn {
      background: rgba(255, 255, 255, 0.06);
      border: 1px solid var(--border);
      color: var(--text);
      font-size: 11px;
      padding: 4px 8px;
      border-radius: 6px;
      cursor: pointer;
    }
    .copy-btn:hover { background: rgba(255, 255, 255, 0.12); color: #fff; }
    .command-output {
      padding: 14px 16px;
      background: #06070a;
      overflow-x: auto;
      font-family: var(--font-mono);
      font-size: 12px;
      line-height: 1.6;
      color: #cbd5e1;
      max-height: 400px;
    }
    .no-output { padding: 12px 16px; font-size: 12px; color: var(--text-muted); font-style: italic; }
    .card { background: var(--card-bg); border: 1px solid var(--border); border-radius: 14px; padding: 20px; margin-top: 24px; }
    .card h2 { font-size: 16px; margin-bottom: 12px; color: #fff; }
    .files-list { font-size: 12px; margin-bottom: 12px; color: var(--text-muted); }
    .files-list code { background: rgba(255,255,255,0.05); padding: 2px 6px; border-radius: 4px; color: var(--cyan); margin-right: 6px; }
    footer { text-align: center; margin-top: 40px; font-size: 12px; color: var(--text-muted); }
  </style>
</head>
<body>
  <div class="container">
    <header>
      <div class="brand">
        <div class="brand-icon">⚡</div>
        <div>
          <h1>Vulgr Technical Session Report</h1>
          <div class="subtitle">${escapeHtml(data.workspacePath || '')} • ${escapeHtml(data.branch || 'main')}</div>
        </div>
      </div>
      <div class="subtitle">${escapeHtml(data.timestamp)}</div>
    </header>

    <div class="metrics">
      <div class="metric-card">
        <div class="metric-label">Total Commands</div>
        <div class="metric-val">${totalCmds}</div>
      </div>
      <div class="metric-card">
        <div class="metric-label">Passed</div>
        <div class="metric-val" style="color: var(--green);">${passedCmds}</div>
      </div>
      <div class="metric-card">
        <div class="metric-label">Failed</div>
        <div class="metric-val" style="color: ${failedCmds > 0 ? 'var(--red)' : 'var(--text-muted)'};">${failedCmds}</div>
      </div>
      <div class="metric-card">
        <div class="metric-label">Success Rate</div>
        <div class="metric-val" style="color: ${successRate >= 80 ? 'var(--green)' : 'var(--red)'};">${successRate}%</div>
      </div>
    </div>

    <div class="search-bar">
      <input type="text" id="filterInput" class="search-input" placeholder="Filter commands by name (e.g. npm, git, test)..." oninput="filterCards(this.value)">
    </div>

    <div id="commandCards">
      ${commandsHtml}
    </div>

    ${diffHtml}

    <footer>
      Generated with ⚡ <strong>Vulgr AI Terminal Orchestrator</strong>
    </footer>
  </div>

  <script>
    function filterCards(query) {
      const q = query.trim().toLowerCase();
      const cards = document.querySelectorAll('.command-card');
      cards.forEach(card => {
        const cmd = card.getAttribute('data-command') || '';
        card.style.display = cmd.includes(q) ? 'block' : 'none';
      });
    }
  </script>
</body>
</html>`;
  }

  /**
   * Generates a structured JSON string.
   */
  static toJson(data: SessionReportData): string {
    return JSON.stringify(data, null, 2);
  }
}
