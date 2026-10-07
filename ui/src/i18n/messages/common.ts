import { ns } from '../ns.js';

/** Agent/session type names and other labels shared across screens. */
export const common = ns(
  {
    sessionType: { claude: 'Claude Code', agy: 'Antigravity (AGY)', codex: 'Codex CLI', opencode: 'OpenCode', cursor: 'Cursor Agent', shell: 'Terminal' },
    language: 'Language',
    cancel: 'Cancel',
    save: 'Save',
    close: 'Close',
  },
  {
    sessionType: { claude: 'Claude Code', agy: 'Antigravity (AGY)', codex: 'Codex CLI', opencode: 'OpenCode', cursor: 'Cursor Agent', shell: 'Terminal' },
    language: 'Dil',
    cancel: 'İptal',
    save: 'Kaydet',
    close: 'Kapat',
  }
);
