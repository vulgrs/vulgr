import React, { useState } from 'react';
import {
  X,
  Binary,
  Loader2,
  Play,
  CheckCircle2,
  AlertTriangle,
  FileDown,
  Copy,
  Check,
  Wand2,
  ShieldCheck,
} from 'lucide-react';

interface SystemOneViewProps {
  isOpen: boolean;
  onClose: () => void;
  defaultTargetFile?: string;
}

interface SystemOneResult {
  task_id: string;
  status: 'success' | 'error';
  affected_slot: number;
  execution: {
    target_file: string;
    action: 'create' | 'modify';
    imports: string[];
    code: string;
  };
  memory_patch: { should_update: boolean; slot: number; new_rule: string | null };
  error_details: string | null;
}

const Field: React.FC<{ label: string; children: React.ReactNode; hint?: string }> = ({
  label,
  children,
  hint,
}) => (
  <div>
    <div className="flex items-center justify-between mb-1">
      <label className="text-[11.5px] font-medium text-zinc-300">{label}</label>
      {hint && <span className="text-[10px] text-zinc-600">{hint}</span>}
    </div>
    {children}
  </div>
);

export const SystemOneView: React.FC<SystemOneViewProps> = ({
  isOpen,
  onClose,
  defaultTargetFile = '',
}) => {
  const api = typeof window !== 'undefined' ? (window as any).warpApi : undefined;
  const [targetFile, setTargetFile] = useState(defaultTargetFile);
  const [slot, setSlot] = useState('1');
  const [rules, setRules] = useState('');
  const [prompt, setPrompt] = useState('');
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<SystemOneResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [applied, setApplied] = useState(false);
  const [copied, setCopied] = useState(false);
  const [typecheck, setTypecheck] = useState<{
    status: 'idle' | 'running' | 'clean' | 'errors';
    output: string;
  }>({ status: 'idle', output: '' });
  const [autofixing, setAutofixing] = useState(false);

  if (!isOpen) return null;

  const compose = (r: SystemOneResult): string => {
    const code = r.execution.code || '';
    // Only prepend genuine import/require lines that the code body doesn't
    // already contain — guards against the model returning bare module names
    // or duplicating imports it also put inside `code`.
    const imports = (r.execution.imports || [])
      .map((s) => s.trim())
      .filter(Boolean)
      .filter((s) => /^(import|const|let|var|export|require)\b/.test(s) && !code.includes(s));
    const head = imports.length ? imports.join('\n') + '\n\n' : '';
    return head + code;
  };

  const handleRun = async () => {
    if (!prompt.trim() || !targetFile.trim() || running) return;
    setRunning(true);
    setResult(null);
    setError(null);
    setApplied(false);
    setTypecheck({ status: 'idle', output: '' });
    try {
      const res = await api?.runSystemOne({
        targetFile: targetFile.trim(),
        prompt: prompt.trim(),
        slot: parseInt(slot, 10) || 0,
        rules,
      });
      if (res?.ok) setResult(res.result as SystemOneResult);
      else setError(res?.error || 'Bilinmeyen hata.');
    } catch (e: any) {
      setError(e?.message || String(e));
    }
    setRunning(false);
  };

  const runTypecheck = async () => {
    setTypecheck({ status: 'running', output: '' });
    try {
      const r = await api?.typecheckProject();
      if (r?.clean) setTypecheck({ status: 'clean', output: r.output || '' });
      else setTypecheck({ status: 'errors', output: r?.output || 'Bilinmeyen derleme hatası.' });
    } catch (e: any) {
      setTypecheck({ status: 'errors', output: e?.message || String(e) });
    }
  };

  const handleApply = async () => {
    if (!result) return;
    const res = await api?.writeProjectFile(result.execution.target_file || targetFile, compose(result));
    if (res?.success) {
      setApplied(true);
      setTimeout(() => setApplied(false), 2000);
      // Auto-run the local TypeScript compiler right after writing to disk.
      runTypecheck();
    } else {
      setError(res?.error || 'Dosya yazılamadı.');
    }
  };

  const handleAutoFix = async () => {
    if (!result || autofixing) return;
    const path = result.execution.target_file || targetFile;
    const fixPrompt = `Ürettiğin kodda şu TypeScript hatası çıktı:
${typecheck.output}

Bu hatayı düzelt ve dosyanın tam çalışan halini geçerli JSON formatında tekrar üret. action alanı "modify" olmalı.`;
    setAutofixing(true);
    setError(null);
    try {
      const res = await api?.runSystemOne({
        targetFile: path,
        prompt: fixPrompt,
        slot: parseInt(slot, 10) || 0,
        rules,
      });
      if (res?.ok) {
        setResult(res.result as SystemOneResult);
        setTypecheck({ status: 'idle', output: '' });
        setApplied(false);
      } else {
        setError(res?.error || 'Auto-Fix başarısız.');
      }
    } catch (e: any) {
      setError(e?.message || String(e));
    }
    setAutofixing(false);
  };

  const handleCopy = () => {
    if (!result) return;
    navigator.clipboard.writeText(JSON.stringify(result, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 1200);
  };

  return (
    <div className="absolute inset-0 z-40 flex flex-col bg-[#08080a]">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-2.5 border-b border-white/[0.06]">
        <div className="flex items-center gap-2">
          <Binary size={15} className="text-emerald-400" />
          <span className="text-[13px] font-semibold text-zinc-100">System 1</span>
          <span className="text-[11px] text-zinc-600">Deterministik JSON derleyici</span>
        </div>
        <button
          onClick={onClose}
          className="p-1.5 rounded-md text-zinc-500 hover:text-zinc-200 hover:bg-white/5"
        >
          <X size={16} />
        </button>
      </div>

      <div className="flex-1 min-h-0 flex">
        {/* Input column */}
        <div className="w-[46%] min-w-0 border-r border-white/[0.06] overflow-y-auto p-5 space-y-3.5">
          <div className="grid grid-cols-[1fr_auto] gap-3">
            <Field label="Hedef Dosya" hint="target_file">
              <input
                value={targetFile}
                onChange={(e) => setTargetFile(e.target.value)}
                placeholder="src/components/MetricCard.tsx"
                className="w-full rounded-lg bg-black/40 border border-white/10 focus:border-white/25 outline-none px-3 py-2 text-[12.5px] font-mono text-zinc-200 placeholder:text-zinc-600"
              />
            </Field>
            <Field label="Slot">
              <input
                value={slot}
                onChange={(e) => setSlot(e.target.value)}
                inputMode="numeric"
                className="w-16 rounded-lg bg-black/40 border border-white/10 focus:border-white/25 outline-none px-3 py-2 text-[12.5px] font-mono text-zinc-200 text-center"
              />
            </Field>
          </div>

          <Field label="Bellek Kuralları" hint="SLOT_RULES">
            <textarea
              value={rules}
              onChange={(e) => setRules(e.target.value)}
              rows={4}
              placeholder="Örn: Sadece TailwindCSS kullan. lucide-react ikonları. React 19 fonksiyonel bileşen."
              className="w-full resize-none rounded-lg bg-black/40 border border-white/10 focus:border-white/25 outline-none px-3 py-2 text-[12.5px] text-zinc-200 placeholder:text-zinc-600 leading-relaxed"
            />
          </Field>

          <Field label="Görev / İstek" hint="USER_PROMPT">
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              rows={5}
              placeholder="Örn: Başlık, değer ve yüzde değişim gösteren bir MetricCard bileşeni oluştur."
              className="w-full resize-none rounded-lg bg-black/40 border border-white/10 focus:border-white/25 outline-none px-3 py-2 text-[13px] text-zinc-200 placeholder:text-zinc-600 leading-relaxed"
            />
          </Field>

          <button
            onClick={handleRun}
            disabled={running || !prompt.trim() || !targetFile.trim()}
            className="w-full h-10 rounded-xl bg-emerald-600 enabled:hover:bg-emerald-500 disabled:bg-zinc-800 disabled:text-zinc-500 text-white flex items-center justify-center gap-2 text-[13px] font-semibold transition-colors"
          >
            {running ? <Loader2 size={15} className="animate-spin" /> : <Play size={14} />}
            {running ? 'Derleniyor…' : 'Derle'}
          </button>
        </div>

        {/* Output column */}
        <div className="flex-1 min-w-0 overflow-y-auto p-5">
          {!result && !error && !running && (
            <div className="h-full flex flex-col items-center justify-center text-center select-none">
              <div className="w-12 h-12 rounded-2xl bg-white/[0.03] border border-white/10 flex items-center justify-center text-emerald-400 mb-3">
                <Binary size={22} />
              </div>
              <p className="text-sm font-semibold text-zinc-300">Refleksif kod derleyici</p>
              <p className="text-[12px] text-zinc-500 mt-1 max-w-sm">
                Görevi ve bellek kurallarını ver, temperature 0 ile katı JSON kod-yaması üretsin.
              </p>
            </div>
          )}

          {error && (
            <div className="rounded-xl border border-red-900/50 bg-red-950/30 p-4 flex items-start gap-2.5">
              <AlertTriangle size={16} className="text-red-400 mt-0.5 flex-shrink-0" />
              <div>
                <div className="text-[12.5px] font-semibold text-red-300 mb-0.5">Hata</div>
                <div className="text-[12px] text-red-300/90 break-words">{error}</div>
              </div>
            </div>
          )}

          {result && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {result.status === 'success' ? (
                    <CheckCircle2 size={15} className="text-emerald-400" />
                  ) : (
                    <AlertTriangle size={15} className="text-amber-400" />
                  )}
                  <span className="text-[12.5px] font-semibold text-zinc-200">
                    {result.status === 'success' ? 'Derleme başarılı' : 'Model hata bildirdi'}
                  </span>
                  <span className="text-[10px] font-mono text-zinc-600">
                    slot {result.affected_slot} · {result.execution.action}
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={handleCopy}
                    className="p-1.5 rounded-md text-zinc-500 hover:text-zinc-200 hover:bg-white/5"
                    title="JSON kopyala"
                  >
                    {copied ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} />}
                  </button>
                  {result.status === 'success' && (
                    <button
                      onClick={handleApply}
                      className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md bg-white/[0.06] hover:bg-white/[0.1] text-[11.5px] text-zinc-200"
                      title="Kodu hedef dosyaya yaz"
                    >
                      {applied ? (
                        <Check size={13} className="text-emerald-400" />
                      ) : (
                        <FileDown size={13} />
                      )}
                      {applied ? 'Yazıldı' : 'Dosyaya uygula'}
                    </button>
                  )}
                </div>
              </div>

              {result.error_details && (
                <div className="rounded-lg border border-amber-900/40 bg-amber-950/20 px-3 py-2 text-[12px] text-amber-300">
                  {result.error_details}
                </div>
              )}

              {result.status === 'success' && (
                <div>
                  <div className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500 mb-1">
                    {result.execution.target_file}
                  </div>
                  <pre className="rounded-lg bg-black/50 border border-white/10 p-3 overflow-x-auto text-[12px] leading-5 font-mono text-zinc-200 max-h-[42vh]">
                    {compose(result)}
                  </pre>
                </div>
              )}

              {/* Auto-Fix: local compile result after applying to disk */}
              {typecheck.status === 'running' && (
                <div className="flex items-center gap-2 rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-2.5 text-[12px] text-zinc-400">
                  <Loader2 size={14} className="animate-spin" /> Derleme kontrol ediliyor (npx tsc
                  --noEmit)…
                </div>
              )}

              {typecheck.status === 'clean' && (
                <div className="flex items-center gap-2 rounded-lg border border-emerald-600/40 bg-emerald-500/10 px-3 py-2.5 text-[12.5px] font-semibold text-emerald-300">
                  <ShieldCheck size={15} /> Derleme Kusursuz (0 Hata)
                </div>
              )}

              {typecheck.status === 'errors' && (
                <div className="rounded-lg border border-red-900/50 bg-red-950/30 p-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2 text-[12.5px] font-semibold text-red-300">
                      <AlertTriangle size={15} /> Tip Hatası Bulundu — Otomatik Düzeltilsin mi?
                    </div>
                    <button
                      onClick={handleAutoFix}
                      disabled={autofixing}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-600 enabled:hover:bg-red-500 disabled:bg-zinc-800 disabled:text-zinc-500 text-white text-[12px] font-semibold flex-shrink-0"
                    >
                      {autofixing ? (
                        <Loader2 size={13} className="animate-spin" />
                      ) : (
                        <Wand2 size={13} />
                      )}
                      {autofixing ? 'Düzeltiliyor…' : 'Auto-Fix'}
                    </button>
                  </div>
                  <pre className="mt-2 max-h-52 overflow-auto text-[11px] font-mono text-red-300/90 whitespace-pre-wrap break-words">
                    {typecheck.output}
                  </pre>
                </div>
              )}

              <details className="rounded-lg border border-white/[0.06] bg-white/[0.02]">
                <summary className="px-3 py-2 text-[11.5px] text-zinc-400 cursor-pointer select-none">
                  Ham JSON
                </summary>
                <pre className="px-3 pb-3 overflow-x-auto text-[11px] font-mono text-zinc-500 leading-5">
                  {JSON.stringify(result, null, 2)}
                </pre>
              </details>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
