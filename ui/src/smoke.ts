import { LANGUAGES, loadMessages } from './i18n/index.js';

/**
 * Used by the smoke test (`npm run smoke`): loads every part of the interface
 * that is only fetched on demand, and returns what failed to load.
 */
const LAZY_PARTS: Record<string, () => Promise<unknown>> = {
  SettingsView: () => import('./components/SettingsView.js'),
  TokenOptimizerHUD: () => import('./components/TokenOptimizerHUD.js'),
  SandboxDrawer: () => import('./components/SandboxDrawer.js'),
  AgentMeshModal: () => import('./components/AgentMeshModal.js'),
  OrchestraModal: () => import('./components/OrchestraModal.js'),
  LiveSquadModal: () => import('./components/LiveSquadModal.js'),
  SkillsModal: () => import('./components/SkillsModal.js'),
  GuideModal: () => import('./components/GuideModal.js'),
  ExportReportModal: () => import('./components/ExportReportModal.js'),
  RunHistoryModal: () => import('./components/RunHistoryModal.js'),
  PullRequestModal: () => import('./components/PullRequestModal.js'),
};

async function checkLazyParts(): Promise<string[]> {
  const errors: string[] = [];
  for (const [name, load] of Object.entries(LAZY_PARTS)) {
    try {
      await load();
    } catch (err) {
      errors.push(`${name}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  for (const { value } of LANGUAGES) {
    const messages = await loadMessages(value);
    if (value !== 'en' && messages === (await loadMessages('en'))) errors.push(`language ${value} fell back to English`);
  }
  return errors;
}

declare global {
  interface Window {
    __vulgrSmoke?: () => Promise<string[]>;
  }
}

window.__vulgrSmoke = checkLazyParts;
