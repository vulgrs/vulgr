import React, { useState, useEffect, useMemo } from 'react';
import {
  X,
  FileDown,
  Copy,
  Check,
  Code,
  Clock,
  CheckCircle2,
  AlertCircle,
  FileText,
  FileCode,
  Share2,
  FolderArchive,
  Eye,
  GitBranch,
} from 'lucide-react';
import type { SessionReportData, ReportCommandBlock } from '../types/warp.js';

interface ExportReportModalProps {
  isOpen: boolean;
  onClose: () => void;
  reportData: SessionReportData;
}

type ExportFormat = 'markdown' | 'html' | 'json';

export const ExportReportModal: React.FC<ExportReportModalProps> = ({
  isOpen,
  onClose,
  reportData,
}) => {
  const [activeTab, setActiveTab] = useState<'timeline' | 'preview'>('timeline');
  const [format, setFormat] = useState<ExportFormat>('markdown');
  const [includeDiff, setIncludeDiff] = useState(true);
  const [stripAnsi, setStripAnsi] = useState(true);
  const [generatedContent, setGeneratedContent] = useState('');
  const [copied, setCopied] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<string | null>(null);

  // Generate the report via IPC or local fallback
  useEffect(() => {
    if (!isOpen) return;

    let mounted = true;
    const generate = async () => {
      try {
        if (window.warpApi?.generateReport) {
          const res = await window.warpApi.generateReport(reportData, format, {
            includeDiff,
            stripAnsi,
          });
          if (mounted) setGeneratedContent(res);
        } else {
          // Fallback simple JSON
          if (mounted) setGeneratedContent(JSON.stringify(reportData, null, 2));
        }
      } catch (err: any) {
        if (mounted) setGeneratedContent(`// Error generating report:\n${err.message}`);
      }
    };

    generate();
    return () => {
      mounted = false;
    };
  }, [isOpen, format, includeDiff, stripAnsi, reportData]);

  // Handle keyboard escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  const handleCopy = () => {
    navigator.clipboard.writeText(generatedContent);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSaveToDisk = async () => {
    if (!window.warpApi?.saveReportToFile) return;

    setIsSaving(true);
    setSaveStatus(null);
    try {
      const ext = format === 'html' ? 'html' : format === 'json' ? 'json' : 'md';
      const defaultFilename = `dexter-report-${new Date().toISOString().slice(0, 10)}.${ext}`;
      const res = await window.warpApi.saveReportToFile(generatedContent, defaultFilename, format);
      if (res.success && res.filePath) {
        setSaveStatus(`Saved: ${res.filePath.split(/[\\/]/).pop()}`);
        setTimeout(() => setSaveStatus(null), 3500);
      }
    } catch (err: any) {
      setSaveStatus(`Error: ${err.message}`);
    } finally {
      setIsSaving(false);
    }
  };

  const totalCmds = reportData.commands.length;
  const passedCmds = reportData.commands.filter((c) => c.exitCode === 0).length;
  const failedCmds = reportData.commands.filter((c) => c.exitCode !== null && c.exitCode !== 0).length;

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-md p-4 animate-in fade-in duration-200">
      <div
        className="relative w-full max-w-4xl max-h-[85vh] flex flex-col rounded-2xl bg-[#090b11] border border-white/[0.1] shadow-2xl overflow-hidden font-sans text-slate-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/[0.08] bg-white/[0.02]">
          <div className="flex items-center space-x-3">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-purple-500 to-cyan-400 flex items-center justify-center text-black shadow-[0_0_15px_rgba(168,85,247,0.3)]">
              <FileDown size={17} className="text-black fill-current" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h2 className="text-sm font-bold text-white tracking-wide">
                  Dexter Technical Session Report
                </h2>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-medium bg-cyan-500/10 text-cyan-300 border border-cyan-500/25">
                  {totalCmds} commands
                </span>
                {failedCmds > 0 && (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-medium bg-red-500/10 text-red-300 border border-red-500/25">
                    {failedCmds} failed
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-400 mt-0.5 flex items-center space-x-2 font-mono">
                <span>{reportData.workspacePath || 'Current Workspace'}</span>
                {reportData.branch && (
                  <>
                    <span>•</span>
                    <span className="flex items-center space-x-1 text-purple-300">
                      <GitBranch size={11} />
                      <span>{reportData.branch}</span>
                    </span>
                  </>
                )}
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/[0.08] transition-all"
            title="Close (Esc)"
          >
            <X size={17} />
          </button>
        </div>

        {/* Tab Switcher & Option Bar */}
        <div className="px-6 py-2.5 bg-white/[0.01] border-b border-white/[0.06] flex items-center justify-between flex-wrap gap-3 text-xs">
          <div className="flex items-center space-x-1 p-1 bg-white/[0.03] border border-white/[0.08] rounded-xl">
            <button
              onClick={() => setActiveTab('timeline')}
              className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg font-medium transition-all ${
                activeTab === 'timeline'
                  ? 'bg-purple-500/20 text-purple-300 border border-purple-500/40 shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Clock size={13} />
              <span>Timeline View</span>
            </button>

            <button
              onClick={() => setActiveTab('preview')}
              className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg font-medium transition-all ${
                activeTab === 'preview'
                  ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <FileCode size={13} />
              <span>Generated Code Preview</span>
            </button>
          </div>

          {/* Format Selector Pills (shown when in preview tab) */}
          <div className="flex items-center space-x-3">
            <div className="flex items-center space-x-1 bg-white/[0.03] border border-white/[0.08] rounded-xl p-1">
              <button
                onClick={() => setFormat('markdown')}
                className={`px-2.5 py-1 rounded-lg font-mono text-[11px] transition-all ${
                  format === 'markdown'
                    ? 'bg-white/[0.1] text-white font-semibold'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Markdown (.md)
              </button>
              <button
                onClick={() => setFormat('html')}
                className={`px-2.5 py-1 rounded-lg font-mono text-[11px] transition-all ${
                  format === 'html'
                    ? 'bg-white/[0.1] text-white font-semibold'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                HTML (.html)
              </button>
              <button
                onClick={() => setFormat('json')}
                className={`px-2.5 py-1 rounded-lg font-mono text-[11px] transition-all ${
                  format === 'json'
                    ? 'bg-white/[0.1] text-white font-semibold'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                JSON (.json)
              </button>
            </div>

            {/* Options Checkboxes */}
            <label className="flex items-center space-x-1.5 text-slate-300 cursor-pointer select-none text-[11px]">
              <input
                type="checkbox"
                checked={includeDiff}
                onChange={(e) => setIncludeDiff(e.target.checked)}
                className="rounded border-white/[0.2] bg-white/[0.05] text-cyan-500 focus:ring-0"
              />
              <span>Include Diff</span>
            </label>
          </div>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4 max-h-[58vh]">
          {activeTab === 'timeline' ? (
            <div className="space-y-3">
              {reportData.commands.length === 0 ? (
                <div className="text-center py-12 text-slate-500 text-xs">
                  No terminal commands recorded yet in this workspace session.
                </div>
              ) : (
                reportData.commands.map((cmd, idx) => {
                  const isSuccess = cmd.exitCode === 0;
                  const outputSnippet = `${cmd.stdout}\n${cmd.stderr}`.trim();
                  return (
                    <div
                      key={cmd.id || idx}
                      className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-3 hover:border-white/[0.14] transition-all"
                    >
                      <div className="flex items-center justify-between text-xs">
                        <div className="flex items-center space-x-2.5">
                          {isSuccess ? (
                            <CheckCircle2 size={15} className="text-emerald-400 flex-shrink-0" />
                          ) : (
                            <AlertCircle size={15} className="text-rose-400 flex-shrink-0" />
                          )}
                          <code className="font-mono text-xs text-white font-medium">
                            $ {cmd.command}
                          </code>
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-mono font-semibold ${
                              isSuccess
                                ? 'bg-emerald-500/10 text-emerald-300 border border-emerald-500/25'
                                : 'bg-rose-500/10 text-rose-300 border border-rose-500/25'
                            }`}
                          >
                            {isSuccess ? 'EXIT 0' : `EXIT ${cmd.exitCode ?? 1}`}
                          </span>
                        </div>

                        <div className="flex items-center space-x-2 text-[11px] font-mono text-slate-400">
                          <span>{cmd.timestamp}</span>
                          {cmd.durationMs && <span>({cmd.durationMs}ms)</span>}
                        </div>
                      </div>

                      {outputSnippet && (
                        <div className="mt-2.5 pt-2 border-t border-white/[0.05] text-[11px] font-mono text-slate-400 bg-black/40 rounded-lg p-2.5 max-h-32 overflow-y-auto whitespace-pre-wrap select-text">
                          {outputSnippet}
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          ) : (
            <div className="relative h-full">
              <pre className="p-4 rounded-xl bg-black/60 border border-white/[0.08] font-mono text-xs text-slate-300 overflow-x-auto max-h-[50vh] whitespace-pre select-text">
                {generatedContent}
              </pre>
            </div>
          )}
        </div>

        {/* Modal Footer / Action Bar */}
        <div className="px-6 py-3.5 bg-white/[0.02] border-t border-white/[0.08] flex items-center justify-between">
          <div className="flex items-center space-x-2 text-xs text-slate-400 font-mono">
            {saveStatus && (
              <span className="text-emerald-400 flex items-center space-x-1 animate-in fade-in">
                <Check size={13} />
                <span>{saveStatus}</span>
              </span>
            )}
          </div>

          <div className="flex items-center space-x-2.5">
            <button
              onClick={handleCopy}
              className="flex items-center space-x-1.5 px-3.5 py-1.5 rounded-xl border border-white/[0.12] bg-white/[0.04] text-slate-200 hover:text-white hover:bg-white/[0.08] text-xs font-medium transition-all"
            >
              {copied ? <Check size={13} className="text-emerald-400" /> : <Copy size={13} />}
              <span>{copied ? 'Copied to Clipboard!' : 'Copy to Clipboard'}</span>
            </button>

            <button
              onClick={handleSaveToDisk}
              disabled={isSaving}
              className="flex items-center space-x-1.5 px-4 py-1.5 rounded-xl bg-gradient-to-r from-purple-600 to-cyan-600 hover:from-purple-500 hover:to-cyan-500 text-white text-xs font-semibold shadow-[0_0_15px_rgba(168,85,247,0.3)] transition-all hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50"
            >
              <FileDown size={13} />
              <span>{isSaving ? 'Saving...' : 'Save to File...'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
