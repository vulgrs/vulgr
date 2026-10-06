import React from 'react';
import {
  TerminalSquare,
  Sparkles,
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
import { useI18n } from '../i18n/index.js';

export type GuideAction =
  | 'focusDock'
  | 'launchClaude'
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
  shortcut?: string;
  action: GuideAction;
}

/** Sections in display order; texts come from the `guide` translation table, keyed by action. */
const STEPS: GuideItem[][] = [
  [
    { icon: <TerminalSquare size={16} />, action: 'focusDock' },
    { icon: <Sparkles size={16} />, shortcut: 'Ctrl+Shift+Enter', action: 'launchClaude' },
  ],
  [
    { icon: <GitCompare size={16} />, shortcut: 'Ctrl+Shift+G', action: 'openChanges' },
    { icon: <Sliders size={16} />, shortcut: 'Ctrl+Shift+K', action: 'openSkills' },
    { icon: <FileDown size={16} />, shortcut: 'Ctrl+Shift+X', action: 'openReport' },
  ],
  [
    { icon: <Users size={16} />, shortcut: 'Ctrl+Shift+S', action: 'openSquad' },
    { icon: <Zap size={16} />, action: 'openMesh' },
    { icon: <Search size={16} />, shortcut: 'Ctrl+Shift+P', action: 'openPalette' },
    { icon: <Settings size={16} />, shortcut: 'Ctrl+,', action: 'openSettings' },
  ],
];

export const GuideModal: React.FC<GuideModalProps> = ({ isOpen, onClose, onAction }) => {
  const { t } = useI18n();
  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="flex max-h-[85vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-2xl">
        <DialogHeader className="gap-1.5 border-b px-5 py-4 pr-12">
          <DialogTitle>{t.guide.title}</DialogTitle>
          <DialogDescription>
            {t.guide.introBefore} <b>{t.guide.introButton}</b> {t.guide.introMiddle} <b>F1</b> {t.guide.introAfter}
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="space-y-5 px-5 py-4">
            {STEPS.map((items, i) => (
              <section key={i} className="space-y-2">
                <h3 className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
                  {i + 1}. {t.guide.headings[i]}
                </h3>
                {items.map((item) => {
                  const text = t.guide.items[item.action];
                  return (
                    <div
                      key={item.action}
                      className="flex gap-3 rounded-lg border border-zinc-800/80 bg-zinc-950/60 p-3"
                    >
                      <div className="mt-0.5 flex size-8 flex-shrink-0 items-center justify-center rounded-md border border-zinc-800 bg-zinc-900 text-zinc-300">
                        {item.icon}
                      </div>
                      <div className="min-w-0 flex-1 space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="text-[13px] font-semibold text-zinc-100">{text.title}</span>
                          {item.shortcut && (
                            <kbd className="rounded border border-zinc-800 bg-zinc-900 px-1.5 py-px font-mono text-[10px] text-zinc-400">
                              {item.shortcut}
                            </kbd>
                          )}
                        </div>
                        <p className="text-[12px] leading-relaxed text-zinc-300">{text.what}</p>
                        <p className="text-[11px] leading-relaxed text-zinc-500">{text.how}</p>
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
                        {text.cta}
                        <ArrowRight data-icon="inline-end" />
                      </Button>
                    </div>
                  );
                })}
              </section>
            ))}
          </div>
        </div>

        <DialogFooter className="m-0 border-t px-5 py-3">
          <Button onClick={onClose}>{t.guide.done}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
