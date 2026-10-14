import { ns } from '../ns.js';

/** The status bar's branch menu. */
export const branches = ns(
  {
    hint: 'Switch branch',
    search: 'Find or create a branch',
    create: (name: string) => `Create branch “${name}”`,
    switched: (name: string) => `Switched to ${name}`,
    created: (name: string) => `Created ${name} and switched to it`,
    failed: (error: string) => `Could not switch: ${error}`,
    empty: 'No other branches',
  },
  {
    hint: 'Dal değiştir',
    search: 'Dal bul veya oluştur',
    create: (name: string) => `“${name}” dalını oluştur`,
    switched: (name: string) => `${name} dalına geçildi`,
    created: (name: string) => `${name} oluşturuldu ve ona geçildi`,
    failed: (error: string) => `Dal değiştirilemedi: ${error}`,
    empty: 'Başka dal yok',
  }
);
