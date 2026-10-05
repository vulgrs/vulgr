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
  return (
    <Sheet open={isOpen} onOpenChange={(open) => { if (!open) onClose(); }}>
      <SheetContent side="right" className="w-full gap-0 p-0 data-[side=right]:sm:max-w-xl">
        <SheetHeader className="border-b pr-12">
          <div className="flex flex-wrap items-center gap-2">
            <Badge>
              <GitCompareIcon data-icon="inline-start" />
              Diff
            </Badge>
            <Badge variant="outline">
              {filesChanged.length} file{filesChanged.length === 1 ? '' : 's'}
            </Badge>
          </div>
          <SheetTitle>Working Tree Diff & Cross-Check</SheetTitle>
          <SheetDescription>Inspect uncommitted changes and run adversarial audits</SheetDescription>
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
          <p className="text-xs text-muted-foreground">Cross-model adversarial audit pipes the diff to the target CLI.</p>
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
            Discard & Rollback Changes
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
};
