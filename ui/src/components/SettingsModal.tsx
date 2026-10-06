import React, { useState, useEffect } from 'react';
import { SettingsIcon, RotateCcwIcon } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge.js';
import { Button } from '@/components/ui/button.js';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card.js';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog.js';
import { Field, FieldDescription, FieldGroup, FieldLabel, FieldTitle } from '@/components/ui/field.js';
import { Input } from '@/components/ui/input.js';
import { ScrollArea } from '@/components/ui/scroll-area.js';
import { Slider } from '@/components/ui/slider.js';
import { Switch } from '@/components/ui/switch.js';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs.js';
import { OptionSelect, type OptionItem } from './OptionSelect.js';
import type { WarpConfig, ShellType, CursorStyleType } from '../types/warp.js';
import { useI18n, LANGUAGES, type Lang, type Messages } from '../i18n/index.js';
import { useTheme, type ThemePreference } from '../theme.js';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfigChanged?: (config: WarpConfig) => void;
}

const claudeModels = (t: Messages): OptionItem[] => [
  { value: 'default', label: t.settings.claudeModels.default },
  { value: 'opus', label: t.settings.claudeModels.opus },
  { value: 'sonnet', label: t.settings.claudeModels.sonnet },
  { value: 'haiku', label: t.settings.claudeModels.haiku },
];

const agyModels = (t: Messages): OptionItem[] => [
  { value: 'gemini-2.5-pro', label: t.settings.agyModels.pro },
  { value: 'gemini-2.5-flash', label: t.settings.agyModels.flash },
];

const codexModels = (t: Messages): OptionItem[] => [
  { value: 'gpt-4o', label: t.settings.codexModels.gpt4o },
  { value: 'o3-mini', label: t.settings.codexModels.o3mini },
  { value: 'o1', label: t.settings.codexModels.o1 },
];

const SHELLS: OptionItem[] = [
  { value: 'powershell', label: 'Windows PowerShell (powershell.exe)' },
  { value: 'cmd', label: 'Command Prompt (cmd.exe)' },
  { value: 'wsl', label: 'WSL Bash (wsl.exe)' },
  { value: 'bash', label: 'Git Bash / POSIX (bash.exe)' },
];

const cursors = (t: Messages): OptionItem[] => [
  { value: 'bar', label: t.settings.cursors.bar },
  { value: 'block', label: t.settings.cursors.block },
  { value: 'underline', label: t.settings.cursors.underline },
];

const LANGUAGE_ITEMS: OptionItem[] = LANGUAGES.map((l) => ({ value: l.value, label: l.label }));

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  onConfigChanged,
}) => {
  const { t, lang, setLang } = useI18n();
  const { preference: themePreference, setPreference: setThemePreference } = useTheme();
  const themeItems: OptionItem[] = [
    { value: 'dark', label: t.settings.themeDark },
    { value: 'light', label: t.settings.themeLight },
    { value: 'system', label: t.settings.themeSystem },
  ];
  const [activeTab, setActiveTab] = useState('general');
  const [config, setConfig] = useState<WarpConfig | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    loadConfig();
  }, [isOpen]);

  const loadConfig = async () => {
    if (window.warpApi?.getConfig) {
      try {
        const c = await window.warpApi.getConfig();
        setConfig(c);
      } catch (err) {
        console.error('Failed to load config:', err);
      }
    }
  };

  const handleSave = async () => {
    if (!config || !window.warpApi?.updateConfig) return;

    try {
      const updated = await window.warpApi.updateConfig(config);
      setConfig(updated);
      onConfigChanged?.(updated);
      toast.success(t.settings.saved);
    } catch (err) {
      console.error('Failed to update config:', err);
      toast.error(t.settings.saveFailed);
    }
  };

  const handleReset = async () => {
    if (!window.warpApi?.resetConfig) return;

    try {
      const reset = await window.warpApi.resetConfig();
      setConfig(reset);
      onConfigChanged?.(reset);
      toast.success(t.settings.resetDone);
    } catch (err) {
      console.error('Failed to reset config:', err);
      toast.error(t.settings.resetFailed);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="flex h-[80vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-4xl">
        <DialogHeader className="gap-2 border-b px-4 py-4 pr-12">
          <div className="flex flex-wrap items-center gap-2">
            <Badge>
              <SettingsIcon data-icon="inline-start" />
              {t.settings.badge}
            </Badge>
            <Badge variant="outline">{t.settings.globalConfig}</Badge>
          </div>
          <DialogTitle>{t.settings.title}</DialogTitle>
          <DialogDescription>
            {t.settings.description}
          </DialogDescription>
        </DialogHeader>

        {config ? (
          <Tabs
            value={activeTab}
            onValueChange={setActiveTab}
            className="flex min-h-0 flex-1 flex-col gap-0 px-4 pt-3"
          >
            <TabsList>
              <TabsTrigger value="general">{t.settings.tabGeneral}</TabsTrigger>
              <TabsTrigger value="permissions">{t.settings.tabPermissions}</TabsTrigger>
              <TabsTrigger value="terminal">{t.settings.tabTerminal}</TabsTrigger>
              <TabsTrigger value="safety">{t.settings.tabSafety}</TabsTrigger>
            </TabsList>

            <TabsContent value="general" className="min-h-0 flex-1">
              <ScrollArea className="h-full">
                <div className="flex flex-col gap-4 py-4 pr-3">
                  <Card size="sm">
                    <CardHeader>
                      <CardTitle>{t.settings.themeTitle}</CardTitle>
                      <CardDescription>{t.settings.themeDescription}</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <Field>
                        <FieldLabel htmlFor="ui-theme">{t.settings.themeTitle}</FieldLabel>
                        <OptionSelect
                          id="ui-theme"
                          value={themePreference}
                          items={themeItems}
                          onValueChange={(value) => setThemePreference(value as ThemePreference)}
                        />
                      </Field>
                    </CardContent>
                  </Card>
                  <Card size="sm">
                    <CardHeader>
                      <CardTitle>{t.settings.languageTitle}</CardTitle>
                      <CardDescription>{t.settings.languageDescription}</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <Field>
                        <FieldLabel htmlFor="ui-language">{t.common.language}</FieldLabel>
                        <OptionSelect
                          id="ui-language"
                          value={lang}
                          items={LANGUAGE_ITEMS}
                          onValueChange={(value) => setLang(value as Lang)}
                        />
                      </Field>
                    </CardContent>
                  </Card>
                </div>
              </ScrollArea>
            </TabsContent>

            <TabsContent value="permissions" className="min-h-0 flex-1">
              <ScrollArea className="h-full">
                <div className="flex flex-col gap-4 py-4 pr-3">
                  <Card size="sm">
                    <CardHeader>
                      <CardTitle>Claude Code</CardTitle>
                      <CardDescription>{t.settings.claudeDescription}</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <FieldGroup>
                        <Field orientation="horizontal">
                          <div className="flex flex-col gap-1">
                            <FieldTitle>{t.settings.skipPermissions}</FieldTitle>
                            <FieldDescription>
                              {t.settings.skipPermissionsHint}
                            </FieldDescription>
                          </div>
                          <Switch
                            checked={config.claude.skipPermissions}
                            onCheckedChange={(checked) =>
                              setConfig({
                                ...config,
                                claude: { ...config.claude, skipPermissions: checked },
                              })
                            }
                          />
                        </Field>
                        <div className="grid gap-4 sm:grid-cols-2">
                          <Field>
                            <FieldLabel htmlFor="claude-model">{t.settings.claudeModel}</FieldLabel>
                            <OptionSelect
                              id="claude-model"
                              value={config.claude.model}
                              items={claudeModels(t)}
                              onValueChange={(value) =>
                                setConfig({ ...config, claude: { ...config.claude, model: value } })
                              }
                            />
                          </Field>
                          <Field>
                            <FieldLabel htmlFor="claude-retries">{t.settings.maxRetries}</FieldLabel>
                            <Input
                              id="claude-retries"
                              type="number"
                              min={1}
                              max={10}
                              value={config.claude.maxRetries}
                              className="font-mono"
                              onChange={(e) =>
                                setConfig({
                                  ...config,
                                  claude: { ...config.claude, maxRetries: parseInt(e.target.value) || 3 },
                                })
                              }
                            />
                          </Field>
                        </div>
                      </FieldGroup>
                    </CardContent>
                  </Card>

                  <Card size="sm">
                    <CardHeader>
                      <CardTitle>Google AGY Engine</CardTitle>
                      <CardDescription>{t.settings.agyDescription}</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="grid gap-4 sm:grid-cols-2">
                        <Field>
                          <FieldLabel htmlFor="agy-model">{t.settings.agyModel}</FieldLabel>
                          <OptionSelect
                            id="agy-model"
                            value={config.agy.model}
                            items={agyModels(t)}
                            onValueChange={(value) =>
                              setConfig({ ...config, agy: { ...config.agy, model: value } })
                            }
                          />
                        </Field>
                        <Field>
                          <FieldLabel htmlFor="agy-budget">{t.settings.agyBudget}</FieldLabel>
                          <Input
                            id="agy-budget"
                            type="number"
                            min={1}
                            max={5}
                            value={config.agy.budget}
                            className="font-mono"
                            onChange={(e) =>
                              setConfig({
                                ...config,
                                agy: { ...config.agy, budget: parseInt(e.target.value) || 3 },
                              })
                            }
                          />
                        </Field>
                      </div>
                    </CardContent>
                  </Card>

                  <Card size="sm">
                    <CardHeader>
                      <CardTitle>OpenAI Codex CLI</CardTitle>
                      <CardDescription>{t.settings.codexDescription}</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="grid gap-4 sm:grid-cols-2">
                        <Field>
                          <FieldLabel htmlFor="codex-model">{t.settings.codexModel}</FieldLabel>
                          <OptionSelect
                            id="codex-model"
                            value={config.codex.model}
                            items={codexModels(t)}
                            onValueChange={(value) =>
                              setConfig({ ...config, codex: { ...config.codex, model: value } })
                            }
                          />
                        </Field>
                        <Field>
                          <FieldLabel htmlFor="codex-binary">{t.settings.codexBinary}</FieldLabel>
                          <Input
                            id="codex-binary"
                            value={config.codex.binaryPath || 'codex'}
                            placeholder="codex"
                            className="font-mono"
                            onChange={(e) =>
                              setConfig({
                                ...config,
                                codex: { ...config.codex, binaryPath: e.target.value },
                              })
                            }
                          />
                          <FieldDescription>{t.settings.codexBinaryHint}</FieldDescription>
                        </Field>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              </ScrollArea>
            </TabsContent>

            <TabsContent value="terminal" className="min-h-0 flex-1">
              <ScrollArea className="h-full">
                <div className="py-4 pr-3">
                  <Card size="sm">
                    <CardHeader>
                      <CardTitle>{t.settings.shellTitle}</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <FieldGroup>
                        <div className="grid gap-4 sm:grid-cols-2">
                          <Field>
                            <FieldLabel htmlFor="default-shell">{t.settings.defaultShell}</FieldLabel>
                            <OptionSelect
                              id="default-shell"
                              value={config.defaultShell}
                              items={SHELLS}
                              onValueChange={(value) =>
                                setConfig({ ...config, defaultShell: value as ShellType })
                              }
                            />
                          </Field>
                          <Field>
                            <FieldLabel htmlFor="cursor-style">{t.settings.cursorStyle}</FieldLabel>
                            <OptionSelect
                              id="cursor-style"
                              value={config.cursorStyle}
                              items={cursors(t)}
                              onValueChange={(value) =>
                                setConfig({ ...config, cursorStyle: value as CursorStyleType })
                              }
                            />
                          </Field>
                        </div>
                        <Field>
                          <div className="flex items-center justify-between">
                            <FieldLabel htmlFor="font-size">{t.settings.fontSize}</FieldLabel>
                            <span className="font-mono text-sm text-muted-foreground">{config.fontSize}px</span>
                          </div>
                          <Slider
                            id="font-size"
                            min={11}
                            max={20}
                            value={[config.fontSize]}
                            onValueChange={(value) => {
                              const next = Array.isArray(value) ? value[0] : value;
                              setConfig({ ...config, fontSize: next });
                            }}
                          />
                        </Field>
                      </FieldGroup>
                    </CardContent>
                  </Card>
                </div>
              </ScrollArea>
            </TabsContent>

            <TabsContent value="safety" className="min-h-0 flex-1">
              <ScrollArea className="h-full">
                <div className="py-4 pr-3">
                  <Card size="sm">
                    <CardHeader>
                      <CardTitle>{t.settings.sandboxTitle}</CardTitle>
                      <CardDescription>{t.settings.sandboxDescription}</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <FieldGroup>
                        <Field orientation="horizontal">
                          <div className="flex flex-col gap-1">
                            <FieldTitle>{t.settings.autoSandbox}</FieldTitle>
                            <FieldDescription>
                              {t.settings.autoSandboxHint}
                            </FieldDescription>
                          </div>
                          <Switch
                            checked={config.autoSandbox}
                            onCheckedChange={(checked) => setConfig({ ...config, autoSandbox: checked })}
                          />
                        </Field>
                        <Field>
                          <FieldLabel htmlFor="verify-cmd">{t.settings.verifyCmd}</FieldLabel>
                          <Input
                            id="verify-cmd"
                            value={config.defaultVerifyCmd}
                            placeholder="npm test"
                            className="font-mono"
                            onChange={(e) => setConfig({ ...config, defaultVerifyCmd: e.target.value })}
                          />
                        </Field>
                      </FieldGroup>
                    </CardContent>
                  </Card>
                </div>
              </ScrollArea>
            </TabsContent>
          </Tabs>
        ) : (
          <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
            {t.settings.loading}
          </div>
        )}

        <DialogFooter className="mx-0 mb-0 rounded-none">
          <Button variant="ghost" onClick={handleReset} disabled={!config}>
            <RotateCcwIcon data-icon="inline-start" />
            {t.settings.reset}
          </Button>
          <Button onClick={handleSave} disabled={!config}>
            {t.settings.save}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
