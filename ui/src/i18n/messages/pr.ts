import { ns } from '../ns.js';

/** The pull request dialog. */
export const pr = ns(
  {
    title: 'Open a pull request',
    base: 'Into',
    titleLabel: 'Title',
    bodyLabel: 'Description',
    aiWrite: 'Write with AI',
    create: 'Create pull request',
    viaGh: 'Opens with the GitHub CLI (gh).',
    viaBrowser: 'gh isn\'t signed in here, so GitHub opens in your browser with this filled in; press Create there.',
    created: 'Pull request opened',
    openedBrowser: 'GitHub opened in your browser',
    onBase: (base: string) => `You are on ${base}. Switch to the branch with your changes first.`,
    noCommits: (base: string) => `This branch has no commits that ${base} doesn't have yet.`,
    notGitHub: 'This folder\'s origin is not a GitHub repository.',
    failed: (error: string) => `Could not open the pull request: ${error}`,
    open: 'Open pull request…',
    openLink: 'Open the pull request on GitHub',
    openHint: 'Open a pull request for this branch',
  },
  {
    title: 'Pull request aç',
    base: 'Hedef',
    titleLabel: 'Başlık',
    bodyLabel: 'Açıklama',
    aiWrite: 'Yapay zekâ ile yaz',
    create: 'Pull request oluştur',
    viaGh: 'GitHub CLI (gh) ile açılır.',
    viaBrowser: 'Burada gh oturumu yok; GitHub bu bilgilerle tarayıcıda açılır, oradan Create\'e bas.',
    created: 'Pull request açıldı',
    openedBrowser: 'GitHub tarayıcıda açıldı',
    onBase: (base: string) => `${base} dalındasın. Önce değişikliklerinin olduğu dala geç.`,
    noCommits: (base: string) => `Bu dalda ${base} dalında olmayan bir commit yok.`,
    notGitHub: 'Bu klasörün origin\'i bir GitHub deposu değil.',
    failed: (error: string) => `Pull request açılamadı: ${error}`,
    open: 'Pull request aç…',
    openLink: 'Pull request\'i GitHub\'da aç',
    openHint: 'Bu dal için pull request aç',
  }
);
