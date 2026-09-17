# Warp Multi-Agent Terminal Workspace

> **Interactive Warp-Style Terminal Workspace for AI Coding Agents (`claude`, `agy`, `codex`)**
> Real xterm.js + node-pty Engine • Multi-Pane Split Layout • Auto Compiler Error Interceptor • Cross-Model Adversarial Audit

---

## 🌟 Overview

**Warp Multi-Agent Terminal Workspace** transforms your development environment into an AI-native, multi-pane terminal workspace inspired by [Warp](https://www.warp.dev/).

Instead of running opaque scripts in the background, you **interactively launch and operate `claude` (Claude Code), `agy` (Antigravity CLI), and `codex` yourself** inside real terminal sessions with full ANSI color, TUI cursor navigation, and interactive prompts.

The workspace acts as an intelligent orchestration layer:
1. **Interactive Multi-Agent Panes:** Split terminals horizontally or vertically. Run Claude Code in one pane, AGY in another, and your test watcher in a third.
2. **Compiler Error Sniffer (Self-Correction):** When an error occurs in your terminal (TypeScript `TS2322`, syntax error, test failure), a floating banner detects the error and offers one-click action: *"Send to Claude / AGY / Codex to Fix"*.
3. **Cross-Model Adversarial Audit:** When one agent writes code, click `Git Diff` to inspect the uncommitted changes and send them to another agent (e.g., AGY auditing Claude's code) for paranoid security and edge-case inspection.

---

## 🖥️ Workspace Layout

```
┌──────────────────────────────────────────────────────────────────────────────────┐
│  ⚡ WARP WORKSPACE  [Terminal 1] [+]  [+ Shell] [+ Claude] [+ AGY] [+ Codex] [Diff]│
├──────────────────────────────────────────────────────────────────────────────────┤
│  Split Interactive Terminals (Powered by xterm.js + node-pty)                    │
│                                                                                  │
│  ┌─────────────────────────────────────┬──────────────────────────────────────┐  │
│  │ 🖥️ Claude Code (Interactive TUI)    │ 🖥️ AGY Engine (Interactive Session)  │  │
│  │                                     │                                      │  │
│  │  > claude                           │  > agy                               │  │
│  │  ╭─ Claude Code ──────────────────╮ │  ╭─ Google Antigravity CLI ────────╮ │  │
│  │  │ What would you like to build?  │ │  │ Listening for commands...        │ │  │
│  │  ╰────────────────────────────────╯ │  ╰──────────────────────────────────╯ │  │
│  └─────────────────────────────────────┴──────────────────────────────────────┘  │
│                                                                                  │
│  ┌────────────────────────────────────────────────────────────────────────────┐  │
│  │ 🖥️ Verifier & Build Watcher (npm test / npm run dev / tsc -w)              │  │
│  │  ⚠ Compiler Error: TS2322 in auth.ts                                       │  │
│  │  [⚡ Send to Claude to Fix]  [⚡ Send to AGY to Fix]  [⚡ Send to Codex]    │  │
│  └────────────────────────────────────────────────────────────────────────────┘  │
├──────────────────────────────────────────────────────────────────────────────────┤
│  Active Pane: Claude Code   [claude] [agy] [codex] [npm test]   $ [Input]       │
└──────────────────────────────────────────────────────────────────────────────────┘
```

---

## 🚀 Quick Start

### 1. Launch the Desktop Terminal Workspace
```bash
npm run start:app
```

### 2. Available Controls
- **`+ Shell`**: Opens a standard PowerShell / Bash terminal pane.
- **`+ Claude`**: Spawns an interactive `claude` (Claude Code) session.
- **`+ AGY`**: Spawns an interactive `agy` (Antigravity CLI) session.
- **`+ Codex`**: Spawns an interactive `codex` CLI session.
- **Split Horizontal / Vertical**: Split your active terminal into multiple panes.
- **`Git Diff`**: Open the diff inspector drawer to review changes and trigger cross-model audits.

---

## 🧪 Testing
```bash
npm test
```

## 📄 License
MIT
