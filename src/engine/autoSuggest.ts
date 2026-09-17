import { MemoryStore } from './memoryStore.js';
import { SharedSkillsRegistry, interpolateSkillCommand } from './sharedSkills.js';

export interface AutoSuggestResult {
  input: string;
  completion: string;
  suffix: string;
  source: 'history' | 'skill' | 'builtin';
  description?: string;
}

export const COMMON_BUILTIN_COMMANDS: Array<{ command: string; description: string }> = [
  // Git
  { command: 'git status', description: 'Show working tree status' },
  { command: 'git add .', description: 'Stage all modified and new files' },
  { command: 'git commit -m ""', description: 'Commit staged changes with message' },
  { command: 'git commit -am ""', description: 'Stage tracked files and commit' },
  { command: 'git push origin HEAD', description: 'Push current branch to remote' },
  { command: 'git pull --rebase origin', description: 'Pull and rebase local commits' },
  { command: 'git diff HEAD', description: 'Show diff against last commit' },
  { command: 'git log --oneline -n 15', description: 'Display compact commit history' },
  { command: 'git checkout -b feature/', description: 'Create and switch to new branch' },
  { command: 'git stash push -m "WIP"', description: 'Stash uncommitted changes' },
  { command: 'git stash pop', description: 'Restore last stashed changes' },
  { command: 'git reset --soft HEAD~1', description: 'Undo last commit keeping changes staged' },

  // NPM & Node
  { command: 'npm run build', description: 'Compile production build' },
  { command: 'npm run dev', description: 'Start local development server' },
  { command: 'npm test', description: 'Execute project test suite' },
  { command: 'npm install', description: 'Install project dependencies' },
  { command: 'npm ci', description: 'Clean install exact dependencies from lockfile' },
  { command: 'npx tsc --noEmit', description: 'Run TypeScript strict typecheck' },
  { command: 'npx kill-port 5173', description: 'Kill process on port 5173' },
  { command: 'npm outdated', description: 'Check for outdated packages' },

  // Docker
  { command: 'docker ps -a', description: 'List all running and stopped containers' },
  { command: 'docker compose up -d', description: 'Start all compose services in background' },
  { command: 'docker compose down', description: 'Stop and remove compose services' },
  { command: 'docker system prune -af --volumes', description: 'Deep clean unused Docker data' },
  { command: 'docker logs -f --tail 100', description: 'Follow live logs of container' },

  // System & Diagnostics
  { command: 'curl -i http://localhost:5173', description: 'Inspect local HTTP server' },
  { command: 'netstat -ano | findstr :', description: 'Find process listening on port' },
];

export class AutoSuggestEngine {
  private readonly memoryStore: MemoryStore;
  private readonly skillsRegistry: SharedSkillsRegistry;

  constructor(workspaceDir: string = process.cwd(), memoryStore?: MemoryStore, skillsRegistry?: SharedSkillsRegistry) {
    this.memoryStore = memoryStore || new MemoryStore(workspaceDir);
    this.skillsRegistry = skillsRegistry || new SharedSkillsRegistry(workspaceDir);
  }

  /**
   * Fast synchronous auto-suggest lookup (< 2ms).
   * Matches input prefix against:
   * 1. Recent Command History (MemoryStore)
   * 2. Shared Skills & Workflows
   * 3. Common Builtin CLI commands
   */
  getSuggestion(input: string): AutoSuggestResult | null {
    if (!input || input.trim().length === 0) {
      return null;
    }

    const trimmedInput = input;
    const lowerInput = trimmedInput.toLowerCase();

    // Do not suggest if input starts with # (which triggers AI Natural Language command search)
    if (trimmedInput.startsWith('#')) {
      return null;
    }

    // 1. Check Recent Command History in MemoryStore (highest priority)
    const recentCommands = this.memoryStore.getRecentCommands(30);
    for (const item of recentCommands) {
      const cmd = item.command.trim();
      if (cmd.toLowerCase().startsWith(lowerInput) && cmd.length > trimmedInput.length) {
        return {
          input: trimmedInput,
          completion: cmd,
          suffix: cmd.slice(trimmedInput.length),
          source: 'history',
          description: item.summary ? `History: ${item.summary}` : 'Recent command history',
        };
      }
    }

    // 2. Check Universal Shared Skills
    const skills = this.skillsRegistry.listSkills();
    for (const skill of skills) {
      // Interpolate with default values to present an executable command
      const candidate = interpolateSkillCommand(skill.commandTemplate, {}, skill.parameters);
      if (candidate.toLowerCase().startsWith(lowerInput) && candidate.length > trimmedInput.length) {
        return {
          input: trimmedInput,
          completion: candidate,
          suffix: candidate.slice(trimmedInput.length),
          source: 'skill',
          description: `Skill: ${skill.name}`,
        };
      }
    }

    // 3. Check Common Builtin Commands
    for (const item of COMMON_BUILTIN_COMMANDS) {
      if (item.command.toLowerCase().startsWith(lowerInput) && item.command.length > trimmedInput.length) {
        return {
          input: trimmedInput,
          completion: item.command,
          suffix: item.command.slice(trimmedInput.length),
          source: 'builtin',
          description: item.description,
        };
      }
    }

    return null;
  }
}
