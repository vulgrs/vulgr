import OpenAI from 'openai';
import { z } from 'zod';
import type { ConfigManager } from '../src/engine/configManager.js';

/** The strict JSON contract the System 1 compiler must emit. */
const SystemOneSchema = z.object({
  task_id: z.string(),
  status: z.enum(['success', 'error']),
  affected_slot: z.number(),
  execution: z.object({
    target_file: z.string(),
    action: z.enum(['create', 'modify']),
    imports: z.array(z.string()),
    code: z.string(),
  }),
  memory_patch: z.object({
    should_update: z.boolean(),
    slot: z.number(),
    new_rule: z.string().nullable(),
  }),
  error_details: z.string().nullable(),
});

export type SystemOneResult = z.infer<typeof SystemOneSchema>;

export interface SystemOneRunOptions {
  taskId: string;
  targetFile: string;
  prompt: string;
  slot: number;
  rules: string;
  model?: string;
}

const DEFAULT_MODEL = 'poolside/laguna-s-2.1-20260720:free';

/** The System 1 role/system prompt (reflexive code compiler, JSON only). */
const SYSTEM_PROMPT = `ROL VE ÇALIŞMA MODU:
Sen "System 1" mimarisinde çalışan refleksif bir kod derleyicisisin.
Amacın felsefe yapmak, sohbet etmek, açıklama yazmak veya adım adım düşünmek DEĞİLDİR.
Girdi olarak verilen görev ve hafıza kuralını analiz edip, DOĞRUDAN ve YALNIZCA tanımlanan JSON şemasına birebir uyan saf bir JSON nesnesi üretmektir.

TEMEL DİREKTİFLER:
1. SIFIR GEREKSİZ METİN: Yanıtın yalnızca JSON nesnesidir. Selamlama, özet, markdown backtick veya nezaket cümlesi olmaz. İlk karakter "{" ve son karakter "}" olmalıdır.
2. SIKI TİP UYUMU: Üretilen kod, katı TypeScript sözdizimine tam uyumlu olmalıdır. Tanımlanmamış import, eksik tip veya hayali kütüphane eklenemez.
3. BELLEK YASASI: Verilen [MEMORY_SLOT] kuralları mutlaktır. Bu kuralların dışına çıkılamaz, alternatif kütüphane veya stil yöntemi önerilemez.
4. KAPSAM SINIRLANDIRMASI: Yalnızca istenen görevi çöz. Kapsam dışı dosyalara dokunma, refactor yapma.

ZORUNLU JSON ÇIKTI ŞEMASI:
{
  "task_id": "string",
  "status": "success" | "error",
  "affected_slot": number,
  "execution": {
    "target_file": "string",
    "action": "create" | "modify",
    "imports": ["string"],
    "code": "string"
  },
  "memory_patch": {
    "should_update": boolean,
    "slot": number,
    "new_rule": "string veya null"
  },
  "error_details": "string veya null"
}

ÖNEMLİ KURAL:
Görev belirsizse veya bellek kurallarıyla doğrudan çelişiyorsa status="error" yap ve error_details içine tek cümlelik teknik sebebi yaz. Asla sohbet başlatma.`;

function buildUserMessage(o: SystemOneRunOptions): string {
  return `[MEMORY_SLOT: ${o.slot}]
Kurallar:
${o.rules || '(kural yok)'}

[GÖREV]
Hedef Dosya: ${o.targetFile}
İstek: ${o.prompt}

Zorunlu JSON çıktısını üret:`;
}

export class SystemOneCompiler {
  private configManager: ConfigManager | null = null;

  setConfigManager(cm: ConfigManager) {
    this.configManager = cm;
  }

  private resolveApiKey(): string | null {
    if (process.env.OPENROUTER_API_KEY) return process.env.OPENROUTER_API_KEY;
    const fromConfig = this.configManager?.getConfig?.()?.openRouterApiKey;
    if (fromConfig && fromConfig.trim()) return fromConfig.trim();
    return null;
  }

  async run(
    options: SystemOneRunOptions
  ): Promise<{ ok: true; result: SystemOneResult } | { ok: false; error: string }> {
    const apiKey = this.resolveApiKey();
    if (!apiKey) {
      return {
        ok: false,
        error: 'OpenRouter API anahtarı ayarlı değil. .env içine OPENROUTER_API_KEY ekleyin veya Ayarlar > API Key.',
      };
    }

    const model =
      options.model || this.configManager?.getConfig?.()?.systemOneModel || DEFAULT_MODEL;

    const client = new OpenAI({
      baseURL: 'https://openrouter.ai/api/v1',
      apiKey,
      defaultHeaders: {
        'HTTP-Referer': 'http://localhost:3000',
        'X-Title': 'System1-Engine',
      },
    });

    try {
      const completion = await client.chat.completions.create({
        model,
        temperature: 0.0,
        max_tokens: 8000,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: buildUserMessage(options) },
        ],
      });

      const content = completion.choices?.[0]?.message?.content;
      if (!content) {
        return { ok: false, error: 'Model boş yanıt döndürdü.' };
      }

      let raw: unknown;
      try {
        raw = JSON.parse(content);
      } catch {
        return { ok: false, error: 'Model geçerli JSON üretemedi.' };
      }

      const parsed = SystemOneSchema.safeParse(raw);
      if (!parsed.success) {
        return { ok: false, error: `JSON şema doğrulaması başarısız: ${parsed.error.message}` };
      }
      return { ok: true, result: parsed.data };
    } catch (err: any) {
      const status = err?.status ? `[${err.status}] ` : '';
      return { ok: false, error: `${status}${err?.message || String(err)}` };
    }
  }
}
