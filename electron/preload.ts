import { contextBridge, ipcRenderer } from 'electron';

export interface PtyCreateOptions {
  id: string;
  command?: string;
  args?: string[];
  cwd?: string;
  cols?: number;
  rows?: number;
}

export interface WarpApi {
  // PTY Interactive Terminal
  createTerminal: (options: PtyCreateOptions) => Promise<{ id: string; pid: number }>;
  writeTerminal: (id: string, data: string) => void;
  resizeTerminal: (id: string, cols: number, rows: number) => void;
  killTerminal: (id: string) => void;
  onTerminalData: (callback: (event: { id: string; data: string }) => void) => () => void;
  onTerminalExit: (callback: (event: { id: string; exitCode: number; signal?: number }) => void) => () => void;

  // System & Git
  getDoctorStatus: () => Promise<any>;
  getGitDiff: (cwd?: string) => Promise<{ hasChanges: boolean; diff: string; filesChanged: string[] }>;
  revertGit: (cwd?: string) => Promise<boolean>;
  getGitBranch: (cwd?: string) => Promise<string | null>;
  gitCommit: (message: string, cwd?: string) => Promise<boolean>;
  gitPush: (remote?: string, branch?: string, cwd?: string) => Promise<{ success: boolean; error?: string }>;
  getCwd: () => Promise<string>;

  // Autonomous Agent Mesh
  runAgentMesh: (options: {
    goal: string;
    builder?: string;
    verifier?: string;
    auditor?: string;
    verifyCmd?: string;
    maxRounds?: number;
    cwd?: string;
  }) => Promise<any>;
  onMeshEvent: (callback: (message: any) => void) => () => void;

  // AI Command Search
  generateCommand: (query: string) => Promise<{ command: string; explanation: string; source: string }>;

  // Universal Shared Skills
  listSkills: (options?: { category?: string; query?: string }) => Promise<any[]>;
  getSkill: (id: string) => Promise<any>;
  saveSkill: (skill: any) => Promise<any>;
  deleteSkill: (id: string) => Promise<boolean>;
  interpolateSkill: (template: string, values: Record<string, string>, parameters?: any[]) => Promise<string>;

  // Persistent Workspace & Agent Memory
  getMemory: () => Promise<any>;
  setMemoryFact: (key: string, value: string, source?: string) => Promise<boolean>;
  deleteMemoryFact: (key: string) => Promise<boolean>;
  addMemoryRule: (rule: string) => Promise<boolean>;
  removeMemoryRule: (rule: string) => Promise<boolean>;
  recordMemoryCommand: (cmd: { command: string; exitCode: number; durationMs?: number; summary?: string }) => Promise<boolean>;
  getMemorySnippet: () => Promise<string>;

  // Context Optimizer
  optimizeContext: (raw: string, options?: any) => Promise<string>;

  // Safe Git Worktree Sandbox
  createSandbox: (options?: { runId?: string; baseBranch?: string }) => Promise<any>;
  listSandboxes: () => Promise<any[]>;
  getSandboxDiff: (worktreePath: string, baseBranch?: string) => Promise<{ hasChanges: boolean; diff: string; filesChanged: string[] }>;
  mergeSandbox: (options: { worktreePath: string; branchName: string; targetBranch?: string; commitMsg?: string }) => Promise<{ success: boolean; mergedCommit?: string; conflict?: boolean; conflictFiles?: string[]; error?: string }>;
  destroySandbox: (options: { worktreePath: string; branchName: string; force?: boolean }) => Promise<boolean>;

  // Smart Ghost Text & Auto-Suggest
  getAutoSuggestion: (input: string) => Promise<{ input: string; completion: string; suffix: string; source: 'history' | 'skill' | 'builtin'; description?: string } | null>;

  // Settings & Configuration
  getConfig: () => Promise<any>;
  updateConfig: (updates: any) => Promise<any>;
  resetConfig: () => Promise<any>;

  // Session Timeline & Technical Report Export
  generateReport: (data: any, format: 'markdown' | 'html' | 'json', options?: any) => Promise<string>;
  saveReportToFile: (content: string, defaultName?: string, format?: 'markdown' | 'html' | 'json') => Promise<{ success: boolean; filePath?: string; canceled?: boolean; error?: string }>;
}

const api: WarpApi = {
  createTerminal: (options) => ipcRenderer.invoke('pty:create', options),
  writeTerminal: (id, data) => ipcRenderer.send('pty:write', { id, data }),
  resizeTerminal: (id, cols, rows) => ipcRenderer.send('pty:resize', { id, cols, rows }),
  killTerminal: (id) => ipcRenderer.send('pty:kill', { id }),

  onTerminalData: (callback) => {
    const handler = (_: any, event: { id: string; data: string }) => callback(event);
    ipcRenderer.on('pty:data', handler);
    return () => ipcRenderer.removeListener('pty:data', handler);
  },
  onTerminalExit: (callback) => {
    const handler = (_: any, event: { id: string; exitCode: number; signal?: number }) => callback(event);
    ipcRenderer.on('pty:exit', handler);
    return () => ipcRenderer.removeListener('pty:exit', handler);
  },

  getDoctorStatus: () => ipcRenderer.invoke('system:doctor'),
  getGitDiff: (cwd?: string) => ipcRenderer.invoke('git:diff', { cwd }),
  revertGit: (cwd?: string) => ipcRenderer.invoke('git:revert', { cwd }),
  getGitBranch: (cwd?: string) => ipcRenderer.invoke('git:branch', { cwd }),
  gitCommit: (message: string, cwd?: string) => ipcRenderer.invoke('git:commit', { message, cwd }),
  gitPush: (remote?: string, branch?: string, cwd?: string) => ipcRenderer.invoke('git:push', { remote, branch, cwd }),
  getCwd: () => ipcRenderer.invoke('system:getCwd'),

  runAgentMesh: (options) => ipcRenderer.invoke('mesh:run', options),
  onMeshEvent: (callback) => {
    const handler = (_: any, message: any) => callback(message);
    ipcRenderer.on('mesh:event', handler);
    return () => ipcRenderer.removeListener('mesh:event', handler);
  },

  generateCommand: (query) => ipcRenderer.invoke('ai:generateCommand', query),

  // Universal Shared Skills
  listSkills: (options) => ipcRenderer.invoke('skills:list', options),
  getSkill: (id) => ipcRenderer.invoke('skills:get', id),
  saveSkill: (skill) => ipcRenderer.invoke('skills:save', skill),
  deleteSkill: (id) => ipcRenderer.invoke('skills:delete', id),
  interpolateSkill: (template, values, parameters) =>
    ipcRenderer.invoke('skills:interpolate', { template, values, parameters }),

  // Persistent Memory
  getMemory: () => ipcRenderer.invoke('memory:get'),
  setMemoryFact: (key, value, source) => ipcRenderer.invoke('memory:setFact', { key, value, source }),
  deleteMemoryFact: (key) => ipcRenderer.invoke('memory:deleteFact', key),
  addMemoryRule: (rule) => ipcRenderer.invoke('memory:addRule', rule),
  removeMemoryRule: (rule) => ipcRenderer.invoke('memory:removeRule', rule),
  recordMemoryCommand: (cmd) => ipcRenderer.invoke('memory:recordCommand', cmd),
  getMemorySnippet: () => ipcRenderer.invoke('memory:promptSnippet'),

  // Context Optimizer
  optimizeContext: (raw, options) => ipcRenderer.invoke('context:optimize', { raw, options }),

  // Safe Git Worktree Sandbox
  createSandbox: (options) => ipcRenderer.invoke('sandbox:create', options),
  listSandboxes: () => ipcRenderer.invoke('sandbox:list'),
  getSandboxDiff: (worktreePath, baseBranch) => ipcRenderer.invoke('sandbox:diff', { worktreePath, baseBranch }),
  mergeSandbox: (options) => ipcRenderer.invoke('sandbox:merge', options),
  destroySandbox: (options) => ipcRenderer.invoke('sandbox:destroy', options),

  // Smart Ghost Text & Auto-Suggest
  getAutoSuggestion: (input) => ipcRenderer.invoke('suggest:get', input),

  // Settings & Configuration
  getConfig: () => ipcRenderer.invoke('config:get'),
  updateConfig: (updates) => ipcRenderer.invoke('config:update', updates),
  resetConfig: () => ipcRenderer.invoke('config:reset'),

  // Session Timeline & Technical Report Export
  generateReport: (data, format, options) => ipcRenderer.invoke('export:generate', { data, format, options }),
  saveReportToFile: (content, defaultName, format) =>
    ipcRenderer.invoke('export:save-file', { content, defaultName, format }),
};

contextBridge.exposeInMainWorld('warpApi', api);
