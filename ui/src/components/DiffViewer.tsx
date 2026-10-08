import React, { useState, useMemo } from 'react';
import {
  GitCompare,
  ChevronDown,
  ChevronRight,
  Copy,
  Check,
  FileCode,
  Undo2,
  ChevronsUpDown,
} from 'lucide-react';
import { useI18n } from '../i18n/index.js';

interface DiffViewerProps {
  diff: string;
  onRevertFile?: (filename: string) => void;
}

interface DiffLine {
  type: 'add' | 'del' | 'context' | 'hunk' | 'meta';
  text: string;
  oldNum?: number;
  newNum?: number;
}

interface DiffFile {
  filename: string;
  oldPath: string;
  newPath: string;
  additions: number;
  deletions: number;
  hunks: Array<{
    header: string;
    unmodifiedBefore?: number;
    lines: DiffLine[];
  }>;
}

function parseGitDiff(diffText: string): DiffFile[] {
  if (!diffText || !diffText.trim()) return [];

  const rawLines = diffText.split('\n');
  const files: DiffFile[] = [];
  let currentFile: DiffFile | null = null;
  let currentHunk: { header: string; unmodifiedBefore?: number; lines: DiffLine[] } | null = null;
  let oldLine = 0;
  let newLine = 0;

  for (let i = 0; i < rawLines.length; i++) {
    const line = rawLines[i];

    if (line.startsWith('diff --git')) {
      if (currentFile && currentHunk) {
        currentFile.hunks.push(currentHunk);
      }
      if (currentFile) {
        files.push(currentFile);
      }

      const match = line.match(/diff --git a\/(.+?) b\/(.+)/);
      const filename = match ? match[2] : 'file';
      currentFile = {
        filename,
        oldPath: match ? match[1] : filename,
        newPath: match ? match[2] : filename,
        additions: 0,
        deletions: 0,
        hunks: [],
      };
      currentHunk = null;
      continue;
    }

    if (!currentFile) {
      if (line.startsWith('--- /dev/null') && rawLines[i + 1]?.startsWith('+++ b/')) {
        const next = rawLines[i + 1];
        const fn = next.replace('+++ b/', '').trim();
        currentFile = {
          filename: fn,
          oldPath: '/dev/null',
          newPath: fn,
          additions: 0,
          deletions: 0,
          hunks: [],
        };
      } else {
        continue;
      }
    }

    if (line.startsWith('@@')) {
      if (currentHunk) {
        currentFile.hunks.push(currentHunk);
      }

      // e.g. @@ -32,5 +32,7 @@
      const hunkMatch = line.match(/@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
      if (hunkMatch) {
        oldLine = parseInt(hunkMatch[1], 10);
        newLine = parseInt(hunkMatch[2], 10);
      } else {
        oldLine = 1;
        newLine = 1;
      }

      const unmodified = Math.max(0, newLine - 1);
      currentHunk = {
        header: line,
        unmodifiedBefore: unmodified > 0 ? unmodified : undefined,
        lines: [],
      };
      continue;
    }

    if (!currentHunk) continue;

    if (line.startsWith('+') && !line.startsWith('+++')) {
      currentFile.additions++;
      currentHunk.lines.push({
        type: 'add',
        text: line.slice(1),
        newNum: newLine++,
      });
    } else if (line.startsWith('-') && !line.startsWith('---')) {
      currentFile.deletions++;
      currentHunk.lines.push({
        type: 'del',
        text: line.slice(1),
        oldNum: oldLine++,
      });
    } else if (line.startsWith(' ') || line === '') {
      currentHunk.lines.push({
        type: 'context',
        text: line.startsWith(' ') ? line.slice(1) : line,
        oldNum: oldLine++,
        newNum: newLine++,
      });
    }
  }

  if (currentFile && currentHunk) {
    currentFile.hunks.push(currentHunk);
  }
  if (currentFile && !files.includes(currentFile)) {
    files.push(currentFile);
  }

  return files;
}

export const DiffViewer: React.FC<DiffViewerProps> = ({ diff, onRevertFile }) => {
  const { t } = useI18n();
  const [copiedFile, setCopiedFile] = useState<string | null>(null);
  const [collapsedFiles, setCollapsedFiles] = useState<Record<string, boolean>>({});

  const parsedFiles = useMemo(() => parseGitDiff(diff), [diff]);

  if (!diff || !diff.trim() || parsedFiles.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 px-4 text-center font-sans select-none">
        <div className="w-10 h-10 rounded-xl bg-zinc-900 border border-zinc-800 flex items-center justify-center text-zinc-500 mb-3">
          <Check size={18} className="text-emerald-500" />
        </div>
        <p className="text-xs font-semibold text-zinc-300">{t.workspace.treeClean}</p>
        <p className="text-[11px] text-zinc-500 mt-1 max-w-xs">
          {t.workspace.treeCleanHint}
        </p>
      </div>
    );
  }

  const toggleFile = (filename: string) => {
    setCollapsedFiles((prev) => ({ ...prev, [filename]: !prev[filename] }));
  };

  const copyDiff = (filename: string, fileDiff: string) => {
    navigator.clipboard.writeText(fileDiff);
    setCopiedFile(filename);
    setTimeout(() => setCopiedFile(null), 1500);
  };

  return (
    <div className="space-y-3 font-sans select-text">
      {parsedFiles.map((file) => {
        const isCollapsed = !!collapsedFiles[file.filename];

        return (
          <div
            key={file.filename}
            className="rounded-xl border border-zinc-800/90 bg-base-app overflow-hidden shadow-sm"
          >
            {/* File Header Bar (Matches screenshot: .gitignore +2) */}
            <div className="px-3 py-2 bg-zinc-950 border-b border-zinc-800/80 flex items-center justify-between select-none">
              <div
                onClick={() => toggleFile(file.filename)}
                className="flex items-center space-x-2 min-w-0 cursor-pointer hover:text-zinc-200 transition-colors"
              >
                <button className="text-zinc-500 hover:text-zinc-300">
                  {isCollapsed ? <ChevronRight size={13} /> : <ChevronDown size={13} />}
                </button>
                <FileCode size={13} className="text-zinc-400 flex-shrink-0" />
                <span className="font-mono text-xs font-semibold text-zinc-200 truncate">
                  {file.filename}
                </span>

                {/* Addition / Deletion badge */}
                <div className="flex items-center space-x-1 text-[10px] font-mono ml-2">
                  {file.additions > 0 && (
                    <span className="text-emerald-400 font-semibold">+{file.additions}</span>
                  )}
                  {file.deletions > 0 && (
                    <span className="text-red-400 font-semibold">-{file.deletions}</span>
                  )}
                </div>
              </div>

              {/* Actions: Copy & Revert */}
              <div className="flex items-center space-x-1 select-none">
                <button
                  onClick={() => copyDiff(file.filename, diff)}
                  className="p-1 rounded text-zinc-500 hover:text-zinc-300 hover:bg-zinc-900 transition-colors"
                  title={t.workspace.copyDiff}
                >
                  {copiedFile === file.filename ? (
                    <Check size={12} className="text-emerald-400" />
                  ) : (
                    <Copy size={12} />
                  )}
                </button>
                {onRevertFile && (
                  <button
                    onClick={() => onRevertFile(file.filename)}
                    className="p-1 rounded text-zinc-500 hover:text-red-400 hover:bg-red-950/30 transition-colors"
                    title={t.workspace.revertFile}
                  >
                    <Undo2 size={12} />
                  </button>
                )}
              </div>
            </div>

            {/* Hunks & Lines */}
            {!isCollapsed && (
              <div className="font-mono text-xs overflow-x-auto bg-base-app">
                {file.hunks.map((hunk, hIdx) => (
                  <div key={hIdx} className="border-b border-zinc-900/60 last:border-b-0">
                    {/* Collapsible Unmodified Lines Indicator (From screenshot: "31 unmodified lines") */}
                    {hunk.unmodifiedBefore && hunk.unmodifiedBefore > 0 && (
                      <div className="flex items-center space-x-2 px-3 py-1.5 bg-zinc-950/80 border-b border-zinc-900 text-[10px] text-zinc-500 select-none">
                        <ChevronsUpDown size={11} className="text-zinc-600" />
                        <span>{t.workspace.unmodifiedLines(hunk.unmodifiedBefore)}</span>
                      </div>
                    )}

                    {/* Diff Lines Table */}
                    <div className="divide-y divide-zinc-900/20">
                      {hunk.lines.map((line, lIdx) => {
                        const isAdd = line.type === 'add';
                        const isDel = line.type === 'del';

                        return (
                          <div
                            key={lIdx}
                            className={`flex items-start text-[11px] leading-5 transition-colors ${
 isAdd
 ? 'bg-emerald-950/35 text-emerald-300'
 : isDel
 ? 'bg-red-950/35 text-red-300'
 : 'text-zinc-400 hover:bg-zinc-900/40'
 }`}
                          >
                            {/* Gutter Line Numbers (Screenshot: 32, 33, 34, 35, 36) */}
                            <div className="w-10 flex-shrink-0 text-right pr-3 select-none text-zinc-600 font-mono text-[10px]">
                              {line.newNum || line.oldNum || ''}
                            </div>

                            {/* Diff Marker Symbol (+, -, or space) */}
                            <div className="w-4 flex-shrink-0 text-center select-none font-bold">
                              {isAdd ? '+' : isDel ? '-' : ' '}
                            </div>

                            {/* Line Content */}
                            <div className="flex-1 min-w-0 pr-3 whitespace-pre overflow-x-auto">
                              {line.text || ' '}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};
