import { ns } from '../ns.js';

interface GuideText {
  title: string;
  what: string;
  how: string;
  cta: string;
}

export const guide = ns(
  {
    title: 'How to use Vulgr?',
    introBefore:
      'Vulgr is a terminal that works together with AI agents. You can try each feature below right away with the button next to it. Reopen this guide any time with the',
    introButton: 'Help',
    introMiddle: 'button at the top right or the',
    introAfter: 'key.',
    done: 'Got it, let’s start',
    headings: ['Basics', 'Manage the project', 'Advanced'],
    items: {
      focusDock: {
        title: 'Run a command',
        what: 'Type a command in the box at the bottom (e.g. git status, npm test) and press Enter. Each command appears as its own block with its duration and output.',
        how: '↑↓ previous commands · Tab completes the suggestion · start with # and describe it in plain words ("# kill port 3000") to get a matching command.',
        cta: 'Go to box',
      },
      launchClaude: {
        title: 'Let AI do the work',
        what: 'Starts Claude Code, Codex or AGY inside the terminal. Just write what you want done.',
        how: 'Type your request in the box and press Ctrl+Shift+Enter; Claude opens with that request. If a command fails, the block’s "Fix" button sends the error to Claude.',
        cta: 'Start Claude',
      },
      openChanges: {
        title: 'Changes',
        what: 'Shows the files changed since the last git commit, line by line.',
        how: 'Review changes here and commit & push in one click, or ask an AI for a code review.',
        cta: 'Open changes',
      },
      openSkills: {
        title: 'Memory & templates',
        what: 'Saves commands you use often as templates and remembers project rules (like "tests are written with Vitest").',
        how: 'Saved rules are passed to the agents automatically, so you don’t have to repeat them every time.',
        cta: 'Open memory',
      },
      openReport: {
        title: 'Report',
        what: 'Turns the commands run and code changed in this session into a shareable report (Markdown / HTML / JSON).',
        how: 'Use it to tell a teammate what you did.',
        cta: 'Create report',
      },
      openSquad: {
        title: 'Duo agent (Squad)',
        what: 'Two AIs work side by side: one writes the code, the other tests it and asks for fixes.',
        how: 'Give a goal and a test command (e.g. npm test); they take turns until the tests pass.',
        cta: 'Set up squad',
      },
      openMesh: {
        title: 'Auto task (Auto Mesh)',
        what: 'You give one goal; builder, verifier and auditor agents run the work in the background on their own.',
        how: 'Use it when you only want to follow the result without watching a terminal.',
        cta: 'Start task',
      },
      openPalette: {
        title: 'Command palette',
        what: 'Search and run any action in the app by name; no need to memorize menus.',
        how: 'Press Ctrl+Shift+P and type what you want to do (e.g. "split", "diff", "claude").',
        cta: 'Open palette',
      },
      openSettings: {
        title: 'Settings',
        what: 'The shell to use (PowerShell, cmd, WSL), font, language, and the Claude/Codex/AGY models and permissions.',
        how: 'If the "Default" model stays selected for Claude, Claude Code uses the model it recommends.',
        cta: 'Open settings',
      },
    } as Record<string, GuideText>,
  },
  {
    title: 'Vulgr nasıl kullanılır?',
    introBefore:
      'Vulgr, yapay zekâ ajanlarıyla birlikte çalışan bir terminaldir. Aşağıdaki özelliklerin her birini yanındaki düğmeyle hemen deneyebilirsiniz. Bu rehberi sağ üstteki',
    introButton: 'Yardım',
    introMiddle: 'düğmesinden ya da',
    introAfter: 'tuşuyla tekrar açabilirsiniz.',
    done: 'Anladım, başlayalım',
    headings: ['Temel kullanım', 'Projeyi yönet', 'İleri seviye'],
    items: {
      focusDock: {
        title: 'Komut çalıştır',
        what: "Alttaki kutuya bir komut yazın (örn. git status, npm test) ve Enter'a basın. Her komut, süresi ve çıktısıyla ayrı bir blok olarak görünür.",
        how: '↑↓ önceki komutlar · Tab öneriyi tamamlar · # ile başlayıp Türkçe tarif ederseniz ("# port 3000 kapat") uygun komutu önerir.',
        cta: 'Kutuya git',
      },
      launchClaude: {
        title: 'Yapay zekâya iş yaptır',
        what: "Claude Code, Codex veya AGY'yi terminalin içinde başlatır. Yaptırmak istediğinizi yazmanız yeterli.",
        how: 'Kutuya isteğinizi yazıp Ctrl+Shift+Enter\'a basın, Claude bu istekle açılır. Bir komut hata verirse bloktaki "Fix" düğmesi hatayı Claude\'a gönderir.',
        cta: "Claude'u başlat",
      },
      openChanges: {
        title: 'Değişiklikler',
        what: "Son git commit'inden beri değişen dosyaları satır satır gösterir.",
        how: 'Buradan değişiklikleri inceleyip tek tıkla commit & push yapabilir ya da bir yapay zekâya kod incelemesi yaptırabilirsiniz.',
        cta: 'Değişiklikleri aç',
      },
      openSkills: {
        title: 'Hafıza ve şablonlar',
        what: 'Sık kullandığınız komutları şablon olarak saklar; projeyle ilgili kuralları ("testler Vitest ile yazılır" gibi) hatırlar.',
        how: 'Kaydettiğiniz kurallar ajanlara otomatik iletilir, böylece her seferinde tekrar anlatmazsınız.',
        cta: 'Hafızayı aç',
      },
      openReport: {
        title: 'Rapor',
        what: 'Bu oturumda çalışan komutları ve kod değişikliklerini paylaşılabilir bir rapora (Markdown / HTML / JSON) dönüştürür.',
        how: 'Ekip arkadaşınıza ne yaptığınızı anlatmak için kullanın.',
        cta: 'Rapor oluştur',
      },
      openSquad: {
        title: 'İkili ajan (Squad)',
        what: 'İki yapay zekâ yan yana çalışır: biri kodu yazar, diğeri test edip düzeltme ister.',
        how: 'Bir hedef ve test komutu (örn. npm test) verin; testler geçene kadar sırayla çalışırlar.',
        cta: 'Squad kur',
      },
      openMesh: {
        title: 'Otomatik görev (Auto Mesh)',
        what: 'Tek bir hedef verirsiniz; yazan, doğrulayan ve denetleyen üç ajan işi arka planda kendi başına yürütür.',
        how: 'Terminal görmeden, sadece sonucu takip etmek istediğinizde kullanın.',
        cta: 'Görev başlat',
      },
      openPalette: {
        title: 'Komut paleti',
        what: 'Uygulamadaki her işlemi adıyla arayıp çalıştırın; menüleri ezberlemenize gerek kalmaz.',
        how: 'Ctrl+Shift+P\'ye basıp ne yapmak istediğinizi yazın (örn. "split", "diff", "claude").',
        cta: 'Paleti aç',
      },
      openSettings: {
        title: 'Ayarlar',
        what: 'Kullanılacak kabuk (PowerShell, cmd, WSL), yazı tipi, dil ve Claude/Codex/AGY modelleri ile izinleri.',
        how: 'Claude için "Default" modeli seçili kalırsa Claude Code kendi önerdiği modeli kullanır.',
        cta: 'Ayarları aç',
      },
    },
  }
);
