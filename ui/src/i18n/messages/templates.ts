import { ns } from '../ns.js';

export const templates = ns(
  {
    label: 'Templates',
    save: 'Save as template',
    saveHint: 'Keep this goal and team setup to start it again in one click',
    namePlaceholder: 'Template name',
    confirm: 'Save',
    cancel: 'Cancel',
    saved: (name: string) => `Template “${name}” saved`,
    deleted: 'Template deleted',
    remove: (name: string) => `Delete “${name}”`,
    applyHint: (goal: string) => `Fill in: ${goal}`,
  },
  {
    label: 'Şablonlar',
    save: 'Şablon olarak kaydet',
    saveHint: 'Bu hedefi ve ekip kurulumunu tek tıkla tekrar başlatmak için sakla',
    namePlaceholder: 'Şablon adı',
    confirm: 'Kaydet',
    cancel: 'Vazgeç',
    saved: (name: string) => `“${name}” şablonu kaydedildi`,
    deleted: 'Şablon silindi',
    remove: (name: string) => `“${name}” şablonunu sil`,
    applyHint: (goal: string) => `Doldurulacak: ${goal}`,
  }
);
