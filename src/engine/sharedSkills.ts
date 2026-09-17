import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';

export type SkillCategory = 'git' | 'docker' | 'node' | 'system' | 'ai' | 'custom';

export interface SkillParameter {
  name: string;
  label: string;
  description: string;
  defaultValue?: string;
  options?: string[];
  required?: boolean;
}

export interface SharedSkill {
  id: string;
  name: string;
  category: SkillCategory;
  description: string;
  commandTemplate: string;
  parameters: SkillParameter[];
  tags: string[];
  isCustom?: boolean;
}

/**
 * Extracts all {{param}} placeholder names from a command template string.
 */
export function extractPlaceholders(template: string): string[] {
  const matches = template.matchAll(/\{\{([a-zA-Z0-9_]+)\}\}/g);
  const names = new Set<string>();
  for (const m of matches) {
    if (m[1]) names.add(m[1]);
  }
  return Array.from(names);
}

/**
 * Replaces {{param}} placeholders with actual user values or default values.
 */
export function interpolateSkillCommand(
  template: string,
  values: Record<string, string>,
  parameters: SkillParameter[] = []
): string {
  let result = template;
  const paramMap = new Map<string, SkillParameter>();
  for (const p of parameters) {
    paramMap.set(p.name, p);
  }

  const placeholders = extractPlaceholders(template);
  for (const key of placeholders) {
    let val = values[key];
    if (val === undefined || val === '') {
      const def = paramMap.get(key)?.defaultValue;
      val = def !== undefined ? def : `{{${key}}}`;
    }
    const regex = new RegExp(`\\{\\{${key}\\}\\}`, 'g');
    result = result.replace(regex, val);
  }

  return result;
}

/**
 * Built-in Curated Universal Skills Library
 */
export const BUILTIN_SKILLS: SharedSkill[] = [
  // Git Skills
  {
    id: 'git:commit_all',
    name: 'Git Commit All',
    category: 'git',
    description: 'Stage all tracked file modifications and create a commit.',
    commandTemplate: 'git commit -am "{{commit_message}}"',
    parameters: [
      { name: 'commit_message', label: 'Commit Message', description: 'Brief description of changes', defaultValue: 'chore: update codebase', required: true },
    ],
    tags: ['git', 'commit', 'vcs'],
  },
  {
    id: 'git:create_branch',
    name: 'Git Branch & Switch',
    category: 'git',
    description: 'Create and immediately switch to a new branch.',
    commandTemplate: 'git checkout -b {{branch_name}}',
    parameters: [
      { name: 'branch_name', label: 'Branch Name', description: 'Name of the new feature/fix branch', defaultValue: 'feature/agent-task', required: true },
    ],
    tags: ['git', 'branch', 'checkout'],
  },
  {
    id: 'git:stash_save',
    name: 'Git Stash Changes',
    category: 'git',
    description: 'Safely stash uncommitted changes with a description message.',
    commandTemplate: 'git stash push -m "{{stash_message}}"',
    parameters: [
      { name: 'stash_message', label: 'Stash Message', description: 'Label for stashed work', defaultValue: 'WIP before sync' },
    ],
    tags: ['git', 'stash', 'wip'],
  },
  {
    id: 'git:undo_soft',
    name: 'Git Undo Last Commit (Soft)',
    category: 'git',
    description: 'Undo the last N commits while preserving all changes staged in the working copy.',
    commandTemplate: 'git reset --soft HEAD~{{count}}',
    parameters: [
      { name: 'count', label: 'Commit Count', description: 'Number of commits to uncommit', defaultValue: '1', options: ['1', '2', '3'] },
    ],
    tags: ['git', 'undo', 'reset'],
  },
  {
    id: 'git:graph_log',
    name: 'Git Graph History',
    category: 'git',
    description: 'Display an ASCII graph of recent commits, branches, and merges.',
    commandTemplate: 'git log --oneline -n {{limit}} --graph --decorate',
    parameters: [
      { name: 'limit', label: 'Max Commits', description: 'Number of commits to show', defaultValue: '15', options: ['10', '15', '30'] },
    ],
    tags: ['git', 'log', 'history'],
  },

  // Docker Skills
  {
    id: 'docker:run_container',
    name: 'Docker Run Container',
    category: 'docker',
    description: 'Run a container in the background with port forwarding.',
    commandTemplate: 'docker run -d -p {{host_port}}:{{container_port}} --name {{container_name}} {{image_name}}',
    parameters: [
      { name: 'host_port', label: 'Host Port', description: 'Port on local machine', defaultValue: '8080' },
      { name: 'container_port', label: 'Container Port', description: 'Port exposed inside container', defaultValue: '80' },
      { name: 'container_name', label: 'Container Name', description: 'Unique container name', defaultValue: 'my-service' },
      { name: 'image_name', label: 'Image Name', description: 'Docker image tag', defaultValue: 'nginx:alpine', required: true },
    ],
    tags: ['docker', 'container', 'deploy'],
  },
  {
    id: 'docker:logs_tail',
    name: 'Docker Live Logs',
    category: 'docker',
    description: 'Follow and tail real-time standard output and error logs of a container.',
    commandTemplate: 'docker logs -f --tail {{lines}} {{container_name}}',
    parameters: [
      { name: 'container_name', label: 'Container Name', description: 'Target container name or ID', defaultValue: 'my-service', required: true },
      { name: 'lines', label: 'Tail Lines', description: 'Initial lines to output', defaultValue: '100', options: ['50', '100', '500'] },
    ],
    tags: ['docker', 'logs', 'debug'],
  },
  {
    id: 'docker:exec_sh',
    name: 'Docker Container Shell',
    category: 'docker',
    description: 'Execute an interactive bash/sh shell inside a running container.',
    commandTemplate: 'docker exec -it {{container_name}} {{shell}}',
    parameters: [
      { name: 'container_name', label: 'Container Name', description: 'Target container', defaultValue: 'my-service', required: true },
      { name: 'shell', label: 'Shell', description: 'Shell binary path', defaultValue: 'sh', options: ['sh', 'bash', '/bin/bash'] },
    ],
    tags: ['docker', 'shell', 'exec'],
  },
  {
    id: 'docker:prune_all',
    name: 'Docker Deep Clean (Prune)',
    category: 'docker',
    description: 'Safely prune all stopped containers, unused networks, and dangling images.',
    commandTemplate: 'docker system prune -af --volumes',
    parameters: [],
    tags: ['docker', 'clean', 'maintenance'],
  },

  // Node & Dev Skills
  {
    id: 'node:kill_port',
    name: 'Kill Port Process',
    category: 'node',
    description: 'Instantly find and terminate any process hogging a local TCP port.',
    commandTemplate: 'npx kill-port {{port}}',
    parameters: [
      { name: 'port', label: 'Port Number', description: 'Port to free up', defaultValue: '5173', options: ['3000', '5173', '8080', '8000'] },
    ],
    tags: ['node', 'port', 'kill', 'dev'],
  },
  {
    id: 'node:typecheck',
    name: 'TypeScript Strict Typecheck',
    category: 'node',
    description: 'Run TypeScript compiler in noEmit mode to identify all type mismatches.',
    commandTemplate: 'npx tsc --noEmit',
    parameters: [],
    tags: ['node', 'typescript', 'types', 'build'],
  },
  {
    id: 'node:run_script',
    name: 'Run NPM Script',
    category: 'node',
    description: 'Execute a project script declared in package.json.',
    commandTemplate: 'npm run {{script_name}}',
    parameters: [
      { name: 'script_name', label: 'Script Name', description: 'Script from package.json', defaultValue: 'test', options: ['build', 'test', 'lint', 'dev'] },
    ],
    tags: ['node', 'npm', 'script'],
  },

  // System & Diagnostics Skills
  {
    id: 'sys:port_owner',
    name: 'Inspect Port Listener (Windows)',
    category: 'system',
    description: 'Query netstat to find PID listening on a specific port.',
    commandTemplate: 'netstat -ano | findstr :{{port}}',
    parameters: [
      { name: 'port', label: 'Port Number', description: 'Target port', defaultValue: '5173' },
    ],
    tags: ['system', 'network', 'netstat', 'port'],
  },
  {
    id: 'sys:curl_inspect',
    name: 'HTTP Endpoint Inspector',
    category: 'system',
    description: 'Send HTTP request and inspect headers, status, and payload body.',
    commandTemplate: 'curl -i -X {{method}} {{url}}',
    parameters: [
      { name: 'method', label: 'HTTP Method', description: 'Request verb', defaultValue: 'GET', options: ['GET', 'POST', 'PUT', 'DELETE'] },
      { name: 'url', label: 'URL', description: 'Target endpoint URL', defaultValue: 'http://localhost:5173' },
    ],
    tags: ['system', 'curl', 'api', 'http'],
  },

  // Multi-CLI AI Skills
  {
    id: 'ai:run_claude',
    name: 'Launch Claude Code Goal',
    category: 'ai',
    description: 'Invoke Anthropic Claude Code on a specific developer goal.',
    commandTemplate: 'claude --goal "{{goal}}"',
    parameters: [
      { name: 'goal', label: 'Task Goal', description: 'What Claude should build or refactor', defaultValue: 'Fix failing unit tests in src/tests', required: true },
    ],
    tags: ['ai', 'claude', 'anthropic'],
  },
  {
    id: 'ai:run_agy',
    name: 'Launch Google AGY Engine',
    category: 'ai',
    description: 'Invoke Antigravity AGY Engine with budget for self-correction.',
    commandTemplate: 'agy --goal "{{task}}" --budget {{budget}}',
    parameters: [
      { name: 'task', label: 'Task', description: 'Engineering objective for AGY', defaultValue: 'Verify architecture and optimize code', required: true },
      { name: 'budget', label: 'Budget Retries', description: 'Max repair rounds', defaultValue: '3', options: ['1', '2', '3', '5'] },
    ],
    tags: ['ai', 'agy', 'antigravity', 'google'],
  },
  {
    id: 'ai:mesh_start',
    name: 'Autonomous Agent Mesh',
    category: 'ai',
    description: 'Launch autonomous 3-agent mesh (Builder + Verifier + Auditor) with full consensus.',
    commandTemplate: 'npm run mesh:start -- --goal "{{goal}}"',
    parameters: [
      { name: 'goal', label: 'Mesh Goal', description: 'High-level objective', defaultValue: 'Build and verify new feature schema', required: true },
    ],
    tags: ['ai', 'mesh', 'consensus', 'autonomous'],
  },
];

export class SharedSkillsRegistry {
  private readonly customSkillsFile: string;
  private customSkills: SharedSkill[] = [];

  constructor(workspaceDir: string = process.cwd(), skillsFileName = '.warp-skills.json') {
    this.customSkillsFile = join(workspaceDir, skillsFileName);
    this.loadCustomSkills();
  }

  private loadCustomSkills(): void {
    if (existsSync(this.customSkillsFile)) {
      try {
        const raw = readFileSync(this.customSkillsFile, 'utf-8');
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          this.customSkills = parsed.map((s) => ({ ...s, isCustom: true, category: s.category || 'custom' }));
        }
      } catch {
        this.customSkills = [];
      }
    }
  }

  private persistCustomSkills(): void {
    try {
      const dir = dirname(this.customSkillsFile);
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
      }
      writeFileSync(this.customSkillsFile, JSON.stringify(this.customSkills, null, 2), 'utf-8');
    } catch (err) {
      console.error('[SharedSkillsRegistry] Failed to save custom skills:', err);
    }
  }

  listSkills(category?: string, query?: string): SharedSkill[] {
    const all = [...BUILTIN_SKILLS, ...this.customSkills];

    return all.filter((s) => {
      if (category && category !== 'all') {
        if (s.category !== category) return false;
      }
      if (query && query.trim().length > 0) {
        const q = query.toLowerCase().trim();
        const inName = s.name.toLowerCase().includes(q);
        const inDesc = s.description.toLowerCase().includes(q);
        const inCmd = s.commandTemplate.toLowerCase().includes(q);
        const inTags = s.tags.some((t) => t.toLowerCase().includes(q));
        return inName || inDesc || inCmd || inTags;
      }
      return true;
    });
  }

  getSkill(id: string): SharedSkill | undefined {
    return (
      this.customSkills.find((s) => s.id === id) ||
      BUILTIN_SKILLS.find((s) => s.id === id)
    );
  }

  saveCustomSkill(skillData: Omit<SharedSkill, 'isCustom'>): SharedSkill {
    const id = skillData.id || `custom:${Date.now()}`;
    const skill: SharedSkill = {
      ...skillData,
      id,
      category: skillData.category || 'custom',
      isCustom: true,
      parameters: skillData.parameters || [],
      tags: skillData.tags || ['custom'],
    };

    const existingIndex = this.customSkills.findIndex((s) => s.id === id);
    if (existingIndex !== -1) {
      this.customSkills[existingIndex] = skill;
    } else {
      this.customSkills.unshift(skill);
    }

    this.persistCustomSkills();
    return skill;
  }

  deleteCustomSkill(id: string): boolean {
    const prevLen = this.customSkills.length;
    this.customSkills = this.customSkills.filter((s) => s.id !== id);
    if (this.customSkills.length !== prevLen) {
      this.persistCustomSkills();
      return true;
    }
    return false;
  }

  /**
   * Generates a concise summary (< 120 tokens) of available skills for AI agents.
   */
  getSkillsPromptSummary(): string {
    const all = [...BUILTIN_SKILLS, ...this.customSkills];
    const lines = all.slice(0, 10).map((s) => `- ${s.id}: ${s.name} -> "${s.commandTemplate}"`);
    return `[Available Shared Skills]\n${lines.join('\n')}`;
  }
}
