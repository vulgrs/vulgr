import { ns } from '../ns.js';

/** System notifications shown while Vulgr is in the background. */
export const notify = ns(
  {
    runDone: (kind: string) => `${kind} finished`,
    runFailed: (kind: string) => `${kind} failed`,
    runStopped: (kind: string) => `${kind} stopped`,
    awaitingReview: 'Orchestrator is ready for your review',
    commandDone: 'Command finished',
    commandFailed: (code: number) => `Command failed (exit code ${code})`,
  },
  {
    runDone: (kind: string) => `${kind} bitti`,
    runFailed: (kind: string) => `${kind} başarısız oldu`,
    runStopped: (kind: string) => `${kind} durduruldu`,
    awaitingReview: 'Orchestrator incelemen için hazır',
    commandDone: 'Komut bitti',
    commandFailed: (code: number) => `Komut başarısız (çıkış kodu ${code})`,
  }
);
