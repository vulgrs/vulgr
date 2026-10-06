import { ns } from '../ns.js';

/** Status lines the duo-agent loop shows while it runs. */
export const squad = ns(
  {
    building: (agent: string) => `${agent} is writing the code...`,
    repairing: (agent: string, round: number, max: number) =>
      `${agent} is fixing based on the feedback (round ${round}/${max})...`,
    builderFailed: (agent: string) =>
      `${agent} stopped with an error. Check the output in the left pane (it must be installed and signed in).`,
    verifying: (cmd: string, round: number, max: number) => `Running "${cmd}" (round ${round}/${max})...`,
    reviewing: (agent: string) => `Tests passed. ${agent} is reviewing the changes...`,
    handingOff: (agent: string) => `Test failed. ${agent} is investigating the error...`,
    outOfRounds: (max: number) =>
      `Could not finish in ${max} rounds. See the final state in the right pane; type commands yourself to continue.`,
    doneTests: 'Done: tests passed.',
    reviewUnclear: (agent: string) =>
      `Tests passed. ${agent}'s review gave no clear verdict; review the changes yourself (see the right pane).`,
    doneApproved: (agent: string) => `Done: tests passed and ${agent} approved.`,
    unexpected: (message: string) => `Unexpected error: ${message}`,
  },
  {
    building: (agent: string) => `${agent} kodu yazıyor...`,
    repairing: (agent: string, round: number, max: number) =>
      `${agent} geri bildirime göre düzeltiyor (tur ${round}/${max})...`,
    builderFailed: (agent: string) =>
      `${agent} hata ile durdu. Sol paneldeki çıktıya bakın (kurulu ve giriş yapılmış olmalı).`,
    verifying: (cmd: string, round: number, max: number) => `"${cmd}" çalıştırılıyor (tur ${round}/${max})...`,
    reviewing: (agent: string) => `Testler geçti. ${agent} değişiklikleri inceliyor...`,
    handingOff: (agent: string) => `Test başarısız. ${agent} hatayı inceliyor...`,
    outOfRounds: (max: number) =>
      `${max} turda tamamlanamadı. Son durumu sağdaki panelde görebilir, devam etmek için kendiniz komut yazabilirsiniz.`,
    doneTests: 'Tamamlandı: testler geçti.',
    reviewUnclear: (agent: string) =>
      `Testler geçti. ${agent} incelemesi net bir sonuç vermedi; değişiklikleri kendiniz gözden geçirin (sağ panele bakın).`,
    doneApproved: (agent: string) => `Tamamlandı: testler geçti ve ${agent} onayladı.`,
    unexpected: (message: string) => `Beklenmeyen hata: ${message}`,
  }
);
