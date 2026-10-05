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
        error: err.message || 'Merge failed',
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
              Sandbox
            </Badge>
            <Badge variant="secondary">{sandboxes.length} active</Badge>
          </div>
          <SheetTitle>Agent Worktree Sandbox Review</SheetTitle>
          <SheetDescription>Review isolated agent edits before merging into your working copy</SheetDescription>
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
              <EmptyTitle>No active sandboxes</EmptyTitle>
              <EmptyDescription>
                Autonomous agents run in sandboxes automatically.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        )}

        {mergeResult && (
          <div className="px-4 pt-4">
            <Alert variant={mergeResult.success ? 'default' : 'destructive'}>
              {mergeResult.success ? <CheckIcon /> : <AlertTriangleIcon />}
              <AlertTitle>{mergeResult.success ? 'Merged cleanly' : 'Merge failed'}</AlertTitle>
              <AlertDescription>
                {mergeResult.success
                  ? `Working branch updated (${mergeResult.mergedCommit?.substring(0, 7)})`
                  : mergeResult.conflict
                    ? `Merge conflict in: ${mergeResult.conflictFiles?.join(', ')}`
                    : mergeResult.error || 'Merge failed'}
              </AlertDescription>
            </Alert>
          </div>
        )}

        {selectedSandbox && (
          <div className="flex min-h-0 flex-1 flex-col gap-3 p-4">
            <div className="flex items-center justify-between gap-2 rounded-lg bg-muted px-3 py-2 font-mono text-xs">
              <span className="truncate text-muted-foreground">
                Path <span className="text-foreground">{selectedSandbox.worktreePath}</span>
              </span>
              <Badge variant="outline">
                {filesChanged.length} file{filesChanged.length === 1 ? '' : 's'}
              </Badge>
            </div>

            <ScrollArea className="min-h-0 flex-1 rounded-lg ring-1 ring-foreground/10">
              {diff.trim().length > 0 ? (
                <DiffViewer diff={diff} />
              ) : (
                <Empty className="border-0">
                  <EmptyHeader>
                    <EmptyTitle>No uncommitted changes</EmptyTitle>
                    <EmptyDescription>This sandbox has nothing to review yet.</EmptyDescription>
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
                Open Terminal Here
              </Button>
              <Button variant="destructive" disabled={discarding} onClick={handleDiscard}>
                {discarding ? <Spinner data-icon="inline-start" /> : <Trash2Icon data-icon="inline-start" />}
                {discarding ? 'Discarding...' : 'Discard'}
              </Button>
            </div>
            <Button disabled={merging} onClick={handleMerge}>
              {merging ? <Spinner data-icon="inline-start" /> : <GitMergeIcon data-icon="inline-start" />}
              {merging ? 'Merging...' : 'Merge into Active Branch'}
            </Button>
          </SheetFooter>
        )}
      </SheetContent>
    </Sheet>
  );
};
