import React, { useEffect, useState } from 'react';
import { Download, ExternalLink, RefreshCw, RotateCw } from 'lucide-react';
import { Button } from '@/components/ui/button.js';
import { Spinner } from '@/components/ui/spinner.js';
import { useI18n } from '../i18n/index.js';

/** Same shape as UpdateStatus in electron/updater.ts. */
interface UpdateStatus {
  state: 'idle' | 'checking' | 'up-to-date' | 'available' | 'downloading' | 'downloaded' | 'error' | 'unsupported';
  currentVersion: string;
  version?: string;
  percent?: number;
  error?: string;
  checkedAt?: number;
}

/** Settings > General > Updates: the running version, where updating stands, and a manual check. */
export const UpdateSettings: React.FC = () => {
  const { t, lang } = useI18n();
  const u = t.update;
  const [status, setStatus] = useState<UpdateStatus | null>(null);

  useEffect(() => {
    const api = window.warpApi;
    if (!api?.getUpdateStatus) return;
    api.getUpdateStatus().then(setStatus).catch(() => {});
    return api.onUpdateStatus?.(setStatus);
  }, []);

  if (!status) return null;

  const line =
    status.state === 'checking'
      ? u.checking
      : status.state === 'up-to-date'
        ? u.upToDate
        : status.state === 'available'
          ? u.availableShort(status.version ?? '')
          : status.state === 'downloading'
            ? u.downloading(status.percent ?? 0)
            : status.state === 'downloaded'
              ? u.readyShort(status.version ?? '')
              : status.state === 'error'
                ? u.checkFailed(status.error ?? '')
                : status.state === 'unsupported'
                  ? u.unsupported
                  : '';
  const checked = status.checkedAt
    ? u.lastChecked(new Date(status.checkedAt).toLocaleTimeString(lang, { hour: '2-digit', minute: '2-digit' }))
    : '';

  return (
    <div className="flex flex-col gap-2">
      <p className="text-[12.5px] text-zinc-200">{u.current(status.currentVersion)}</p>
      {line && <p className={`text-[11.5px] ${status.state === 'error' ? 'text-red-300' : 'text-zinc-400'}`}>{line}</p>}
      {status.state === 'downloading' && (
        <div className="h-1 w-full overflow-hidden rounded-full bg-zinc-800">
          <div className="h-full bg-[color:var(--primary)] transition-[width]" style={{ width: `${status.percent ?? 0}%` }} />
        </div>
      )}
      {checked && status.state !== 'checking' && <p className="text-[10.5px] text-zinc-600">{checked}</p>}
      <div className="flex flex-wrap gap-2 pt-1">
        {status.state === 'downloaded' ? (
          <Button size="sm" onClick={() => void window.warpApi.installUpdate()}>
            <RotateCw data-icon="inline-start" />
            {u.restart}
          </Button>
        ) : status.state === 'available' ? (
          <Button size="sm" onClick={() => void window.warpApi.openUpdateRelease()}>
            <Download data-icon="inline-start" />
            {u.download}
          </Button>
        ) : status.state !== 'unsupported' ? (
          <Button
            size="sm"
            variant="outline"
            disabled={status.state === 'checking' || status.state === 'downloading'}
            onClick={() => void window.warpApi.checkForUpdates().then(setStatus).catch(() => {})}
          >
            {status.state === 'checking' ? <Spinner data-icon="inline-start" /> : <RefreshCw data-icon="inline-start" />}
            {u.check}
          </Button>
        ) : null}
        <Button size="sm" variant="ghost" onClick={() => void window.warpApi.openUpdateRelease()}>
          <ExternalLink data-icon="inline-start" />
          {u.releases}
        </Button>
      </div>
    </div>
  );
};
