import os from 'node:os';
import { exec } from 'node:child_process';
import { promisify } from 'node:util';

const execAsync = promisify(exec);

export interface CommandSuggestion {
  command: string;
  explanation: string;
  source: 'instant-rules' | 'ai-cli';
}

interface Rule {
  patterns: RegExp[];
  win: string;
  unix: string;
  explanation: string;
}

const RULES: Rule[] = [
  // Kill port / Free port
  {
    patterns: [
      /port\s+(\d+).*?(?:kapat|öldür|durdur|kill|free|stop)/i,
      /(?:kapat|öldür|durdur|kill|free|stop).*?port\s+(\d+)/i,
      /(\d+)\s*nolu\s*port/i,
    ],
    win: 'Stop-Process -Id (Get-NetTCPConnection -LocalPort {port}).OwningProcess -Force',
    unix: 'lsof -ti:{port} | xargs kill -9',
    explanation: 'Terminates the process currently listening on port {port}.',
  },
  // Find processes by name
  {
    patterns: [
      /(?:process|süreç).*?(?:bul|listele|göster|find|list)/i,
      /(?:find|list|show).*?(?:process|processes)/i,
    ],
    win: 'Get-Process | Where-Object {$_.ProcessName -match "{target}"}',
    unix: 'ps aux | grep "{target}"',
    explanation: 'Lists running system processes matching the target name.',
  },
  // Git soft reset (undo last commit, keep changes)
  {
    patterns: [
      /(?:son\s+commiti|last\s+commit).*?(?:geri\s+al|undo).*?(?:koru|keep)/i,
      /(?:undo|uncommit).*?last\s+commit/i,
    ],
    win: 'git reset --soft HEAD~1',
    unix: 'git reset --soft HEAD~1',
    explanation: 'Undoes the last commit while keeping all your modified code files staged.',
  },
  // Git hard reset (discard last commit)
  {
    patterns: [
      /(?:son\s+commiti|last\s+commit).*?(?:sil|discard|remove|tamamen)/i,
      /(?:discard|delete).*?last\s+commit/i,
    ],
    win: 'git reset --hard HEAD~1',
    unix: 'git reset --hard HEAD~1',
    explanation: 'Permanently discards the last commit and all uncommitted working tree changes.',
  },
  // Git stash
  {
    patterns: [
      /(?:değişiklikleri|changes).*?(?:stash|sakla|yedekle)/i,
      /(?:stash|save).*?(?:changes|work)/i,
    ],
    win: 'git stash save "wip-changes"',
    unix: 'git stash save "wip-changes"',
    explanation: 'Temporarily stashes all uncommitted changes in the repository.',
  },
  // Git remote prune
  {
    patterns: [
      /(?:silinen|deleted).*?(?:dalları|branches).*?(?:temizle|prune)/i,
      /(?:prune|clean).*?(?:remote|branches)/i,
    ],
    win: 'git fetch --all --prune',
    unix: 'git fetch --all --prune',
    explanation: 'Fetches all remote branches and prunes local tracking references for deleted remotes.',
  },
  // Git create and checkout branch
  {
    patterns: [
      /(?:yeni\s+dal|new\s+branch).*?(?:aç|oluştur|geç|create|checkout)/i,
      /(?:create|checkout).*?branch/i,
    ],
    win: 'git checkout -b {target}',
    unix: 'git checkout -b {target}',
    explanation: 'Creates a new git branch and immediately switches to it.',
  },
  // Find large files (>100MB)
  {
    patterns: [
      /(?:büyük\s+dosyaları|large\s+files).*?(?:bul|listele|find)/i,
      /find.*?files.*?(?:over|larger|büyük)/i,
    ],
    win: 'Get-ChildItem -Recurse | Where-Object {$_.Length -gt 100MB} | Select-Object FullName, @{Name="MB";Expression={$_.Length/1MB}}',
    unix: 'find . -type f -size +100M',
    explanation: 'Scans the directory recursively for files exceeding 100MB.',
  },
  // Remove node_modules
  {
    patterns: [
      /node_modules.*?(?:sil|kaldır|temizle|delete|remove|clean)/i,
      /(?:delete|remove|clean).*?node_modules/i,
    ],
    win: 'Remove-Item -Recurse -Force node_modules',
    unix: 'rm -rf node_modules',
    explanation: 'Recursively and forcefully deletes the node_modules folder.',
  },
  // Docker clean / prune
  {
    patterns: [
      /docker.*?(?:temizle|prune|clean|sil)/i,
      /(?:clean|prune).*?docker/i,
    ],
    win: 'docker system prune -a --volumes',
    unix: 'docker system prune -a --volumes',
    explanation: 'Removes all unused Docker containers, networks, images, and volumes.',
  },
  // Stop all Docker containers
  {
    patterns: [
      /docker.*?(?:durdur|stop|kapat)/i,
      /stop.*?docker/i,
    ],
    win: 'docker stop $(docker ps -aq)',
    unix: 'docker stop $(docker ps -aq)',
    explanation: 'Stops all currently running Docker containers.',
  },
  // Check disk space
  {
    patterns: [
      /(?:disk|alan|yer).*?(?:kontrol|durum|boş|space|usage)/i,
      /(?:check|show).*?disk\s+space/i,
    ],
    win: 'Get-PSDrive -PSProvider FileSystem | Select-Object Root, @{Name="FreeGB";Expression={[math]::round($_.Free/1GB, 2)}}',
    unix: 'df -h',
    explanation: 'Displays available free and used disk space across mounted drives.',
  },
  // NPM clean install
  {
    patterns: [
      /(?:npm|paket).*?(?:temiz\s+kurulum|clean\s+install|ci)/i,
      /clean\s+install/i,
    ],
    win: 'npm ci',
    unix: 'npm ci',
    explanation: 'Performs a clean, automated install of project dependencies based on package-lock.json.',
  },
];

export async function generateShellCommand(
  query: string,
  targetOs: 'windows' | 'linux' | 'darwin' = os.platform() === 'win32' ? 'windows' : 'linux'
): Promise<CommandSuggestion> {
  const trimmed = query.replace(/^#\s*/, '').trim();
  const isWin = targetOs === 'windows';

  // 1. Check instant heuristic rules
  for (const rule of RULES) {
    for (const pattern of rule.patterns) {
      const match = trimmed.match(pattern);
      if (match) {
        let cmd = isWin ? rule.win : rule.unix;
        let exp = rule.explanation;

        // Port placeholder replacement
        const portMatch = trimmed.match(/\b(\d{2,5})\b/);
        const port = portMatch ? portMatch[1] : (match[1] || '3000');
        cmd = cmd.replaceAll('{port}', port);
        exp = exp.replaceAll('{port}', port);

        // Target name replacement
        const words = trimmed.split(/\s+/);
        const lastWord = words[words.length - 1] || 'node';
        cmd = cmd.replaceAll('{target}', lastWord);
        exp = exp.replaceAll('{target}', lastWord);

        return {
          command: cmd,
          explanation: exp,
          source: 'instant-rules',
        };
      }
    }
  }

  // 2. Fallback: Try local official CLI model (claude or gemini) if available
  try {
    const prompt = `Translate this user intent into a single-line ${
      isWin ? 'PowerShell' : 'Bash'
    } shell command: "${trimmed}". Output ONLY the raw executable command line, no markdown, no quotes, no explanation.`;

    const result = await execAsync(`claude -p "${prompt.replace(/"/g, '\\"')}"`, {
      timeout: 3000,
      windowsHide: true,
    });

    const output = result.stdout.trim();
    if (output && output.length < 200 && !output.includes('\n')) {
      return {
        command: output,
        explanation: `AI-generated shell command for: "${trimmed}"`,
        source: 'ai-cli',
      };
    }
  } catch {
    // If CLI call fails or times out, fallback to generic shell execution format
  }

  // 3. Sensible generic fallback
  return {
    command: isWin ? `Get-Help *${trimmed}*` : `apropos "${trimmed}"`,
    explanation: `Search manual documentation for command "${trimmed}".`,
    source: 'instant-rules',
  };
}
