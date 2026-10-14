import React, { useEffect, useState } from 'react';
import { ExternalLink, GitPullRequest, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button.js';
import { Dialog, DialogContent } from '@/components/ui/dialog.js';
import { Spinner } from '@/components/ui/spinner.js';
import appLogo from '../assets/logo-mark.png';
import { FLOW_DIALOG, FlowHeader, FlowInput, MONO, SectionLabel, accentStyle, closeOnlyOnRequest } from './FlowParts.js';
import { useI18n } from '../i18n/index.js';

interface PrInfo {
  branch: string | null;
  base: string | null;
  github: { owner: string; repo: string } | null;
  commits: number;
  ghReady: boolean;
}

/**
 * Opens a pull request for the current branch: title and description by hand
 * or written by an AI agent from the branch's commits and diff, then created
 * with gh, or on GitHub's pre-filled page in the browser.
 */
export const PullRequestModal: React.FC<{ isOpen: boolean; onClose: () => void; cwd?: string }> = ({ isOpen, onClose, cwd }) => {
  const { t } = useI18n();
  const p = t.pr;
  const c = t.commit;
  const [info, setInfo] = useState<PrInfo | null>(null);
  const [base, setBase] = useState('');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [writing, setWriting] = useState(false);
  const [creating, setCreating] = useState(false);
  const [aiNote, setAiNote] = useState('');
  const [prUrl, setPrUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setInfo(null);
    setPrUrl(null);
    window.warpApi
      ?.pullRequestInfo?.(cwd)
      .then((i: PrInfo) => {
        setInfo(i);
        setBase((b) => b || i.base || 'main');
      })
      .catch(() => setInfo({ branch: null, base: null, github: null, commits: 0, ghReady: false }));
  }, [isOpen, cwd]);

  const problem = !info
    ? null
    : !info.github && !info.ghReady
      ? p.notGitHub
      : !info.branch || info.branch === base
        ? p.onBase(base)
        : info.commits === 0 && info.base === base
          ? p.noCommits(base)
          : null;

  const write = async () => {
    setWriting(true);
    setAiNote('');
    try {
      const res = await window.warpApi?.suggestPullRequest?.({ base, cwd });
      if (res?.title) {
        setTitle(res.title);
        setBody(res.body ?? '');
        setAiNote(c.aiWrote(res.agent ?? 'AI'));
      } else if (res?.error === 'no-changes') toast.info(p.noCommits(base));
      else if (res?.error === 'no-agent') toast.error(c.aiNoAgent);
      else toast.error(c.aiFailed(res?.detail ?? ''));
    } finally {
      setWriting(false);
    }
  };

  const create = async () => {
    setCreating(true);
    try {
      const res = await window.warpApi?.createPullRequest?.({ base, title: title.trim(), body, cwd });
      if (!res?.url) {
        toast.error(p.failed(res?.error ?? ''));
        return;
      }
      if (res.viaBrowser) {
        toast.success(p.openedBrowser);
        onClose();
      } else {
        toast.success(p.created);
        setPrUrl(res.url);
      }
    } finally {
      setCreating(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={closeOnlyOnRequest(onClose)}>
      <DialogContent className={`${FLOW_DIALOG} sm:max-w-[620px]`} style={accentStyle('#a1a1aa')}>
        <FlowHeader icon={appLogo} title={p.title} subtitle={info?.branch && base ? `${info.branch} → ${base}` : ' '} />
        <div className="min-h-0 space-y-4 overflow-y-auto px-5 py-4">
          {!info ? (
            <div className="flex justify-center py-8">
              <Spinner />
            </div>
          ) : prUrl ? (
            <div className="flex items-center gap-3 rounded-[11px] border border-emerald-500/30 bg-emerald-500/[0.06] px-3.5 py-3">
              <GitPullRequest size={16} className="text-emerald-400" />
              <p className="min-w-0 flex-1 truncate text-[12.5px] text-zinc-100">{prUrl}</p>
              <Button size="sm" variant="outline" onClick={() => window.open(prUrl, '_blank')}>
                <ExternalLink data-icon="inline-start" />
                {p.openLink}
              </Button>
            </div>
          ) : (
            <>
              <div>
                <SectionLabel htmlFor="pr-base">{p.base}</SectionLabel>
                <FlowInput id="pr-base" value={base} onChange={(e) => setBase(e.target.value.trim())} className={`max-w-56 ${MONO}`} />
              </div>
              {problem && <p className="rounded-[10px] border border-amber-500/30 bg-amber-500/[0.06] px-3 py-2 text-[12px] text-amber-200 [.light_&]:text-amber-800">{problem}</p>}
              <div>
                <SectionLabel htmlFor="pr-title">{p.titleLabel}</SectionLabel>
                <FlowInput id="pr-title" value={title} onChange={(e) => setTitle(e.target.value)} disabled={writing} />
              </div>
              <div>
                <SectionLabel htmlFor="pr-body">{p.bodyLabel}</SectionLabel>
                <textarea
                  id="pr-body"
                  value={body}
                  rows={10}
                  onChange={(e) => setBody(e.target.value)}
                  disabled={writing}
                  className="w-full resize-y rounded-[10px] border border-zinc-800 bg-base-app px-3 py-2 font-mono text-[12px] leading-relaxed text-zinc-100 outline-none focus:border-zinc-600 disabled:opacity-60"
                />
                {aiNote && <p className="mt-1 text-[10.5px] text-zinc-500">{aiNote}</p>}
              </div>
              <p className="text-[11px] text-zinc-500">{info.ghReady ? p.viaGh : p.viaBrowser}</p>
            </>
          )}
        </div>
        {!prUrl && info && (
          <div className="flex items-center gap-2 border-t border-zinc-900 px-5 py-3">
            <Button size="sm" variant="ghost" disabled={writing || creating || !!problem} onClick={() => void write()}>
              {writing ? <Spinner data-icon="inline-start" /> : <Sparkles data-icon="inline-start" />}
              {writing ? c.aiWriting : p.aiWrite}
            </Button>
            <Button size="sm" className="ml-auto" disabled={!title.trim() || writing || creating || !!problem} onClick={() => void create()}>
              {creating ? <Spinner data-icon="inline-start" /> : <GitPullRequest data-icon="inline-start" />}
              {p.create}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};
