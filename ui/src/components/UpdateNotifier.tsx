import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { useI18n } from '@/i18n/index.js';

type UpdateNotice = { kind: 'available'; version: string; url: string } | { kind: 'downloaded'; version: string };

const TOAST_ID = 'app-update';

/** Shows a lasting toast when the main process finds (macOS) or has downloaded (Windows, Linux) a new version. */
export function UpdateNotifier() {
  const { t } = useI18n();
  const [notice, setNotice] = useState<UpdateNotice | null>(null);

  useEffect(() => {
    const api = window.warpApi;
    if (!api?.onUpdateNotice) return;
    api.getUpdateNotice().then((n: UpdateNotice | null) => n && setNotice(n));
    return api.onUpdateNotice(setNotice);
  }, []);

  useEffect(() => {
    if (!notice) return;
    const m = t.update;
    if (notice.kind === 'available') {
      toast.info(m.available(notice.version), {
        id: TOAST_ID,
        description: m.availableDescription,
        duration: Infinity,
        action: { label: m.download, onClick: () => window.warpApi.openUpdateRelease() },
      });
    } else {
      toast.success(m.downloaded(notice.version), {
        id: TOAST_ID,
        description: m.downloadedDescription,
        duration: Infinity,
        action: { label: m.restart, onClick: () => window.warpApi.installUpdate() },
      });
    }
  }, [notice, t]);

  return null;
}
