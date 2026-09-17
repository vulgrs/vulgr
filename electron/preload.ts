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
  getCwd: () => ipcRenderer.invoke('system:getCwd'),

  runAgentMesh: (options) => ipcRenderer.invoke('mesh:run', options),
  onMeshEvent: (callback) => {
    const handler = (_: any, message: any) => callback(message);
    ipcRenderer.on('mesh:event', handler);
    return () => ipcRenderer.removeListener('mesh:event', handler);
  },
};

contextBridge.exposeInMainWorld('warpApi', api);
