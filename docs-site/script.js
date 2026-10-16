(function () {
  'use strict';

  var REPO = 'vulgrs/vulgr';
  var RELEASES_URL = 'https://github.com/' + REPO + '/releases/latest';
  var STORAGE_KEY = 'vulgr.site.lang';

  var MESSAGES = {
    en: {
      title: 'Vulgr — open-source terminal for AI coding agents',
      description: "Vulgr is a free, open-source terminal for working with AI coding agents. Run Claude Code, Codex and AGY side by side, keep sessions organized and let agents check each other's work. For macOS, Windows and Linux.",
      navFeatures: 'Features',
      navDownload: 'Download',
      eyebrow: 'Free & open source · MIT',
      heroTitle: 'An open-source terminal for working with AI coding agents.',
      heroLead: "Run Claude Code, Codex and AGY side by side, keep your sessions organized, and let agents check each other's work.",
      downloadFor: 'Download for',
      yourOs: 'your OS',
      viewSource: 'View source',
      otherPlatforms: 'Other platforms',
      latest: function (v) { return 'Latest: ' + v + ' ·'; },
      recommended: 'Recommended for you',
      featuresTitle: 'Features',
      f1Title: 'Real terminals',
      f1Body: 'xterm.js + node-pty, so agent TUIs, colors and prompts work as in your normal terminal. Find text in a pane and save its output to a file.',
      f2Title: 'Panes, sessions and groups',
      f2Body: 'Split terminals side by side or stacked, each with its own command box. Tabs name themselves, sort into groups and come back on the next launch.',
      f3Title: 'Command box',
      f3Body: 'Run commands as blocks with duration and output, describe a command in plain words with <code>#</code>, or ask Claude with <code>?</code>.',
      f4Title: 'Agents working together',
      f4Body: 'Duo Loop: one agent writes, another tests. Agent Swarm: writer, checker and auditor on one goal. Orchestrator: a goal split into tasks that agents do in parallel. Pause, stop or restart one agent at any time.',
      f5Title: 'History, tokens and cost',
      f5Body: 'Every run is saved with a map you can replay, the real tokens and cost the agents reported, and a cost limit that stops a run. Run any of them again in one click.',
      f6Title: 'Git built in',
      f6Body: 'AI-written commit messages, commit & push, a branch switcher, and pull requests whose description an agent writes. Review every change before it lands.',
      f7Title: 'Updates itself',
      f7Body: 'A gift icon appears when a new version is ready; one click restarts into it, on macOS, Windows and Linux.',
      f8Title: 'Made to fit in',
      f8Body: 'Eight interface languages, dark and light themes, your own keyboard shortcuts, saved templates for goals and teams, and system notifications when a run ends.',
      downloadTitle: 'Download',
      downloadLead: 'Pick the build for your computer. Every file is on the GitHub Releases page.',
      macArm: 'Apple Silicon (M1 or later)',
      macIntel: 'Intel',
      unsignedTitle: 'These beta builds are not code-signed yet',
      unsignedLead: 'Your system will warn you the first time you open Vulgr. This is expected; here is how to open it:',
      unsignedMac: '<strong>macOS:</strong> right-click Vulgr in Applications and choose <em>Open</em>, then <em>Open</em> again. If macOS still refuses, go to <em>System Settings → Privacy &amp; Security</em> and click <em>Open Anyway</em>.',
      unsignedWin: '<strong>Windows:</strong> when SmartScreen appears, click <em>More info → Run anyway</em>.',
      unsignedLinux: '<strong>Linux:</strong> make the file executable with <code>chmod +x Vulgr-*.AppImage</code>, then run it.',
      npmLead: 'Or install it with npm and start it with <code>vulgr</code>:',
      signpathNote: 'Free code signing on Windows is provided by <a href="https://signpath.io/">SignPath.io</a>, certificate by <a href="https://signpath.org/">SignPath Foundation</a>.',
      privacyTitle: 'Privacy Policy',
      privacyBody: 'This program will not transfer any information to other networked systems unless specifically requested by the user or the person installing or operating it. Vulgr runs locally on your machine; network requests occur only when checking GitHub Releases for updates or when you explicitly sign in with GitHub or run AI coding agent CLIs that you have configured.',
      privacyLink: 'Privacy',
      issues: 'Issues'
    },
    tr: {
      title: 'Vulgr — yapay zekâ kod ajanları için açık kaynak terminal',
      description: "Vulgr, yapay zekâ kod ajanlarıyla çalışmak için ücretsiz ve açık kaynak bir terminal. Claude Code, Codex ve AGY'yi yan yana çalıştırın, oturumlarınızı düzenli tutun, ajanlar birbirinin işini kontrol etsin. macOS, Windows ve Linux için.",
      navFeatures: 'Özellikler',
      navDownload: 'İndir',
      eyebrow: 'Ücretsiz ve açık kaynak · MIT',
      heroTitle: 'Yapay zekâ kod ajanlarıyla çalışmak için açık kaynak terminal.',
      heroLead: "Claude Code, Codex ve AGY'yi yan yana çalıştırın, oturumlarınızı düzenli tutun, ajanlar birbirinin işini kontrol etsin.",
      downloadFor: 'İndir:',
      yourOs: 'işletim sisteminiz',
      viewSource: 'Kaynak kodu',
      otherPlatforms: 'Diğer platformlar',
      latest: function (v) { return 'Son sürüm: ' + v + ' ·'; },
      recommended: 'Sizin için önerilen',
      featuresTitle: 'Özellikler',
      f1Title: 'Gerçek terminaller',
      f1Body: 'xterm.js + node-pty sayesinde ajan arayüzleri, renkler ve istemler normal terminalindeki gibi çalışır. Panelde metin ara, çıktısını dosyaya kaydet.',
      f2Title: 'Paneller, oturumlar ve gruplar',
      f2Body: 'Terminalleri yan yana ya da alt alta böl, her birinin kendi komut kutusu olsun. Sekmeler kendini adlandırır, gruplara ayrılır ve bir sonraki açılışta geri gelir.',
      f3Title: 'Komut kutusu',
      f3Body: 'Komutları süre ve çıktısıyla bloklar halinde çalıştır, <code>#</code> ile bir komutu düz cümleyle tarif et ya da <code>?</code> ile Claude\'a sor.',
      f4Title: 'Birlikte çalışan ajanlar',
      f4Body: 'Duo Loop: bir ajan yazar, diğeri test eder. Agent Swarm: yazan, kontrol eden ve denetleyen ajanlar tek hedefte. Orchestrator: hedef görevlere bölünür, ajanlar paralel çalışır. İstediğin an duraklat, durdur ya da tek bir ajanı yeniden başlat.',
      f5Title: 'Geçmiş, token ve maliyet',
      f5Body: 'Her çalışma tekrar oynatılabilen haritasıyla, ajanların bildirdiği gerçek token ve maliyetle kaydedilir; maliyet sınırı çalışmayı durdurur. Herhangi birini tek tıkla tekrar çalıştır.',
      f6Title: 'Git içinde',
      f6Body: 'Yapay zekânın yazdığı commit mesajları, commit & push, dal değiştirici ve açıklamasını ajanın yazdığı pull request\'ler. Her değişikliği uygulanmadan önce incele.',
      f7Title: 'Kendini günceller',
      f7Body: 'Yeni sürüm hazır olunca bir hediye simgesi çıkar; tek tıkla yeni sürümle yeniden açılır. macOS, Windows ve Linux\'ta.',
      f8Title: 'Sana uyum sağlar',
      f8Body: 'Sekiz arayüz dili, koyu ve açık tema, kendi klavye kısayolların, hedef ve ekip şablonları, çalışma bitince sistem bildirimi.',
      downloadTitle: 'İndir',
      downloadLead: 'Bilgisayarınıza uygun sürümü seçin. Tüm dosyalar GitHub Releases sayfasında.',
      macArm: 'Apple Silicon (M1 ve sonrası)',
      macIntel: 'Intel',
      unsignedTitle: 'Bu beta sürümler henüz kod imzalı değil',
      unsignedLead: 'Vulgr\'ı ilk açtığınızda sisteminiz uyarı verecek. Bu beklenen bir durum; şöyle açabilirsiniz:',
      unsignedMac: '<strong>macOS:</strong> Uygulamalar klasöründe Vulgr\'a sağ tıklayıp <em>Aç</em>\'ı, ardından tekrar <em>Aç</em>\'ı seçin. macOS yine izin vermezse <em>Sistem Ayarları → Gizlilik ve Güvenlik</em>\'e gidip <em>Yine de Aç</em>\'a tıklayın.',
      unsignedWin: '<strong>Windows:</strong> SmartScreen uyarısı çıktığında <em>Ek bilgi → Yine de çalıştır</em>\'a tıklayın.',
      unsignedLinux: '<strong>Linux:</strong> dosyayı <code>chmod +x Vulgr-*.AppImage</code> ile çalıştırılabilir yapıp açın.',
      npmLead: 'Ya da npm ile kurup <code>vulgr</code> komutuyla başlatın:',
      signpathNote: 'Windows için ücretsiz kod imzalama <a href="https://signpath.io/">SignPath.io</a> tarafından, sertifika ise <a href="https://signpath.org/">SignPath Foundation</a> tarafından sağlanmaktadır.',
      privacyTitle: 'Gizlilik Politikası',
      privacyBody: 'Bu program, kullanıcı veya programı kuran/çalıştıran kişi tarafından özellikle istenmedikçe diğer ağ sistemlerine hiçbir bilgi aktarmaz. Vulgr bilgisayarınızda yerel olarak çalışır; ağ istekleri yalnızca GitHub Releases üzerinden güncelleme denetlenirken veya açıkça GitHub ile giriş yaptığınızda ya da yapılandırdığınız yapay zekâ kod ajanlarını çalıştırdığınızda gerçekleşir.',
      privacyLink: 'Gizlilik',
      issues: 'Sorunlar'
    }
  };

  var OS_LABELS = {
    'mac-arm64': 'macOS (Apple Silicon)',
    'mac-x64': 'macOS (Intel)',
    win: 'Windows',
    linux: 'Linux'
  };

  var ASSET_PATTERNS = {
    'mac-arm64': /-arm64\.dmg$/i,
    'mac-x64': /-x64\.dmg$/i,
    win: /\.exe$/i,
    linux: /\.AppImage$/i
  };

  var lang = detectLang();
  var detectedOs = null;
  var releaseVersion = null;

  function detectLang() {
    try {
      var saved = localStorage.getItem(STORAGE_KEY);
      if (saved === 'en' || saved === 'tr') return saved;
    } catch (e) {}
    var nav = (navigator.language || '').toLowerCase();
    return nav.indexOf('tr') === 0 ? 'tr' : 'en';
  }

  function applyLang(next) {
    lang = next;
    var m = MESSAGES[lang];
    document.documentElement.lang = lang;
    document.title = m.title;
    var desc = document.querySelector('meta[name="description"]');
    if (desc) desc.setAttribute('content', m.description);

    document.querySelectorAll('[data-i18n]').forEach(function (el) {
      var key = el.getAttribute('data-i18n');
      if (typeof m[key] === 'string') el.textContent = m[key];
    });
    document.querySelectorAll('[data-i18n-html]').forEach(function (el) {
      var key = el.getAttribute('data-i18n-html');
      if (typeof m[key] === 'string') el.innerHTML = m[key];
    });
    document.querySelectorAll('.lang button').forEach(function (btn) {
      btn.setAttribute('aria-pressed', String(btn.getAttribute('data-lang') === lang));
    });
    document.querySelectorAll('.dl').forEach(function (el) {
      el.setAttribute('data-badge', m.recommended);
    });
    renderPrimary();
  }

  function renderPrimary() {
    var m = MESSAGES[lang];
    document.getElementById('primary-os').textContent = detectedOs ? OS_LABELS[detectedOs] : m.yourOs;
    var versionEl = document.getElementById('release-version');
    versionEl.textContent = releaseVersion ? m.latest(releaseVersion) : '';
  }

  /** Best guess at the visitor's platform; returns a key of OS_LABELS or null (e.g. phones). */
  function detectOs() {
    var ua = navigator.userAgent || '';
    var platform = (navigator.userAgentData && navigator.userAgentData.platform) || navigator.platform || '';
    if (/iPhone|iPad|iPod|Android/i.test(ua)) return Promise.resolve(null);
    if (/Win/i.test(platform) || /Windows/i.test(ua)) return Promise.resolve('win');
    if (/Linux|X11/i.test(platform) || /Linux|X11/i.test(ua)) return Promise.resolve('linux');
    if (!/Mac/i.test(platform) && !/Mac OS X/i.test(ua)) return Promise.resolve(null);

    // Chromium can tell us the CPU architecture outright.
    if (navigator.userAgentData && navigator.userAgentData.getHighEntropyValues) {
      return navigator.userAgentData
        .getHighEntropyValues(['architecture'])
        .then(function (v) { return v.architecture === 'x86' ? 'mac-x64' : 'mac-arm64'; })
        .catch(function () { return guessMacArch(); });
    }
    return Promise.resolve(guessMacArch());
  }

  // Safari and Firefox report "Intel" on every Mac; an Intel GPU in WebGL is the
  // tell for Intel Macs. Most Macs in use today are Apple Silicon, so default to that.
  function guessMacArch() {
    try {
      var gl = document.createElement('canvas').getContext('webgl');
      var ext = gl && gl.getExtension('WEBGL_debug_renderer_info');
      var renderer = ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : '';
      if (/Intel/i.test(renderer)) return 'mac-x64';
    } catch (e) {}
    return 'mac-arm64';
  }

  /** Points the download links at the files of the newest release (betas included). */
  function loadRelease() {
    return fetch('https://api.github.com/repos/' + REPO + '/releases?per_page=10', {
      headers: { Accept: 'application/vnd.github+json' }
    })
      .then(function (res) { return res.ok ? res.json() : []; })
      .then(function (releases) {
        var release = (releases || []).find(function (r) {
          return !r.draft && r.assets && r.assets.length;
        });
        if (!release) return;
        releaseVersion = release.tag_name;
        document.querySelectorAll('.dl').forEach(function (el) {
          var pattern = ASSET_PATTERNS[el.getAttribute('data-os')];
          var asset = release.assets.find(function (a) { return pattern.test(a.name); });
          el.href = asset ? asset.browser_download_url : release.html_url;
        });
      })
      .catch(function () {});
  }

  function highlight() {
    var primary = document.getElementById('primary-download');
    document.querySelectorAll('.dl').forEach(function (el) {
      var match = el.getAttribute('data-os') === detectedOs;
      el.classList.toggle('recommended', match);
      if (match) primary.href = el.href;
    });
    if (!detectedOs) primary.href = '#download';
    renderPrimary();
  }

  document.querySelectorAll('.lang button').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var next = btn.getAttribute('data-lang');
      try { localStorage.setItem(STORAGE_KEY, next); } catch (e) {}
      applyLang(next);
    });
  });

  applyLang(lang);
  document.querySelectorAll('.dl').forEach(function (el) { el.href = RELEASES_URL; });

  Promise.all([detectOs(), loadRelease()]).then(function (results) {
    detectedOs = results[0];
    highlight();
  });
})();
