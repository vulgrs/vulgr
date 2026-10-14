import React, { useRef, useState } from 'react';
import { GitCommitHorizontal, Sparkles, Upload } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button.js';
import { Spinner } from '@/components/ui/spinner.js';
import { useI18n } from '../i18n/index.js';

const IS_MAC = typeof navigator !== 'undefined' && /Mac/i.test(navigator.platform);

export interface CommitOutcome {
  committed: boolean;
  pushed: boolean;
}

/**
 * A commit message (subject, optional body), written by hand or by an AI agent
 * from the changes, then committed, or committed and pushed.
 */
export const CommitBox: React.FC<{
  cwd?: string;
  initialMessage?: string;
  /** Called after a commit went through (pushed or not). */
  onDone?: (outcome: CommitOutcome) => void;
  autoFocus?: boolean;
  compact?: boolean;
}> = ({ cwd, initialMessage = '', onDone, autoFocus, compact }) => {
  const { t } = useI18n();
  const c = t.commit;
  const [message, setMessage] = useState(initialMessage);
  const [writing, setWriting] = useState(false);
  const [busy, setBusy] = useState<'commit' | 'push' | null>(null);
  const [aiNote, setAiNote] = useState('');
  const areaRef = useRef<HTMLTextAreaElement>(null);

  const writeWithAi = async () => {
    setWriting(true);
    setAiNote('');
    try {
      const res = await window.warpApi?.suggestCommitMessage?.({ cwd });
      if (res?.message) {
        setMessage(res.message);
        setAiNote(c.aiWrote(res.agent ?? 'AI'));
        requestAnimationFrame(() => areaRef.current?.focus());
      } else if (res?.error === 'no-changes') toast.info(c.aiNoChanges);
      else if (res?.error === 'no-agent') toast.error(c.aiNoAgent);
      else toast.error(c.aiFailed(res?.detail ?? ''));
    } catch (err: any) {
      toast.error(c.aiFailed(err?.message ?? ''));
    } finally {
      setWriting(false);
    }
  };

  const commit = async (push: boolean) => {
    if (!message.trim() || busy) return;
    setBusy(push ? 'push' : 'commit');
    try {
      const res = await window.warpApi?.commitAndPush?.({ message: message.trim(), push, cwd });
      if (!res?.committed) {
        toast.error(c.commitFailed(res?.error ?? ''));
        return;
      }
      if (push && !res.pushed) toast.error(c.pushFailed(res.error ?? ''));
      else toast.success(push ? c.pushed : c.committed);
      setMessage('');
      setAiNote('');
      onDone?.({ committed: true, pushed: !!res.pushed });
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <textarea
        ref={areaRef}
        autoFocus={autoFocus}
        value={message}
        rows={compact ? 3 : 4}
        onChange={(e) => {
          setMessage(e.target.value);
          setAiNote('');
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            void commit(e.shiftKey);
          }
        }}
        placeholder={c.placeholder}
        aria-label={c.placeholder}
        disabled={writing}
        className="min-h-[52px] w-full resize-y rounded-[8px] border border-zinc-800 bg-base-app px-2.5 py-1.5 font-mono text-[12px] leading-relaxed text-zinc-100 outline-none placeholder:font-sans placeholder:text-zinc-600 focus:border-zinc-600 disabled:opacity-60"
      />
      {aiNote && <p className="text-[10.5px] text-zinc-500">{aiNote}</p>}
      <div className="flex flex-wrap items-center gap-1.5">
        <Button size="sm" variant="ghost" disabled={writing || !!busy} onClick={() => void writeWithAi()} title={c.aiHint}>
          {writing ? <Spinner data-icon="inline-start" /> : <Sparkles data-icon="inline-start" />}
          {writing ? c.aiWriting : c.aiWrite}
        </Button>
        {!compact && <span className="hidden text-[10px] text-zinc-600 sm:inline">{c.shortcut(IS_MAC ? '⌘↵' : 'Ctrl+Enter')}</span>}
        {/* Kept together, so in a narrow panel they wrap as one row on the right. */}
        <div className="ml-auto flex gap-1.5">
          <Button size="sm" variant="outline" disabled={!message.trim() || writing || !!busy} onClick={() => void commit(false)}>
            {busy === 'commit' ? <Spinner data-icon="inline-start" /> : <GitCommitHorizontal data-icon="inline-start" />}
            {c.commit}
          </Button>
          <Button size="sm" disabled={!message.trim() || writing || !!busy} onClick={() => void commit(true)}>
            {busy === 'push' ? <Spinner data-icon="inline-start" /> : <Upload data-icon="inline-start" />}
            {c.commitPush}
          </Button>
        </div>
      </div>
    </div>
  );
};
