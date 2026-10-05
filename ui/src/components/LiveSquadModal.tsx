import React, { useEffect, useState } from 'react';
import { UsersIcon, PlayIcon, InfoIcon, XCircleIcon } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert.js';
import { Badge } from '@/components/ui/badge.js';
import { Button } from '@/components/ui/button.js';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog.js';
import { Field, FieldDescription, FieldGroup, FieldLabel } from '@/components/ui/field.js';
import { Input } from '@/components/ui/input.js';
import { Textarea } from '@/components/ui/textarea.js';
import { OptionSelect, type OptionItem } from './OptionSelect.js';
import type { SessionType } from '../types/warp.js';

interface LiveSquadModalProps {
  isOpen: boolean;
  onClose: () => void;
  onLaunchSquad: (config: {
    goal: string;
    builder: SessionType;
    verifier: SessionType;
    verifyCmd: string;
    maxRounds: number;
  }) => void;
}

const AGENT_ITEMS: OptionItem[] = [
  { value: 'claude', label: 'Claude Code' },
  { value: 'agy', label: 'AGY' },
  { value: 'codex', label: 'Codex CLI' },
];

const ROUND_ITEMS: OptionItem[] = [
  { value: '2', label: '2 tur' },
  { value: '3', label: '3 tur' },
  { value: '5', label: '5 tur' },
];

const load = (key: string, fallback: string) => {
  try {
    return localStorage.getItem(`vulgaris.squad.${key}`) || fallback;
  } catch {
    return fallback;
  }
};
const save = (key: string, value: string) => {
  try {
    localStorage.setItem(`vulgaris.squad.${key}`, value);
  } catch {}
};

export const LiveSquadModal: React.FC<LiveSquadModalProps> = ({ isOpen, onClose, onLaunchSquad }) => {
  const [goal, setGoal] = useState('');
  const [builder, setBuilder] = useState(() => load('builder', 'claude'));
  const [verifier, setVerifier] = useState(() => load('verifier', 'agy'));
  const [verifyCmd, setVerifyCmd] = useState(() => load('verifyCmd', 'npm test'));
  const [maxRounds, setMaxRounds] = useState(() => load('maxRounds', '3'));
  const [available, setAvailable] = useState<Record<string, boolean> | null>(null);

  useEffect(() => {
    if (!isOpen || !window.warpApi?.getAvailableAgents) return;
    window.warpApi.getAvailableAgents().then((map: Record<string, boolean>) => {
      setAvailable(map);
      const first = AGENT_ITEMS.find((a) => map[a.value])?.value;
      if (first && !map[builder]) setBuilder(first);
      if (verifier !== 'shell' && !map[verifier]) setVerifier(first ?? 'shell');
    }).catch(() => {});
  }, [isOpen]);

  const installed = AGENT_ITEMS.filter((a) => !available || available[a.value]);
  const verifierItems: OptionItem[] = [...installed, { value: 'shell', label: 'Ajan yok, sadece test komutu' }];
  const missing = available ? AGENT_ITEMS.filter((a) => !available[a.value]).map((a) => a.label) : [];
  const noBuilder = available !== null && installed.length === 0;

  const handleSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!goal.trim() || noBuilder) return;
    save('builder', builder);
    save('verifier', verifier);
    save('verifyCmd', verifyCmd);
    save('maxRounds', maxRounds);

    onLaunchSquad({
      goal: goal.trim(),
      builder: builder as SessionType,
      verifier: verifier as SessionType,
      verifyCmd: verifyCmd.trim() || 'npm test',
      maxRounds: Number(maxRounds) || 3,
    });
    setGoal('');
    onClose();
  };

  const builderLabel = AGENT_ITEMS.find((a) => a.value === builder)?.label ?? builder;
  const verifierLabel = AGENT_ITEMS.find((a) => a.value === verifier)?.label;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="flex max-h-[90vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-xl">
        <DialogHeader className="gap-2 border-b px-4 py-4 pr-12">
          <div className="flex flex-wrap items-center gap-2">
            <Badge>
              <UsersIcon data-icon="inline-start" />
              İkili Ajan
            </Badge>
            <Badge variant="outline">Yan yana iki panel, canlı</Badge>
          </div>
          <DialogTitle>Biri yazsın, diğeri kontrol etsin</DialogTitle>
          <DialogDescription>
            Solda bir ajan kodu yazar, sağda test komutunuz çalışır. Hata çıkarsa kontrol eden ajan nedenini bulur ve
            iş geri gönderilir; testler geçince kodu gözden geçirir. Her adımı panellerde canlı izlersiniz.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4">
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="squad-goal">Ne yapılsın?</FieldLabel>
              <Textarea
                id="squad-goal"
                autoFocus
                rows={2}
                value={goal}
                placeholder="örn. Sepete indirim kodu desteği ekle ve testlerini yaz"
                onChange={(e) => setGoal(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) handleSubmit();
                }}
              />
            </Field>

            <div className="grid gap-3 sm:grid-cols-2">
              <Field>
                <FieldLabel htmlFor="squad-builder">Yazan (sol panel)</FieldLabel>
                <OptionSelect id="squad-builder" value={builder} items={installed} disabled={noBuilder} onValueChange={setBuilder} />
                <FieldDescription>Kodu yazar ve gelen geri bildirime göre düzeltir</FieldDescription>
              </Field>
              <Field>
                <FieldLabel htmlFor="squad-verifier">Kontrol eden (sağ panel)</FieldLabel>
                <OptionSelect id="squad-verifier" value={verifier} items={verifierItems} onValueChange={setVerifier} />
                <FieldDescription>Testleri çalıştırır, hataları inceler, kodu gözden geçirir</FieldDescription>
              </Field>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <Field className="sm:col-span-2">
                <FieldLabel htmlFor="squad-verify">Test komutu</FieldLabel>
                <Input
                  id="squad-verify"
                  value={verifyCmd}
                  placeholder="npm test"
                  className="font-mono"
                  onChange={(e) => setVerifyCmd(e.target.value)}
                />
                <FieldDescription>Başarıda 0 ile çıkan bir komut (npm test, npm run build...)</FieldDescription>
              </Field>
              <Field>
                <FieldLabel htmlFor="squad-rounds">En fazla tur</FieldLabel>
                <OptionSelect id="squad-rounds" value={maxRounds} items={ROUND_ITEMS} onValueChange={setMaxRounds} />
              </Field>
            </div>
          </FieldGroup>

          {missing.length > 0 && !noBuilder && (
            <p className="text-xs text-muted-foreground">Bu bilgisayarda kurulu olmadığı için listede yok: {missing.join(', ')}.</p>
          )}
          {noBuilder && (
            <Alert variant="destructive">
              <XCircleIcon />
              <AlertTitle>Kurulu ajan bulunamadı</AlertTitle>
              <AlertDescription>Claude Code, AGY veya Codex CLI'dan en az birini kurun.</AlertDescription>
            </Alert>
          )}

          <Alert>
            <InfoIcon />
            <AlertTitle>Nasıl ilerler?</AlertTitle>
            <AlertDescription>
              <ol className="list-decimal space-y-0.5 pl-4">
                <li>{builderLabel} görevi alır ve dosyaları düzenler (sol panel).</li>
                <li>"{verifyCmd || 'npm test'}" sağ panelde çalışır.</li>
                <li>
                  {verifierLabel
                    ? `Başarısızsa ${verifierLabel} hatayı inceler, ${builderLabel} düzeltir. Başarılıysa ${verifierLabel} kodu gözden geçirir.`
                    : `Başarısızsa hata çıktısı ${builderLabel}'a geri gönderilir.`}
                </li>
                <li>Onay gelene ya da tur sınırına ulaşılana kadar tekrar eder. İstediğiniz an duraklatabilirsiniz.</li>
              </ol>
            </AlertDescription>
          </Alert>

          <DialogFooter className="mx-0 mb-0 rounded-none border-0 bg-transparent p-0">
            <Button type="button" variant="outline" onClick={onClose}>
              Vazgeç
            </Button>
            <Button type="submit" disabled={!goal.trim() || noBuilder}>
              <PlayIcon data-icon="inline-start" />
              Başlat
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};
