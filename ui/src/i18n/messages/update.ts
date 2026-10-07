import { ns } from '../ns.js';

/** App update notifications. */
export const update = ns(
  {
    available: (version: string) => `Vulgr ${version} is available`,
    availableDescription: 'Download the new version from the Releases page.',
    download: 'Download',
    downloaded: (version: string) => `Vulgr ${version} is ready to install`,
    downloadedDescription: 'Restart Vulgr to finish the update.',
    restart: 'Restart and update',
  },
  {
    available: (version: string) => `Vulgr ${version} çıktı`,
    availableDescription: 'Yeni sürümü Releases sayfasından indirin.',
    download: 'İndir',
    downloaded: (version: string) => `Vulgr ${version} kurulmaya hazır`,
    downloadedDescription: 'Güncellemeyi tamamlamak için Vulgr’ı yeniden başlatın.',
    restart: 'Yeniden başlat ve güncelle',
  }
);
