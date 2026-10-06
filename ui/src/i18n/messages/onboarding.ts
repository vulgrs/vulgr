import { ns } from '../ns.js';

/** First-launch welcome flow. */
export const onboarding = ns(
  {
    skip: 'Skip',
    back: 'Back',
    next: 'Next',
    start: 'Start',
    finish: 'Open Vulgr',
    stepOf: (n: number, total: number) => `${n} / ${total}`,
    welcome: {
      title: 'Welcome to Vulgr',
      body: 'A terminal that works together with AI agents. Take a minute to set it up and see what it can do.',
    },
    prefs: {
      title: 'Make it yours',
      body: 'Pick a language and a look. You can change both later in Settings.',
      language: 'Language',
      theme: 'Theme',
    },
    github: {
      title: 'Sign in with GitHub',
      body: 'Your GitHub photo and name appear on the profile card. Optional — you can skip this and sign in later from the card.',
      signedInAs: (name: string) => `Signed in as ${name}`,
      later: 'You can also sign in later from the profile card at the bottom left.',
    },
    terminals: {
      title: 'Terminals and groups',
      body: 'Open terminals with + and collect them in groups with the folder button. Drag a terminal onto a group to move it there.',
      points: [
        'Titles name themselves after the work done — or stay "Untitled".',
        'Double-click a name, or use the pencil, to rename it.',
        'Everything is saved and comes back on the next launch.',
      ],
    },
    split: {
      title: 'Side by side, or stacked',
      body: 'Split the screen from the bar above the terminal. Each pane is a terminal of its own, with its own command box.',
      points: [
        'Side by side: Ctrl+Shift+D',
        'Stacked: Ctrl+Shift+E',
        'Split panes are listed inside their tab in the sidebar.',
      ],
    },
    command: {
      title: 'The command box',
      body: 'Type a command and press Enter. Each run shows up as its own block with its duration and output.',
      points: [
        '# plus plain words → a matching command is suggested',
        '? plus a question → asks Claude',
        '↑↓ history · Tab completes',
      ],
    },
    agents: {
      title: 'Let agents do the work',
      body: 'Three ways to hand work to AI, from the top of the sidebar and the top bar.',
      points: [
        'Duo Loop: one agent writes, another tests and asks for fixes.',
        'Agent Swarm: give a goal; writer, checker and auditor run it in the background.',
        'Claude Chat: talk to Claude Code and watch its changes live.',
      ],
    },
    project: {
      title: 'Changes, report, memory',
      body: 'Keep track of what the agents did and what they should remember.',
      points: [
        'Changes: review the diff, then commit & push.',
        'Report: save the session as Markdown, HTML or JSON.',
        'Memory: rules and facts the agents always get.',
      ],
    },
    done: {
      title: 'You are ready',
      body: 'Open your first terminal and start. Press F1 or Help any time to see this again.',
    },
  },
  {
    skip: 'Geç',
    back: 'Geri',
    next: 'İleri',
    start: 'Başla',
    finish: "Vulgr'ı aç",
    stepOf: (n: number, total: number) => `${n} / ${total}`,
    welcome: {
      title: "Vulgr'a hoş geldin",
      body: 'Yapay zekâ ajanlarıyla birlikte çalışan bir terminal. Bir dakikanı ayır, kuralım ve neler yapabildiğine bakalım.',
    },
    prefs: {
      title: 'Kendine göre ayarla',
      body: 'Bir dil ve görünüm seç. İkisini de sonra Ayarlar’dan değiştirebilirsin.',
      language: 'Dil',
      theme: 'Tema',
    },
    github: {
      title: 'GitHub ile giriş yap',
      body: 'GitHub fotoğrafın ve adın profil kartında görünür. İsteğe bağlı — şimdi geçip sonra karttan giriş yapabilirsin.',
      signedInAs: (name: string) => `${name} olarak giriş yapıldı`,
      later: 'Sol alttaki profil kartından da sonra giriş yapabilirsin.',
    },
    terminals: {
      title: 'Terminaller ve gruplar',
      body: '+ ile terminal aç, klasör düğmesiyle grup oluştur. Bir terminali gruba taşımak için grubun üstüne sürükle.',
      points: [
        'Başlıklar yapılan işe göre kendiliğinden oluşur — iş yoksa "Adsız" kalır.',
        'Adı değiştirmek için isme çift tıkla ya da kalemi kullan.',
        'Her şey kaydedilir, bir sonraki açılışta geri gelir.',
      ],
    },
    split: {
      title: 'Yan yana ya da alt alta',
      body: 'Ekranı terminalin üstündeki çubuktan böl. Her panel ayrı bir terminaldir ve kendi komut kutusu vardır.',
      points: [
        'Yan yana: Ctrl+Shift+D',
        'Alt alta: Ctrl+Shift+E',
        'Bölünen paneller kenar çubuğunda kendi sekmesinin içinde listelenir.',
      ],
    },
    command: {
      title: 'Komut kutusu',
      body: 'Bir komut yaz ve Enter’a bas. Her çalıştırma süresi ve çıktısıyla ayrı bir blok olarak görünür.',
      points: [
        '# ve Türkçe tarif → uygun komut önerilir',
        '? ve soru → Claude’a sorulur',
        '↑↓ geçmiş · Tab tamamlar',
      ],
    },
    agents: {
      title: 'İşi ajanlara bırak',
      body: 'Kenar çubuğunun üstünden ve üst çubuktan yapay zekâya iş vermenin üç yolu.',
      points: [
        'Duo Loop: bir ajan yazar, diğeri test edip düzeltme ister.',
        'Agent Swarm: bir hedef ver; yazan, kontrol eden ve denetleyen arka planda yürütür.',
        'Claude Chat: Claude Code ile konuş, değişikliklerini canlı izle.',
      ],
    },
    project: {
      title: 'Değişiklikler, rapor, hafıza',
      body: 'Ajanların ne yaptığını ve neyi hatırlaması gerektiğini takip et.',
      points: [
        'Değişiklikler: farkı incele, sonra commit & push.',
        'Rapor: oturumu Markdown, HTML ya da JSON olarak kaydet.',
        'Hafıza: ajanlara her zaman iletilen kurallar ve bilgiler.',
      ],
    },
    done: {
      title: 'Hazırsın',
      body: 'İlk terminalini aç ve başla. Bunu tekrar görmek için istediğin an F1’e ya da Yardım’a bas.',
    },
  }
);
