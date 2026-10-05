import React from 'react';
import {
  TerminalSquare,
  Sparkles,
  FolderOpen,
  Sliders,
  GitCompare,
  Users,
  Zap,
  FileDown,
  Search,
  Settings,
  ArrowRight,
} from 'lucide-react';
import { Button } from '@/components/ui/button.js';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog.js';

export type GuideAction =
  | 'focusDock'
  | 'launchClaude'
  | 'openFolder'
  | 'openSkills'
  | 'openChanges'
  | 'openSquad'
  | 'openMesh'
  | 'openReport'
  | 'openPalette'
  | 'openSettings';

interface GuideModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAction: (action: GuideAction) => void;
}

interface GuideItem {
  icon: React.ReactNode;
  title: string;
  what: string;
  how: string;
  shortcut?: string;
  action: GuideAction;
  cta: string;
}

const STEPS: { heading: string; items: GuideItem[] }[] = [
  {
    heading: 'Temel kullanım',
    items: [
      {
        icon: <TerminalSquare size={16} />,
        title: 'Komut çalıştır',
        what: 'Alttaki kutuya bir komut yazın (örn. git status, npm test) ve Enter\'a basın. Her komut, süresi ve çıktısıyla ayrı bir blok olarak görünür.',
        how: '↑↓ önceki komutlar · Tab öneriyi tamamlar · # ile başlayıp Türkçe tarif ederseniz ("# port 3000 kapat") uygun komutu önerir.',
        action: 'focusDock',
        cta: 'Kutuya git',
      },
      {
        icon: <Sparkles size={16} />,
        title: 'Yapay zekâya iş yaptır',
        what: 'Claude Code, Codex veya AGY\'yi terminalin içinde başlatır. Yaptırmak istediğinizi yazmanız yeterli.',
        how: 'Kutuya isteğinizi yazıp Ctrl+Shift+Enter\'a basın, Claude bu istekle açılır. Bir komut hata verirse bloktaki "Fix" düğmesi hatayı Claude\'a gönderir.',
        shortcut: 'Ctrl+Shift+Enter',
        action: 'launchClaude',
        cta: 'Claude\'u başlat',
      },
      {
        icon: <FolderOpen size={16} />,
        title: 'Proje ve dosyalar',
        what: 'Sol panelden çalışacağınız klasörü seçin. "Dosyalar" sekmesi proje dosyalarını gösterir.',
        how: 'Bir dosyaya tıklamak yolunu komut kutusuna ekler; komutu tamamlayıp Enter\'a basarsınız. Hiçbir şey kendiliğinden çalışmaz.',
        action: 'openFolder',
        cta: 'Klasör aç',
      },
    ],
  },
  {
    heading: 'Projeyi yönet',
    items: [
      {
        icon: <GitCompare size={16} />,
        title: 'Değişiklikler',
        what: 'Son git commit\'inden beri değişen dosyaları satır satır gösterir.',
        how: 'Buradan değişiklikleri inceleyip tek tıkla commit & push yapabilir ya da bir yapay zekâya kod incelemesi yaptırabilirsiniz.',
        shortcut: 'Ctrl+Shift+G',
        action: 'openChanges',
        cta: 'Değişiklikleri aç',
      },
      {
        icon: <Sliders size={16} />,
        title: 'Hafıza ve şablonlar',
        what: 'Sık kullandığınız komutları şablon olarak saklar; projeyle ilgili kuralları ("testler Vitest ile yazılır" gibi) hatırlar.',
        how: 'Kaydettiğiniz kurallar ajanlara otomatik iletilir, böylece her seferinde tekrar anlatmazsınız.',
        shortcut: 'Ctrl+Shift+K',
        action: 'openSkills',
        cta: 'Hafızayı aç',
      },
      {
        icon: <FileDown size={16} />,
        title: 'Rapor',
        what: 'Bu oturumda çalışan komutları ve kod değişikliklerini paylaşılabilir bir rapora (Markdown / HTML / JSON) dönüştürür.',
        how: 'Ekip arkadaşınıza ne yaptığınızı anlatmak için kullanın.',
        shortcut: 'Ctrl+Shift+X',
        action: 'openReport',
        cta: 'Rapor oluştur',
      },
    ],
  },
  {
    heading: 'İleri seviye',
    items: [
      {
        icon: <Users size={16} />,
        title: 'İkili ajan (Squad)',
        what: 'İki yapay zekâ yan yana çalışır: biri kodu yazar, diğeri test edip düzeltme ister.',
        how: 'Bir hedef ve test komutu (örn. npm test) verin; testler geçene kadar sırayla çalışırlar.',
        shortcut: 'Ctrl+Shift+S',
        action: 'openSquad',
        cta: 'Squad kur',
      },
      {
        icon: <Zap size={16} />,
        title: 'Otomatik görev (Auto Mesh)',
        what: 'Tek bir hedef verirsiniz; yazan, doğrulayan ve denetleyen üç ajan işi arka planda kendi başına yürütür.',
        how: 'Terminal görmeden, sadece sonucu takip etmek istediğinizde kullanın.',
        action: 'openMesh',
        cta: 'Görev başlat',
      },
      {
        icon: <Search size={16} />,
        title: 'Komut paleti',
        what: 'Uygulamadaki her işlemi adıyla arayıp çalıştırın; menüleri ezberlemenize gerek kalmaz.',
        how: 'Ctrl+Shift+P\'ye basıp ne yapmak istediğinizi yazın (örn. "split", "diff", "claude").',
        shortcut: 'Ctrl+Shift+P',
        action: 'openPalette',
        cta: 'Paleti aç',
      },
      {
        icon: <Settings size={16} />,
        title: 'Ayarlar',
        what: 'Kullanılacak kabuk (PowerShell, cmd, WSL), yazı tipi ve Claude/Codex/AGY modelleri ile izinleri.',
        how: 'Claude için "Default" modeli seçili kalırsa Claude Code kendi önerdiği modeli kullanır.',
        shortcut: 'Ctrl+,',
        action: 'openSettings',
        cta: 'Ayarları aç',
      },
    ],
  },
];

export const GuideModal: React.FC<GuideModalProps> = ({ isOpen, onClose, onAction }) => (
  <Dialog open={isOpen} onOpenChange={(open) => { if (!open) onClose(); }}>
    <DialogContent className="flex max-h-[85vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-2xl">
      <DialogHeader className="gap-1.5 border-b px-5 py-4 pr-12">
        <DialogTitle>Vulgaris nasıl kullanılır?</DialogTitle>
        <DialogDescription>
          Vulgaris, yapay zekâ ajanlarıyla birlikte çalışan bir terminaldir. Aşağıdaki özelliklerin her birini
          yanındaki düğmeyle hemen deneyebilirsiniz. Bu rehbere sağ üstteki <b>Yardım</b> düğmesinden ya da <b>F1</b> tuşuyla tekrar açabilirsiniz.
        </DialogDescription>
      </DialogHeader>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="space-y-5 px-5 py-4">
          {STEPS.map((step, i) => (
            <section key={step.heading} className="space-y-2">
              <h3 className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
                {i + 1}. {step.heading}
              </h3>
              {step.items.map((item) => (
                <div
                  key={item.title}
                  className="flex gap-3 rounded-lg border border-zinc-800/80 bg-zinc-950/60 p-3"
                >
                  <div className="mt-0.5 flex size-8 flex-shrink-0 items-center justify-center rounded-md border border-zinc-800 bg-zinc-900 text-zinc-300">
                    {item.icon}
                  </div>
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="text-[13px] font-semibold text-zinc-100">{item.title}</span>
                      {item.shortcut && (
                        <kbd className="rounded border border-zinc-800 bg-zinc-900 px-1.5 py-px font-mono text-[10px] text-zinc-400">
                          {item.shortcut}
                        </kbd>
                      )}
                    </div>
                    <p className="text-[12px] leading-relaxed text-zinc-300">{item.what}</p>
                    <p className="text-[11px] leading-relaxed text-zinc-500">{item.how}</p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-shrink-0 self-center"
                    onClick={() => {
                      onClose();
                      onAction(item.action);
                    }}
                  >
                    {item.cta}
                    <ArrowRight data-icon="inline-end" />
                  </Button>
                </div>
              ))}
            </section>
          ))}
        </div>
      </div>

      <DialogFooter className="m-0 border-t px-5 py-3">
        <Button onClick={onClose}>Anladım, başlayalım</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
);
