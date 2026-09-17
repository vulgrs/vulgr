import React, { useState } from 'react';
import {
  Sparkles,
  Shield,
  CheckCircle2,
  AlertTriangle,
  RotateCcw,
  Wrench,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  ShieldCheck,
  ShieldAlert,
} from 'lucide-react';
import type { AiOrchestratorBlock } from '../types/warp.js';
import { DiffViewer } from './DiffViewer.js';

interface AiBlockProps {
  block: AiOrchestratorBlock;
  onDecision: (runId: string, decision: 'APPROVE' | 'REQUEST_FIX' | 'DISCARD') => void;
}

export const AiBlock: React.FC<AiBlockProps> = ({ block, onDecision }) => {
  const [showStream, setShowStream] = useState(true);
  const [showErrorTrace, setShowErrorTrace] = useState(false);

  return (
    <div className="rounded-lg bg-warp-surface border border-warp-border shadow-lg overflow-hidden transition-all hover:border-warp-borderLight space-y-0">
      {/* Block Header */}
      <div className="px-3.5 py-2.5 bg-gradient-to-r from-warp-card via-warp-card to-warp-surface border-b border-warp-border flex items-center justify-between text-xs select-none">
        <div className="flex items-center space-x-2 min-w-0">
          <div className="w-5 h-5 rounded bg-purple-500/20 text-purple-400 border border-purple-500/30 flex items-center justify-center">
            <Sparkles size={12} />
          </div>
          <span className="font-semibold text-slate-200">AI Orchestration</span>
          <span className="px-2 py-0.5 rounded-full bg-purple-950/60 border border-purple-800 text-purple-300 font-mono text-[10px]">
            {block.primaryModel}
          </span>
          {block.dualEnabled && (
            <span className="px-2 py-0.5 rounded-full bg-cyan-950/60 border border-cyan-800 text-cyan-300 font-mono text-[10px] flex items-center space-x-1">
              <Shield size={10} />
              <span>Reviewer: {block.reviewerModel}</span>
            </span>
          )}
        </div>

        {/* Status Pill */}
        <div className="flex items-center space-x-2 font-mono text-[11px]">
          {block.status === 'GENERATING' && (
            <div className="flex items-center space-x-1.5 px-2 py-0.5 rounded bg-purple-950/60 text-purple-300 border border-purple-800 animate-pulse">
              <span className="w-1.5 h-1.5 rounded-full bg-purple-400" />
              <span>Generating Code...</span>
            </div>
          )}
          {block.status === 'CORRECTING' && (
            <div className="flex items-center space-x-1.5 px-2 py-0.5 rounded bg-amber-950/60 text-amber-300 border border-amber-800 animate-pulse">
              <Wrench size={11} />
              <span>Self-Correction Loop...</span>
            </div>
          )}
          {block.status === 'REVIEWING' && (
            <div className="flex items-center space-x-1.5 px-2 py-0.5 rounded bg-cyan-950/60 text-cyan-300 border border-cyan-800 animate-pulse">
              <Shield size={11} />
              <span>Adversarial Review...</span>
            </div>
          )}
          {block.status === 'COMPLETED' && (
            <div className="flex items-center space-x-1 px-2 py-0.5 rounded bg-emerald-950/60 text-emerald-300 border border-emerald-800">
              <CheckCircle2 size={12} />
              <span>Completed</span>
            </div>
          )}
          {block.status === 'DISCARDED' && (
            <div className="flex items-center space-x-1 px-2 py-0.5 rounded bg-red-950/60 text-red-300 border border-red-800">
              <RotateCcw size={12} />
              <span>Rolled Back</span>
            </div>
          )}
        </div>
      </div>

      {/* Prompt Card */}
      <div className="p-3 bg-warp-card/40 border-b border-warp-border/50 text-xs flex items-start space-x-2">
        <span className="text-purple-400 font-bold font-mono">Prompt:</span>
        <span className="text-slate-100 font-medium">{block.prompt}</span>
      </div>

      {/* Main Flow Canvas */}
      <div className="p-3 space-y-3 bg-warp-bg/95 text-xs">
        {/* Stage 1: Stream Output */}
        {block.streamText && (
          <div className="rounded border border-warp-border bg-warp-card/50 overflow-hidden">
            <button
              onClick={() => setShowStream(!showStream)}
              className="w-full px-3 py-1.5 bg-warp-card/80 border-b border-warp-border flex items-center justify-between text-[11px] text-slate-300 font-mono"
            >
              <div className="flex items-center space-x-1.5">
                {showStream ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                <span>Model Output Stream ({block.primaryModel})</span>
              </div>
              <span className="text-slate-500">{block.streamText.length} chars</span>
            </button>
            {showStream && (
              <div className="p-2.5 font-mono text-[11px] text-slate-300 whitespace-pre-wrap max-h-60 overflow-y-auto leading-relaxed select-text">
                {block.streamText}
              </div>
            )}
          </div>
        )}

        {/* Stage 2: Self-Correction Card */}
        {block.correctionStatus && (
          <div className="p-3 rounded-lg border border-amber-900/60 bg-gradient-to-r from-amber-950/30 to-warp-card space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <Wrench size={14} className="text-amber-400" />
                <span className="font-semibold text-amber-300">Self-Correction Engine</span>
              </div>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-amber-950 border border-amber-800 text-amber-300">
                Attempt {block.correctionStatus.attempt || 1}/{block.correctionStatus.maxRetries || 2}
              </span>
            </div>

            <p className="text-slate-300 text-[11px]">
              Local build/test verification encountered errors. Self-correction loop engaged to repair failures automatically.
            </p>

            {block.correctionStatus.error && (
              <div>
                <button
                  onClick={() => setShowErrorTrace(!showErrorTrace)}
                  className="flex items-center space-x-1 text-[11px] text-amber-400 hover:text-amber-300 underline font-mono"
                >
                  {showErrorTrace ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                  <span>View captured compiler error stack trace</span>
                </button>
                {showErrorTrace && (
                  <pre className="mt-1.5 p-2 bg-black/60 rounded border border-amber-900/40 font-mono text-[10px] text-red-300 max-h-40 overflow-y-auto whitespace-pre-wrap select-text">
                    {block.correctionStatus.error}
                  </pre>
                )}
              </div>
            )}

            {block.correctionStatus.status === 'PASSED' && (
              <div className="flex items-center space-x-1.5 text-emerald-400 text-xs font-medium pt-1">
                <CheckCircle2 size={13} />
                <span>Compiler and test checks verified successfully after patch!</span>
              </div>
            )}
          </div>
        )}

        {/* Stage 3: Adversarial Reviewer Card */}
        {block.reviewReport && (
          <div className="p-3.5 rounded-lg border border-cyan-900/60 bg-gradient-to-br from-cyan-950/20 via-warp-card to-warp-surface space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <ShieldCheck size={16} className="text-cyan-400" />
                <span className="font-semibold text-cyan-300 text-sm">
                  Adversarial Review ({block.reviewReport.reviewerName})
                </span>
              </div>
              <span
                className={`text-[10px] px-2 py-0.5 rounded font-semibold uppercase ${
                  block.reviewReport.passed
                    ? 'bg-emerald-950 text-emerald-400 border border-emerald-800'
                    : 'bg-red-950 text-red-400 border border-red-800'
                }`}
              >
                {block.reviewReport.passed ? 'VERDICT: PASS' : 'VERDICT: CRITICAL FOUND'}
              </span>
            </div>

            <p className="text-slate-300 text-xs leading-relaxed">{block.reviewReport.summary}</p>

            {/* Findings list */}
            {block.reviewReport.findings.length > 0 && (
              <div className="space-y-2 pt-1">
                <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                  Findings ({block.reviewReport.findings.length})
                </div>
                {block.reviewReport.findings.map((f, i) => (
                  <div
                    key={i}
                    className="p-2.5 rounded bg-black/40 border border-warp-border space-y-1 select-text"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-2">
                        <span
                          className={`text-[9px] font-bold px-1.5 py-0.2 rounded ${
                            f.severity === 'CRITICAL'
                              ? 'bg-red-600 text-white'
                              : f.severity === 'WARNING'
                              ? 'bg-amber-600 text-black'
                              : 'bg-cyan-700 text-white'
                          }`}
                        >
                          {f.severity}
                        </span>
                        <span className="font-medium text-slate-200">{f.title}</span>
                      </div>
                      {f.file && (
                        <span className="font-mono text-[10px] text-slate-400">
                          {f.file}
                          {f.line ? `:${f.line}` : ''}
                        </span>
                      )}
                    </div>
                    <p className="text-slate-300 text-[11px] leading-relaxed">{f.description}</p>
                    {f.recommendation && (
                      <p className="text-emerald-400 text-[11px]">
                        <span className="font-semibold">Remedy:</span> {f.recommendation}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Diff Viewer */}
            {block.reviewReport.diffAnalyzed && (
              <DiffViewer diff={block.reviewReport.diffAnalyzed} />
            )}

            {/* Decision Actions (if pending) */}
            {!block.userDecision && block.status === 'REVIEWING' && (
              <div className="pt-2 border-t border-warp-border flex items-center justify-end space-x-2.5">
                <button
                  onClick={() => onDecision(block.runId, 'DISCARD')}
                  className="flex items-center space-x-1 px-3 py-1.5 rounded bg-red-950/60 hover:bg-red-900 border border-red-800 text-red-200 text-xs font-medium transition-colors"
                >
                  <RotateCcw size={13} />
                  <span>Discard & Rollback</span>
                </button>

                <button
                  onClick={() => onDecision(block.runId, 'REQUEST_FIX')}
                  className="flex items-center space-x-1 px-3 py-1.5 rounded bg-amber-950/60 hover:bg-amber-900 border border-amber-800 text-amber-200 text-xs font-medium transition-colors"
                >
                  <Wrench size={13} />
                  <span>Request Model Fix</span>
                </button>

                <button
                  onClick={() => onDecision(block.runId, 'APPROVE')}
                  className="flex items-center space-x-1 px-3 py-1.5 rounded bg-emerald-700 hover:bg-emerald-600 text-white text-xs font-medium shadow-md transition-colors"
                >
                  <CheckCircle2 size={13} />
                  <span>Approve & Keep Changes</span>
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
