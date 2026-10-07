import { ns } from '../ns.js';

/** Installing the agent CLIs (Claude Code, Codex, OpenCode, Antigravity, Cursor) from inside the app. */
export const agentSetup = ns(
  {
    title: 'AI agents',
    description:
      'Install the coding agents you want to use. Vulgr runs each tool’s official installer — or copy the command and run it yourself.',
    summary: (n: number, total: number) => `${n} of ${total} installed`,
    refresh: 'Check again',
    checking: 'Checking…',
    installed: 'Installed',
    notInstalled: 'Not installed',
    installing: 'Installing…',
    install: 'Install',
    retry: 'Try again',
    cancel: 'Stop',
    signIn: 'Sign in',
    signInHint: (cmd: string) => `First run signs you in: ${cmd}`,
    copy: 'Copy command',
    copied: 'Copied',
    docs: 'Guide',
    missing: (tool: string) => `Needs ${tool} first`,
    installedToast: (name: string) => `${name} is installed`,
    failedToast: (name: string) => `${name} could not be installed — see the output, or run the command in a terminal`,
    notFoundAfter: (name: string) =>
      `${name} finished installing but isn’t on PATH yet. Open a new terminal, or restart Vulgr.`,
    runInTerminal: 'Run in terminal',
    open: 'Install agents',
    settingsTitle: 'AI agents',
    settingsDescription: 'Install or sign in to Claude Code, Codex, OpenCode, Antigravity and Cursor Agent.',
    done: 'Done',
  },
  {
    title: 'Yapay zekâ ajanları',
    description:
      'Kullanmak istediğin kodlama ajanlarını kur. Vulgr her aracın resmi kurulum komutunu çalıştırır — istersen komutu kopyalayıp kendin de çalıştırabilirsin.',
    summary: (n: number, total: number) => `${total} ajandan ${n} tanesi kurulu`,
    refresh: 'Yeniden kontrol et',
    checking: 'Kontrol ediliyor…',
    installed: 'Kurulu',
    notInstalled: 'Kurulu değil',
    installing: 'Kuruluyor…',
    install: 'Kur',
    retry: 'Tekrar dene',
    cancel: 'Durdur',
    signIn: 'Giriş yap',
    signInHint: (cmd: string) => `İlk çalıştırmada giriş yaparsın: ${cmd}`,
    copy: 'Komutu kopyala',
    copied: 'Kopyalandı',
    docs: 'Rehber',
    missing: (tool: string) => `Önce ${tool} gerekli`,
    installedToast: (name: string) => `${name} kuruldu`,
    failedToast: (name: string) => `${name} kurulamadı — çıktıya bak ya da komutu bir terminalde çalıştır`,
    notFoundAfter: (name: string) =>
      `${name} kuruldu ama henüz PATH’te görünmüyor. Yeni bir terminal aç ya da Vulgr’ı yeniden başlat.`,
    runInTerminal: 'Terminalde çalıştır',
    open: 'Ajanları kur',
    settingsTitle: 'Yapay zekâ ajanları',
    settingsDescription: 'Claude Code, Codex, OpenCode, Antigravity ve Cursor Agent’ı kur ya da giriş yap.',
    done: 'Tamam',
  }
);
