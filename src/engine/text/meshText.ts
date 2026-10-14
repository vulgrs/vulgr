import type { EngineLang } from '../engineLang.js';

/** UI-facing texts of Agent Swarm (status lines, message summaries, errors). Agent prompts stay in English. */
const en = {
  timedOut: 'timed out',
  exitCode: (code: number | null) => `exit code ${code}`,
  checking: 'Checking that the selected agents are installed...',
  missingAgents: (names: string) =>
    `Agent not installed: ${names}. Choose an agent installed on this computer or install that tool first.`,
  taskGiven: (agent: string, goal: string) => `Task given to ${agent}: "${goal}"`,
  planningTests: (agent: string) => `${agent} is writing tests for the goal...`,
  testsWritten: (agent: string, files: number, cmd: string) =>
    `${agent} wrote tests for the goal (${files} file${files === 1 ? '' : 's'}). They run with "${cmd}".`,
  testsNotWritten: (agent: string, cmd: string) => `${agent} wrote no new tests; the project's "${cmd}" will be used.`,
  noTestCommand: (agent: string) =>
    `${agent} wrote no tests and this project has no test command. Enter a test command and start again.`,
  building: (agent: string) => `${agent} is writing the code...`,
  buildFailed: (agent: string, tail: string) => `${agent} could not complete the task: ${tail}`,
  codeWritten: (agent: string, files: number) => `${agent} wrote the code (${files} files changed).`,
  stoppedWithChanges: (agent: string, reason: string) =>
    `${agent} stopped early (${reason}) but changed files; the tests decide whether the work is done.`,
  verifying: (cmd: string, round: number, max: number) => `Running "${cmd}" (round ${round}/${max})...`,
  verifyPassed: (cmd: string, round: number) => `"${cmd}" passed (round ${round}).`,
  diagnosing: (agent: string) => `${agent} is investigating the error...`,
  verifyFailed: (cmd: string, code: number | null) => `"${cmd}" failed (exit code ${code}).`,
  repairing: (agent: string, round: number, max: number) => `${agent} is fixing the error (round ${round}/${max})...`,
  repairFailed: (agent: string, tail: string) => `${agent} could not apply a fix: ${tail}`,
  patchApplied: (agent: string) => `${agent} applied the fix, testing again.`,
  outOfRounds: (max: number) =>
    `Tests did not pass in ${max} rounds. The last error is above; the changes are still in place, review them in the "Changes" panel.`,
  auditing: (agent: string) => `${agent} is auditing the final changes...`,
  auditNoVerdict: 'gave no clear verdict',
  auditCouldNotRun: (tail: string) => `could not run: ${tail}`,
  auditRejected: (agent: string) => `${agent} found problems in the changes.`,
  auditSkipped: (agent: string, reason: string) =>
    `Tests passed. ${agent}'s audit ${reason}; review the changes yourself.`,
  auditApproved: (agent: string) => `Tests passed and ${agent} approved the changes.`,
  doneRejected: 'Tests passed, but the auditor found problems.',
  done: 'Done: tests passed.',
  paused: 'Paused.',
  resumed: 'Resumed.',
  stopped: 'Stopped.',
};

export type MeshText = typeof en;

const tr: MeshText = {
  timedOut: 'zaman aşımı',
  exitCode: (code: number | null) => `çıkış kodu ${code}`,
  checking: 'Seçilen ajanların kurulu olduğu kontrol ediliyor...',
  missingAgents: (names: string) =>
    `Kurulu olmayan ajan: ${names}. Bu bilgisayarda kurulu bir ajan seçin ya da önce o aracı kurun.`,
  taskGiven: (agent: string, goal: string) => `${agent} görevi aldı: "${goal}"`,
  planningTests: (agent: string) => `${agent} hedefe göre testleri yazıyor...`,
  testsWritten: (agent: string, files: number, cmd: string) =>
    `${agent} hedefe göre testleri yazdı (${files} dosya). "${cmd}" ile çalışacak.`,
  testsNotWritten: (agent: string, cmd: string) => `${agent} yeni test yazmadı; projenin "${cmd}" komutu kullanılacak.`,
  noTestCommand: (agent: string) =>
    `${agent} test yazamadı ve bu projede bir test komutu yok. Bir test komutu girip tekrar başlatın.`,
  building: (agent: string) => `${agent} kodu yazıyor...`,
  buildFailed: (agent: string, tail: string) => `${agent} görevi tamamlayamadı: ${tail}`,
  codeWritten: (agent: string, files: number) => `${agent} kodu yazdı (${files} dosya değişti).`,
  stoppedWithChanges: (agent: string, reason: string) =>
    `${agent} yarıda kaldı (${reason}) ama dosyaları değiştirdi; işin bitip bitmediğine testler karar verecek.`,
  verifying: (cmd: string, round: number, max: number) => `"${cmd}" çalıştırılıyor (tur ${round}/${max})...`,
  verifyPassed: (cmd: string, round: number) => `"${cmd}" başarılı (tur ${round}).`,
  diagnosing: (agent: string) => `${agent} hatayı inceliyor...`,
  verifyFailed: (cmd: string, code: number | null) => `"${cmd}" başarısız (çıkış kodu ${code}).`,
  repairing: (agent: string, round: number, max: number) => `${agent} hatayı düzeltiyor (tur ${round}/${max})...`,
  repairFailed: (agent: string, tail: string) => `${agent} düzeltme yapamadı: ${tail}`,
  patchApplied: (agent: string) => `${agent} düzeltmeyi uyguladı, tekrar test ediliyor.`,
  outOfRounds: (max: number) =>
    `${max} turda testler geçmedi. Son hata yukarıda; değişiklikler yerinde duruyor, "Değişiklikler" panelinden inceleyebilirsiniz.`,
  auditing: (agent: string) => `${agent} son değişiklikleri denetliyor...`,
  auditNoVerdict: 'net bir karar vermedi',
  auditCouldNotRun: (tail: string) => `çalışamadı: ${tail}`,
  auditRejected: (agent: string) => `${agent} değişikliklerde sorun buldu.`,
  auditSkipped: (agent: string, reason: string) =>
    `Testler geçti. ${agent} denetimi ${reason}; değişiklikleri kendiniz gözden geçirin.`,
  auditApproved: (agent: string) => `Testler geçti ve ${agent} değişiklikleri onayladı.`,
  doneRejected: 'Testler geçti, ancak denetçi sorun buldu.',
  done: 'Tamamlandı: testler geçti.',
  paused: 'Duraklatıldı.',
  resumed: 'Devam ediliyor.',
  stopped: 'Durduruldu.',
};

const de: MeshText = {
  timedOut: 'Zeitüberschreitung',
  exitCode: (code: number | null) => `Exit-Code ${code}`,
  checking: 'Prüfe, ob die gewählten Agenten installiert sind...',
  missingAgents: (names: string) =>
    `Agent nicht installiert: ${names}. Wähle einen Agenten, der auf diesem Computer installiert ist, oder installiere das Tool zuerst.`,
  taskGiven: (agent: string, goal: string) => `Aufgabe an ${agent}: "${goal}"`,
  planningTests: (agent: string) => `${agent} schreibt Tests für das Ziel...`,
  testsWritten: (agent: string, files: number, cmd: string) =>
    `${agent} hat Tests für das Ziel geschrieben (${files} Datei${files === 1 ? '' : 'en'}). Sie laufen mit "${cmd}".`,
  testsNotWritten: (agent: string, cmd: string) => `${agent} hat keine neuen Tests geschrieben; "${cmd}" des Projekts wird verwendet.`,
  noTestCommand: (agent: string) =>
    `${agent} hat keine Tests geschrieben und dieses Projekt hat keinen Testbefehl. Gib einen Testbefehl ein und starte erneut.`,
  building: (agent: string) => `${agent} schreibt den Code...`,
  buildFailed: (agent: string, tail: string) => `${agent} konnte die Aufgabe nicht abschließen: ${tail}`,
  codeWritten: (agent: string, files: number) => `${agent} hat den Code geschrieben (${files} Dateien geändert).`,
  stoppedWithChanges: (agent: string, reason: string) =>
    `${agent} hat früh aufgehört (${reason}), aber Dateien geändert; die Tests entscheiden, ob die Arbeit fertig ist.`,
  verifying: (cmd: string, round: number, max: number) => `"${cmd}" läuft (Runde ${round}/${max})...`,
  verifyPassed: (cmd: string, round: number) => `"${cmd}" bestanden (Runde ${round}).`,
  diagnosing: (agent: string) => `${agent} untersucht den Fehler...`,
  verifyFailed: (cmd: string, code: number | null) => `"${cmd}" fehlgeschlagen (Exit-Code ${code}).`,
  repairing: (agent: string, round: number, max: number) => `${agent} behebt den Fehler (Runde ${round}/${max})...`,
  repairFailed: (agent: string, tail: string) => `${agent} konnte keine Korrektur anwenden: ${tail}`,
  patchApplied: (agent: string) => `${agent} hat die Korrektur angewendet, es wird erneut getestet.`,
  outOfRounds: (max: number) =>
    `Die Tests sind in ${max} Runden nicht bestanden. Der letzte Fehler steht oben; die Änderungen sind noch da, prüfe sie im Bereich „Änderungen“.`,
  auditing: (agent: string) => `${agent} prüft die endgültigen Änderungen...`,
  auditNoVerdict: 'hat kein klares Urteil abgegeben',
  auditCouldNotRun: (tail: string) => `konnte nicht laufen: ${tail}`,
  auditRejected: (agent: string) => `${agent} hat Probleme in den Änderungen gefunden.`,
  auditSkipped: (agent: string, reason: string) =>
    `Tests bestanden. Die Prüfung von ${agent} ${reason}; sieh dir die Änderungen selbst an.`,
  auditApproved: (agent: string) => `Tests bestanden und ${agent} hat die Änderungen freigegeben.`,
  doneRejected: 'Tests bestanden, aber der Prüfer hat Probleme gefunden.',
  done: 'Fertig: Tests bestanden.',
  paused: 'Pausiert.',
  resumed: 'Fortgesetzt.',
  stopped: 'Gestoppt.',
};

const es: MeshText = {
  timedOut: 'tiempo agotado',
  exitCode: (code: number | null) => `código de salida ${code}`,
  checking: 'Comprobando que los agentes elegidos estén instalados...',
  missingAgents: (names: string) =>
    `Agente no instalado: ${names}. Elige un agente instalado en este equipo o instala esa herramienta primero.`,
  taskGiven: (agent: string, goal: string) => `Tarea para ${agent}: "${goal}"`,
  planningTests: (agent: string) => `${agent} está escribiendo pruebas para el objetivo...`,
  testsWritten: (agent: string, files: number, cmd: string) =>
    `${agent} escribió pruebas para el objetivo (${files} archivo${files === 1 ? '' : 's'}). Se ejecutan con "${cmd}".`,
  testsNotWritten: (agent: string, cmd: string) => `${agent} no escribió pruebas nuevas; se usará "${cmd}" del proyecto.`,
  noTestCommand: (agent: string) =>
    `${agent} no escribió pruebas y este proyecto no tiene comando de pruebas. Escribe un comando de pruebas y vuelve a empezar.`,
  building: (agent: string) => `${agent} está escribiendo el código...`,
  buildFailed: (agent: string, tail: string) => `${agent} no pudo completar la tarea: ${tail}`,
  codeWritten: (agent: string, files: number) => `${agent} escribió el código (${files} archivos cambiados).`,
  stoppedWithChanges: (agent: string, reason: string) =>
    `${agent} se detuvo antes (${reason}) pero cambió archivos; las pruebas deciden si el trabajo está hecho.`,
  verifying: (cmd: string, round: number, max: number) => `Ejecutando "${cmd}" (ronda ${round}/${max})...`,
  verifyPassed: (cmd: string, round: number) => `"${cmd}" pasó (ronda ${round}).`,
  diagnosing: (agent: string) => `${agent} está investigando el error...`,
  verifyFailed: (cmd: string, code: number | null) => `"${cmd}" falló (código de salida ${code}).`,
  repairing: (agent: string, round: number, max: number) => `${agent} está corrigiendo el error (ronda ${round}/${max})...`,
  repairFailed: (agent: string, tail: string) => `${agent} no pudo aplicar una corrección: ${tail}`,
  patchApplied: (agent: string) => `${agent} aplicó la corrección; se vuelve a probar.`,
  outOfRounds: (max: number) =>
    `Las pruebas no pasaron en ${max} rondas. El último error está arriba; los cambios siguen ahí, revísalos en el panel "Cambios".`,
  auditing: (agent: string) => `${agent} está auditando los cambios finales...`,
  auditNoVerdict: 'no dio un veredicto claro',
  auditCouldNotRun: (tail: string) => `no se pudo ejecutar: ${tail}`,
  auditRejected: (agent: string) => `${agent} encontró problemas en los cambios.`,
  auditSkipped: (agent: string, reason: string) =>
    `Las pruebas pasaron. La auditoría de ${agent} ${reason}; revisa los cambios tú mismo.`,
  auditApproved: (agent: string) => `Las pruebas pasaron y ${agent} aprobó los cambios.`,
  doneRejected: 'Las pruebas pasaron, pero el auditor encontró problemas.',
  done: 'Hecho: las pruebas pasaron.',
  paused: 'En pausa.',
  resumed: 'Reanudado.',
  stopped: 'Detenido.',
};

const fr: MeshText = {
  timedOut: 'délai dépassé',
  exitCode: (code: number | null) => `code de sortie ${code}`,
  checking: 'Vérification que les agents choisis sont installés...',
  missingAgents: (names: string) =>
    `Agent non installé : ${names}. Choisis un agent installé sur cet ordinateur ou installe d’abord cet outil.`,
  taskGiven: (agent: string, goal: string) => `Tâche confiée à ${agent} : "${goal}"`,
  planningTests: (agent: string) => `${agent} écrit des tests pour l’objectif...`,
  testsWritten: (agent: string, files: number, cmd: string) =>
    `${agent} a écrit des tests pour l’objectif (${files} fichier${files === 1 ? '' : 's'}). Ils se lancent avec "${cmd}".`,
  testsNotWritten: (agent: string, cmd: string) => `${agent} n’a pas écrit de nouveaux tests ; "${cmd}" du projet sera utilisé.`,
  noTestCommand: (agent: string) =>
    `${agent} n’a pas écrit de tests et ce projet n’a pas de commande de test. Saisis une commande de test et relance.`,
  building: (agent: string) => `${agent} écrit le code...`,
  buildFailed: (agent: string, tail: string) => `${agent} n’a pas pu terminer la tâche : ${tail}`,
  codeWritten: (agent: string, files: number) => `${agent} a écrit le code (${files} fichiers modifiés).`,
  stoppedWithChanges: (agent: string, reason: string) =>
    `${agent} s’est arrêté tôt (${reason}) mais a modifié des fichiers ; les tests décident si le travail est terminé.`,
  verifying: (cmd: string, round: number, max: number) => `Exécution de "${cmd}" (tour ${round}/${max})...`,
  verifyPassed: (cmd: string, round: number) => `"${cmd}" a réussi (tour ${round}).`,
  diagnosing: (agent: string) => `${agent} examine l’erreur...`,
  verifyFailed: (cmd: string, code: number | null) => `"${cmd}" a échoué (code de sortie ${code}).`,
  repairing: (agent: string, round: number, max: number) => `${agent} corrige l’erreur (tour ${round}/${max})...`,
  repairFailed: (agent: string, tail: string) => `${agent} n’a pas pu appliquer de correctif : ${tail}`,
  patchApplied: (agent: string) => `${agent} a appliqué le correctif, nouveau test en cours.`,
  outOfRounds: (max: number) =>
    `Les tests n’ont pas réussi en ${max} tours. La dernière erreur est ci-dessus ; les modifications sont toujours là, vérifie-les dans le panneau « Modifications ».`,
  auditing: (agent: string) => `${agent} audite les modifications finales...`,
  auditNoVerdict: 'n’a pas donné de verdict clair',
  auditCouldNotRun: (tail: string) => `n’a pas pu s’exécuter : ${tail}`,
  auditRejected: (agent: string) => `${agent} a trouvé des problèmes dans les modifications.`,
  auditSkipped: (agent: string, reason: string) =>
    `Les tests ont réussi. L’audit de ${agent} ${reason} ; vérifie toi-même les modifications.`,
  auditApproved: (agent: string) => `Les tests ont réussi et ${agent} a approuvé les modifications.`,
  doneRejected: 'Les tests ont réussi, mais l’auditeur a trouvé des problèmes.',
  done: 'Terminé : les tests ont réussi.',
  paused: 'En pause.',
  resumed: 'Reprise.',
  stopped: 'Arrêté.',
};

const ja: MeshText = {
  timedOut: 'タイムアウト',
  exitCode: (code: number | null) => `終了コード ${code}`,
  checking: '選んだエージェントがインストールされているか確認しています...',
  missingAgents: (names: string) =>
    `インストールされていないエージェント: ${names}。このコンピューターにあるエージェントを選ぶか、先にそのツールをインストールしてください。`,
  taskGiven: (agent: string, goal: string) => `${agent} にタスクを渡しました: "${goal}"`,
  planningTests: (agent: string) => `${agent} が目標のテストを書いています...`,
  testsWritten: (agent: string, files: number, cmd: string) =>
    `${agent} が目標のテストを書きました（${files} ファイル）。"${cmd}" で実行します。`,
  testsNotWritten: (agent: string, cmd: string) => `${agent} は新しいテストを書きませんでした。プロジェクトの "${cmd}" を使います。`,
  noTestCommand: (agent: string) =>
    `${agent} はテストを書けず、このプロジェクトにはテストコマンドがありません。テストコマンドを入力してやり直してください。`,
  building: (agent: string) => `${agent} がコードを書いています...`,
  buildFailed: (agent: string, tail: string) => `${agent} はタスクを完了できませんでした: ${tail}`,
  codeWritten: (agent: string, files: number) => `${agent} がコードを書きました（${files} ファイル変更）。`,
  stoppedWithChanges: (agent: string, reason: string) =>
    `${agent} は途中で止まりました（${reason}）がファイルを変更しました。完了かどうかはテストで判断します。`,
  verifying: (cmd: string, round: number, max: number) => `"${cmd}" を実行中（ラウンド ${round}/${max}）...`,
  verifyPassed: (cmd: string, round: number) => `"${cmd}" が成功しました（ラウンド ${round}）。`,
  diagnosing: (agent: string) => `${agent} がエラーを調べています...`,
  verifyFailed: (cmd: string, code: number | null) => `"${cmd}" が失敗しました（終了コード ${code}）。`,
  repairing: (agent: string, round: number, max: number) => `${agent} がエラーを修正しています（ラウンド ${round}/${max}）...`,
  repairFailed: (agent: string, tail: string) => `${agent} は修正を適用できませんでした: ${tail}`,
  patchApplied: (agent: string) => `${agent} が修正を適用しました。再テストします。`,
  outOfRounds: (max: number) =>
    `${max} ラウンドでテストが通りませんでした。最後のエラーは上にあります。変更はそのまま残っているので「変更」パネルで確認してください。`,
  auditing: (agent: string) => `${agent} が最終的な変更を監査しています...`,
  auditNoVerdict: '明確な判定を出しませんでした',
  auditCouldNotRun: (tail: string) => `実行できませんでした: ${tail}`,
  auditRejected: (agent: string) => `${agent} が変更に問題を見つけました。`,
  auditSkipped: (agent: string, reason: string) =>
    `テストは通りました。${agent} の監査は${reason}。変更はご自身で確認してください。`,
  auditApproved: (agent: string) => `テストが通り、${agent} が変更を承認しました。`,
  doneRejected: 'テストは通りましたが、監査役が問題を見つけました。',
  done: '完了: テストが通りました。',
  paused: '一時停止しました。',
  resumed: '再開しました。',
  stopped: '停止しました。',
};

const zh: MeshText = {
  timedOut: '超时',
  exitCode: (code: number | null) => `退出码 ${code}`,
  checking: '正在检查所选代理是否已安装...',
  missingAgents: (names: string) => `未安装的代理：${names}。请选择本机已安装的代理，或先安装该工具。`,
  taskGiven: (agent: string, goal: string) => `已将任务交给 ${agent}："${goal}"`,
  planningTests: (agent: string) => `${agent} 正在为目标编写测试...`,
  testsWritten: (agent: string, files: number, cmd: string) => `${agent} 已为目标编写测试（${files} 个文件），使用 "${cmd}" 运行。`,
  testsNotWritten: (agent: string, cmd: string) => `${agent} 没有编写新测试；将使用项目的 "${cmd}"。`,
  noTestCommand: (agent: string) => `${agent} 没有编写测试，而且此项目没有测试命令。请输入测试命令后重新开始。`,
  building: (agent: string) => `${agent} 正在编写代码...`,
  buildFailed: (agent: string, tail: string) => `${agent} 无法完成任务：${tail}`,
  codeWritten: (agent: string, files: number) => `${agent} 已编写代码（更改了 ${files} 个文件）。`,
  stoppedWithChanges: (agent: string, reason: string) =>
    `${agent} 提前停止（${reason}），但更改了文件；由测试决定工作是否完成。`,
  verifying: (cmd: string, round: number, max: number) => `正在运行 "${cmd}"（第 ${round}/${max} 轮）...`,
  verifyPassed: (cmd: string, round: number) => `"${cmd}" 通过（第 ${round} 轮）。`,
  diagnosing: (agent: string) => `${agent} 正在调查错误...`,
  verifyFailed: (cmd: string, code: number | null) => `"${cmd}" 失败（退出码 ${code}）。`,
  repairing: (agent: string, round: number, max: number) => `${agent} 正在修复错误（第 ${round}/${max} 轮）...`,
  repairFailed: (agent: string, tail: string) => `${agent} 无法应用修复：${tail}`,
  patchApplied: (agent: string) => `${agent} 已应用修复，正在重新测试。`,
  outOfRounds: (max: number) => `测试在 ${max} 轮内未通过。最后的错误见上方；更改仍然保留，请在“更改”面板中查看。`,
  auditing: (agent: string) => `${agent} 正在审查最终更改...`,
  auditNoVerdict: '没有给出明确结论',
  auditCouldNotRun: (tail: string) => `无法运行：${tail}`,
  auditRejected: (agent: string) => `${agent} 在更改中发现了问题。`,
  auditSkipped: (agent: string, reason: string) => `测试已通过。${agent} 的审查${reason}；请自行检查更改。`,
  auditApproved: (agent: string) => `测试已通过，${agent} 批准了这些更改。`,
  doneRejected: '测试已通过，但审查者发现了问题。',
  done: '完成：测试已通过。',
  paused: '已暂停。',
  resumed: '已继续。',
  stopped: '已停止。',
};

const ru: MeshText = {
  timedOut: 'истекло время ожидания',
  exitCode: (code: number | null) => `код выхода ${code}`,
  checking: 'Проверяем, установлены ли выбранные агенты...',
  missingAgents: (names: string) =>
    `Агент не установлен: ${names}. Выберите агента, установленного на этом компьютере, или сначала установите этот инструмент.`,
  taskGiven: (agent: string, goal: string) => `Задача для ${agent}: "${goal}"`,
  planningTests: (agent: string) => `${agent} пишет тесты для цели...`,
  testsWritten: (agent: string, files: number, cmd: string) =>
    `${agent} написал тесты для цели (файлов: ${files}). Они запускаются командой "${cmd}".`,
  testsNotWritten: (agent: string, cmd: string) => `${agent} не написал новых тестов; будет использована команда проекта "${cmd}".`,
  noTestCommand: (agent: string) =>
    `${agent} не написал тестов, а в проекте нет команды для тестов. Введите команду для тестов и начните снова.`,
  building: (agent: string) => `${agent} пишет код...`,
  buildFailed: (agent: string, tail: string) => `${agent} не смог выполнить задачу: ${tail}`,
  codeWritten: (agent: string, files: number) => `${agent} написал код (изменено файлов: ${files}).`,
  stoppedWithChanges: (agent: string, reason: string) =>
    `${agent} остановился раньше (${reason}), но изменил файлы; закончена ли работа, решат тесты.`,
  verifying: (cmd: string, round: number, max: number) => `Запуск "${cmd}" (раунд ${round}/${max})...`,
  verifyPassed: (cmd: string, round: number) => `"${cmd}" прошёл (раунд ${round}).`,
  diagnosing: (agent: string) => `${agent} изучает ошибку...`,
  verifyFailed: (cmd: string, code: number | null) => `"${cmd}" не прошёл (код выхода ${code}).`,
  repairing: (agent: string, round: number, max: number) => `${agent} исправляет ошибку (раунд ${round}/${max})...`,
  repairFailed: (agent: string, tail: string) => `${agent} не смог применить исправление: ${tail}`,
  patchApplied: (agent: string) => `${agent} применил исправление, тестируем снова.`,
  outOfRounds: (max: number) =>
    `Тесты не прошли за ${max} раундов. Последняя ошибка выше; изменения на месте, проверьте их на панели «Изменения».`,
  auditing: (agent: string) => `${agent} проверяет итоговые изменения...`,
  auditNoVerdict: 'не дал чёткого вердикта',
  auditCouldNotRun: (tail: string) => `не удалось запустить: ${tail}`,
  auditRejected: (agent: string) => `${agent} нашёл проблемы в изменениях.`,
  auditSkipped: (agent: string, reason: string) =>
    `Тесты прошли. Проверка ${agent}: ${reason}; просмотрите изменения сами.`,
  auditApproved: (agent: string) => `Тесты прошли, и ${agent} одобрил изменения.`,
  doneRejected: 'Тесты прошли, но проверяющий нашёл проблемы.',
  done: 'Готово: тесты прошли.',
  paused: 'Пауза.',
  resumed: 'Продолжаем.',
  stopped: 'Остановлено.',
};

export const MESH_TEXT: Record<EngineLang, MeshText> = { en, tr, de, es, fr, ja, zh, ru };
