import React, { useEffect, useState } from 'react';
import { ArrowUpCircle, Loader2 } from 'lucide-react';
import { useI18n } from '../i18n/index.js';

/** Same shape as UpdateStatus in electron/updater.ts. */
interface UpdateStatus {
  state: 'idle' | 'checking' | 'up-to-date' | 'available' | 'downloading' | 'downloaded' | 'error' | 'unsupported';
  version?: string;
  percent?: number;
}

/**
 * "Update Vulgr" in the top bar, like Warp's: shown once a new version is
 * downloading or ready. When ready, a click restarts into it; a copy that
 * can't update itself opens the release page instead.
 */
export const UpdateButton: React.FC = () => {
  const { t } = useI18n();
  const u = t.update;
  const [status, setStatus] = useState<UpdateStatus | null>(null);

  useEffect(() => {
    const api = window.warpApi;
    if (!api?.getUpdateStatus) return;
    api.getUpdateStatus().then(setStatus).catch(() => {});
    return api.onUpdateStatus?.(setStatus);
  }, []);

  if (!status || !['available', 'downloading', 'downloaded'].includes(status.state)) return null;
  const version = status.version ?? '';

  if (status.state === 'downloading') {
    return (
      <span
        className="mr-1 flex items-center gap-1.5 rounded-full border border-zinc-800 px-2.5 py-0.5 text-[11px] text-zinc-400"
        title={u.topDownloadingHint(version)}
      >
        <Loader2 size={11} className="animate-spin" />
        <span className="tabular-nums">{u.topUpdating(status.percent ?? 0)}</span>
      </span>
    );
  }

  const ready = status.state === 'downloaded';
  return (
    <button
      type="button"
      onClick={() => void (ready ? window.warpApi.installUpdate() : window.warpApi.openUpdateRelease())}
      title={ready ? u.topReadyHint(version) : u.topManualHint(version)}
      className="mr-1 flex items-center gap-1.5 rounded-full bg-zinc-100 px-2.5 py-0.5 text-[11px] font-medium text-zinc-950 transition-colors hover:bg-white [.light_&]:bg-zinc-900 [.light_&]:text-zinc-50"
    >
      <ArrowUpCircle size={12} />
      {u.topButton}
    </button>
  );
};
