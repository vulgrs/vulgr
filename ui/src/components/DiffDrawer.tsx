import React from 'react';
import { GitCompareIcon, FileCodeIcon, SparklesIcon, ShieldIcon, BotIcon, RotateCcwIcon } from 'lucide-react';
import { Badge } from '@/components/ui/badge.js';
import { Button } from '@/components/ui/button.js';
import { ScrollArea } from '@/components/ui/scroll-area.js';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet.js';
import { DiffViewer } from './DiffViewer.js';
import type { SessionType } from '../types/warp.js';
import { useI18n } from '../i18n/index.js';

interface DiffDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  diff: string;
  filesChanged: string[];
  onRevert: () => void;
  onSendDiffToAgent: (type: SessionType) => void;
}

export const DiffDrawer: React.FC<DiffDrawerProps> = ({
  isOpen,
  onClose,
  diff,
  filesChanged,
  onRevert,
  onSendDiffToAgent,
}) => {
  const { t } = useI18n();
  return (
    <Sheet open={isOpen} onOpenChange={(open) => { if (!open) onClose(); }}>
      <SheetContent side="right" className="w-full gap-0 p-0 data-[side=right]:sm:max-w-xl">
        <SheetHeader className="border-b pr-12">
          <div className="flex flex-wrap items-center gap-2">
            <Badge>
              <GitCompareIcon data-icon="inline-start" />
              {t.workspace.diffBadge}
            </Badge>
            <Badge variant="outline">
              {t.workspace.fileCount(filesChanged.length)}
            </Badge>
          </div>
          <SheetTitle>{t.workspace.diffTitle}</SheetTitle>
          <SheetDescription>{t.workspace.diffDescription}</SheetDescription>
        </SheetHeader>

        {filesChanged.length > 0 && (
          <div className="flex items-center gap-2 overflow-x-auto border-b px-4 py-2">
            <FileCodeIcon className="size-3.5 shrink-0 text-muted-foreground" />
            {filesChanged.map((file) => (
              <Badge key={file} variant="secondary" className="font-mono">
                {file}
              </Badge>
            ))}
          </div>
        )}

        <ScrollArea className="min-h-0 flex-1">
          <div className="p-4">
            <DiffViewer diff={diff} />
          </div>
        </ScrollArea>

        <SheetFooter className="border-t">
          <p className="text-xs text-muted-foreground">{t.workspace.auditHint}</p>
          <div className="grid grid-cols-3 gap-2">
            <Button variant="outline" onClick={() => onSendDiffToAgent('claude')}>
              <SparklesIcon data-icon="inline-start" />
              Claude
            </Button>
            <Button variant="outline" onClick={() => onSendDiffToAgent('agy')}>
              <ShieldIcon data-icon="inline-start" />
              AGY
            </Button>
            <Button variant="outline" onClick={() => onSendDiffToAgent('codex')}>
              <BotIcon data-icon="inline-start" />
              Codex
            </Button>
          </div>
          <Button variant="destructive" onClick={onRevert}>
            <RotateCcwIcon data-icon="inline-start" />
            {t.workspace.discard}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
};
