import React, { useState, useEffect } from 'react';
import { GitBranchIcon, GitMergeIcon, Trash2Icon, TerminalIcon, CheckIcon, AlertTriangleIcon } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert.js';
import { Badge } from '@/components/ui/badge.js';
import { Button } from '@/components/ui/button.js';
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty.js';
import { ScrollArea } from '@/components/ui/scroll-area.js';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet.js';
import { Spinner } from '@/components/ui/spinner.js';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group.js';
import { DiffViewer } from './DiffViewer.js';
import type { SandboxSession, SandboxMergeResult } from '../types/warp.js';
import { useI18n } from '../i18n/index.js';

interface SandboxDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenTerminalInSandbox: (worktreePath: string) => void;
  onRefreshDiff?: () => void;
}

export const SandboxDrawer: React.FC<SandboxDrawerProps> = ({
  isOpen,
  onClose,
  onOpenTerminalInSandbox,
  onRefreshDiff,
}) => {
  const { t } = useI18n();
  const [sandboxes, setSandboxes] = useState<SandboxSession[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [diff, setDiff] = useState<string>('');
  const [filesChanged, setFilesChanged] = useState<string[]>([]);
  const [merging, setMerging] = useState(false);
  const [mergeResult, setMergeResult] = useState<SandboxMergeResult | null>(null);
  const [discarding, setDiscarding] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    loadSandboxes();
  }, [isOpen]);

  const loadSandboxes = async () => {
    if (window.warpApi?.listSandboxes) {
      try {
        const list = await window.warpApi.listSandboxes();
        setSandboxes(list);
        if (list.length > 0) {
          if (!selectedId || !list.some((s: SandboxSession) => s.id === selectedId)) {
            setSelectedId(list[0].id);
          }
        } else {
          setSelectedId(null);
          setDiff('');
          setFilesChanged([]);
        }
      } catch (err) {
        console.error('Failed to load sandboxes:', err);
      }
    }
  };

  const selectedSandbox = sandboxes.find((s) => s.id === selectedId) || null;

  useEffect(() => {
    if (!selectedSandbox) {
      setDiff('');
      setFilesChanged([]);
      return;
    }

    loadDiff(selectedSandbox.worktreePath);
  }, [selectedSandbox?.id]);

  const loadDiff = async (worktreePath: string) => {
    if (window.warpApi?.getSandboxDiff) {
      try {
        const res = await window.warpApi.getSandboxDiff(worktreePath);
        setDiff(res.diff || '');
        setFilesChanged(res.filesChanged || []);
      } catch (err) {
        console.error('Failed to get sandbox diff:', err);
      }
    }
  };

  const handleMerge = async () => {
    if (!selectedSandbox || !window.warpApi?.mergeSandbox) return;
    setMerging(true);
    setMergeResult(null);

    try {
      const res: SandboxMergeResult = await window.warpApi.mergeSandbox({
        worktreePath: selectedSandbox.worktreePath,
        branchName: selectedSandbox.branchName,
      });

      setMergeResult(res);
      if (res.success) {
        onRefreshDiff?.();
        setTimeout(async () => {
          await loadSandboxes();
        }, 1500);
      }
    } catch (err: any) {
      setMergeResult({
        success: false,
        error: err.message || t.modals.sandbox.mergeFailed,
      });
    } finally {
      setMerging(false);
    }
  };

  const handleDiscard = async () => {
    if (!selectedSandbox || !window.warpApi?.destroySandbox) return;
    setDiscarding(true);

    try {
      await window.warpApi.destroySandbox({
        worktreePath: selectedSandbox.worktreePath,
        branchName: selectedSandbox.branchName,
        force: true,
      });
      await loadSandboxes();
    } catch (err) {
      console.error('Failed to discard sandbox:', err);
    } finally {
      setDiscarding(false);
    }
  };

  return (
    <Sheet open={isOpen} onOpenChange={(open) => { if (!open) onClose(); }}>
      <SheetContent side="right" className="w-full gap-0 p-0 data-[side=right]:sm:max-w-2xl">
        <SheetHeader className="border-b pr-12">
          <div className="flex flex-wrap items-center gap-2">
            <Badge>
              <GitBranchIcon data-icon="inline-start" />
              {t.modals.sandbox.badge}
            </Badge>
            <Badge variant="secondary">{t.modals.sandbox.active(sandboxes.length)}</Badge>
          </div>
          <SheetTitle>{t.modals.sandbox.title}</SheetTitle>
          <SheetDescription>{t.modals.sandbox.description}</SheetDescription>
        </SheetHeader>

        {sandboxes.length > 0 ? (
          <div className="border-b px-4 py-3">
            <ToggleGroup
              value={selectedId ? [selectedId] : []}
              onValueChange={(value) => {
                const next = value[0];
                if (next) {
                  setSelectedId(next);
                  setMergeResult(null);
                }
              }}
              spacing={2}
              className="flex-wrap"
            >
              {sandboxes.map((sandbox) => (
                <ToggleGroupItem key={sandbox.id} value={sandbox.id} className="max-w-48 font-mono">
                  <GitBranchIcon data-icon="inline-start" />
                  <span className="truncate">{sandbox.branchName}</span>
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          </div>
        ) : (
          <Empty className="m-4">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <GitBranchIcon />
              </EmptyMedia>
              <EmptyTitle>{t.modals.sandbox.emptyTitle}</EmptyTitle>
              <EmptyDescription>
                {t.modals.sandbox.emptyHint}
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        )}

        {mergeResult && (
          <div className="px-4 pt-4">
            <Alert variant={mergeResult.success ? 'default' : 'destructive'}>
              {mergeResult.success ? <CheckIcon /> : <AlertTriangleIcon />}
              <AlertTitle>{mergeResult.success ? t.modals.sandbox.mergedCleanly : t.modals.sandbox.mergeFailed}</AlertTitle>
              <AlertDescription>
                {mergeResult.success
                  ? t.modals.sandbox.branchUpdated(mergeResult.mergedCommit?.substring(0, 7) ?? '')
                  : mergeResult.conflict
                    ? t.modals.sandbox.conflict(mergeResult.conflictFiles?.join(', ') ?? '')
                    : mergeResult.error || t.modals.sandbox.mergeFailed}
              </AlertDescription>
            </Alert>
          </div>
        )}

        {selectedSandbox && (
          <div className="flex min-h-0 flex-1 flex-col gap-3 p-4">
            <div className="flex items-center justify-between gap-2 rounded-lg bg-muted px-3 py-2 font-mono text-xs">
              <span className="truncate text-muted-foreground">
                {t.modals.sandbox.path} <span className="text-foreground">{selectedSandbox.worktreePath}</span>
              </span>
              <Badge variant="outline">
                {t.modals.sandbox.files(filesChanged.length)}
              </Badge>
            </div>

            <ScrollArea className="min-h-0 flex-1 rounded-lg ring-1 ring-foreground/10">
              {diff.trim().length > 0 ? (
                <DiffViewer diff={diff} />
              ) : (
                <Empty className="border-0">
                  <EmptyHeader>
                    <EmptyTitle>{t.modals.sandbox.noChanges}</EmptyTitle>
                    <EmptyDescription>{t.modals.sandbox.noChangesHint}</EmptyDescription>
                  </EmptyHeader>
                </Empty>
              )}
            </ScrollArea>
          </div>
        )}

        {selectedSandbox && (
          <SheetFooter className="border-t sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-2">
              <Button variant="outline" onClick={() => onOpenTerminalInSandbox(selectedSandbox.worktreePath)}>
                <TerminalIcon data-icon="inline-start" />
                {t.modals.sandbox.openTerminal}
              </Button>
              <Button variant="destructive" disabled={discarding} onClick={handleDiscard}>
                {discarding ? <Spinner data-icon="inline-start" /> : <Trash2Icon data-icon="inline-start" />}
                {discarding ? t.modals.sandbox.discarding : t.modals.sandbox.discard}
              </Button>
            </div>
            <Button disabled={merging} onClick={handleMerge}>
              {merging ? <Spinner data-icon="inline-start" /> : <GitMergeIcon data-icon="inline-start" />}
              {merging ? t.modals.sandbox.merging : t.modals.sandbox.merge}
            </Button>
          </SheetFooter>
        )}
      </SheetContent>
    </Sheet>
  );
};
