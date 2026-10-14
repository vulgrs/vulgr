import { ns } from '../ns.js';

/** The commit box: message, AI-written messages, commit and push. */
export const commit = ns(
  {
    placeholder: 'Commit message: first line is the summary',
    aiWrite: 'Write with AI',
    aiWriting: 'Writing…',
    aiHint: 'An installed agent (Claude Code first) reads the changes and writes a message in this repository\'s style',
    aiNoChanges: 'There is nothing to commit.',
    aiNoAgent: 'No AI agent is installed. Install one from Settings > General > Setup.',
    aiFailed: (detail: string) => `The agent could not write a message${detail ? `: ${detail}` : ''}`,
    aiWrote: (agent: string) => `Written by ${agent}. Check it before committing.`,
    commit: 'Commit',
    commitPush: 'Commit & Push',
    committed: 'Committed',
    pushed: 'Committed and pushed',
    commitFailed: (error: string) => `Commit failed: ${error}`,
    pushFailed: (error: string) => `Committed, but the push failed: ${error}`,
    shortcut: (key: string) => `${key} commits`,
  },
  {
    placeholder: 'Commit mesajı: ilk satır özet',
    aiWrite: 'Yapay zekâ ile yaz',
    aiWriting: 'Yazıyor…',
    aiHint: 'Kurulu bir ajan (önce Claude Code) değişiklikleri okur ve bu deponun stilinde bir mesaj yazar',
    aiNoChanges: 'Commit edilecek bir şey yok.',
    aiNoAgent: 'Kurulu bir yapay zekâ ajanı yok. Ayarlar > Genel > Kurulum\'dan birini kur.',
    aiFailed: (detail: string) => `Ajan mesaj yazamadı${detail ? `: ${detail}` : ''}`,
    aiWrote: (agent: string) => `${agent} yazdı. Commit etmeden önce kontrol et.`,
    commit: 'Commit et',
    commitPush: 'Commit & Push',
    committed: 'Commit edildi',
    pushed: 'Commit edildi ve gönderildi',
    commitFailed: (error: string) => `Commit başarısız: ${error}`,
    pushFailed: (error: string) => `Commit edildi ama gönderilemedi: ${error}`,
    shortcut: (key: string) => `${key} ile commit et`,
  }
);
