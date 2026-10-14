import React, { useEffect, useState } from 'react';
import { Gift } from 'lucide-react';
import { useI18n } from '../i18n/index.js';

/** Same shape as UpdateStatus in electron/updater.ts. */
interface UpdateStatus {
  state: 'idle' | 'checking' | 'up-to-date' | 'available' | 'downloading' | 'downloaded' | 'error' | 'unsupported';
  version?: string;
  percent?: number;
}

/**
 * A gift icon next to the profile card (bottom left, like Cursor) once a new
 * version is on its way. A dot marks it ready; a click opens a small card to
 * restart into it, or, for a copy that can't update itself, to download it.
 */
export const UpdateButton: React.FC = () => {
  const { t } = useI18n();
  const u = t.update;
  const [status, setStatus] = useState<UpdateStatus | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const api = window.warpApi;
    if (!api?.getUpdateStatus) return;
    api.getUpdateStatus().then(setStatus).catch(() => {});
    return api.onUpdateStatus?.(setStatus);
  }, []);

  // Clicking anywhere else closes the card.
  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    window.addEventListener('click', close);
    return () => window.removeEventListener('click', close);
  }, [open]);

  if (!status || !['available', 'downloading', 'downloaded'].includes(status.state)) return null;
  const version = status.version ?? '';
  const ready = status.state === 'downloaded';
  const downloading = status.state === 'downloading';
  const percent = status.percent ?? 0;

  return (
    <>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        className={`relative p-1 mr-0.5 rounded-[5px] transition-colors flex-shrink-0 hover:bg-white/5 ${
          ready ? 'text-zinc-100' : 'text-zinc-500 hover:text-zinc-100'
        }`}
        title={ready ? u.topReadyHint(version) : downloading ? u.topDownloadingHint(version) : u.topManualHint(version)}
        aria-label={u.topButton}
        aria-expanded={open}
      >
        <Gift size={11} className={ready ? 'animate-[pulse_2.4s_ease-in-out_infinite]' : ''} />
        {!downloading && <span className="absolute right-0.5 top-0.5 size-[5px] rounded-full bg-zinc-100 ring-2 ring-base-elevated" />}
      </button>

      {open && (
        <div
          onClick={(e) => e.stopPropagation()}
          className="absolute bottom-full left-0 right-0 z-30 mb-1.5 rounded-[12px] border border-zinc-800 bg-base-elevated p-2.5 shadow-[var(--shadow-modal)]"
        >
          <div className="flex items-center gap-2">
            <span className="flex size-5 flex-shrink-0 items-center justify-center rounded-[6px] border border-zinc-700 bg-base-app text-zinc-200">
              <Gift size={10} />
            </span>
            <p className="min-w-0 text-[10px] leading-snug text-zinc-100">{u.giftTitle(version)}</p>
          </div>
          <p className="mt-1.5 text-[9px] leading-relaxed text-zinc-500">
            {ready ? u.giftReady : downloading ? u.giftDownloading(percent) : u.giftManual}
          </p>
          {downloading && (
            <div className="mt-2 h-1 overflow-hidden rounded-full bg-zinc-800">
              <div className="h-full bg-zinc-200 transition-[width]" style={{ width: `${percent}%` }} />
            </div>
          )}
          <div className="mt-2 flex items-center justify-end gap-1">
            <button type="button" onClick={() => setOpen(false)} className="whitespace-nowrap rounded-[6px] px-1.5 py-0.5 text-[9px] text-zinc-500 hover:bg-white/5 hover:text-zinc-200">
              {u.later}
            </button>
            {!downloading && (
              <button
                type="button"
                onClick={() => void (ready ? window.warpApi.installUpdate() : window.warpApi.openUpdateRelease())}
                className="whitespace-nowrap rounded-[6px] bg-zinc-100 px-2 py-0.5 text-[9px] text-zinc-950 hover:bg-white [.light_&]:bg-zinc-900 [.light_&]:text-zinc-50"
              >
                {ready ? u.restart : u.download}
              </button>
            )}
          </div>
        </div>
      )}
    </>
  );
};
