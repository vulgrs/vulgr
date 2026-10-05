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

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfigChanged?: (config: WarpConfig) => void;
}

const CLAUDE_MODELS: OptionItem[] = [
  { value: 'default', label: 'Default (Claude Code decides)' },
  { value: 'opus', label: 'Opus (most capable)' },
  { value: 'sonnet', label: 'Sonnet (balanced)' },
  { value: 'haiku', label: 'Haiku (fastest)' },
];

const AGY_MODELS: OptionItem[] = [
  { value: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro (Deep Code Analysis)' },
  { value: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash (Sub-Second Verify)' },
];

const CODEX_MODELS: OptionItem[] = [
  { value: 'gpt-4o', label: 'GPT-4o (Standard Multimodal)' },
  { value: 'o3-mini', label: 'o3-mini (High-Speed Reasoning)' },
  { value: 'o1', label: 'o1 (Deep Mathematics & Logic)' },
];

const SHELLS: OptionItem[] = [
  { value: 'powershell', label: 'Windows PowerShell (powershell.exe)' },
  { value: 'cmd', label: 'Command Prompt (cmd.exe)' },
  { value: 'wsl', label: 'WSL Bash (wsl.exe)' },
  { value: 'bash', label: 'Git Bash / POSIX (bash.exe)' },
];

const CURSORS: OptionItem[] = [
  { value: 'bar', label: 'Bar ( | )' },
  { value: 'block', label: 'Block ( █ )' },
  { value: 'underline', label: 'Underline ( _ )' },
];

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  onConfigChanged,
}) => {
  const [activeTab, setActiveTab] = useState('permissions');
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
      toast.success('Settings saved');
    } catch (err) {
      console.error('Failed to update config:', err);
      toast.error('Failed to save settings');
    }
  };

  const handleReset = async () => {
    if (!window.warpApi?.resetConfig) return;

    try {
      const reset = await window.warpApi.resetConfig();
      setConfig(reset);
      onConfigChanged?.(reset);
      toast.success('Settings reset to defaults');
    } catch (err) {
      console.error('Failed to reset config:', err);
      toast.error('Failed to reset settings');
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="flex h-[80vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-4xl">
        <DialogHeader className="gap-2 border-b px-4 py-4 pr-12">
          <div className="flex flex-wrap items-center gap-2">
            <Badge>
              <SettingsIcon data-icon="inline-start" />
              Settings
            </Badge>
            <Badge variant="outline">Global Config</Badge>
          </div>
          <DialogTitle>Vulgaris settings and CLI permissions</DialogTitle>
          <DialogDescription>
            Configure CLI flags, AI model choices, terminal shells, and safety sandboxes
          </DialogDescription>
        </DialogHeader>

        {config ? (
          <Tabs
            value={activeTab}
            onValueChange={setActiveTab}
            className="flex min-h-0 flex-1 flex-col gap-0 px-4 pt-3"
          >
            <TabsList>
              <TabsTrigger value="permissions">CLI Flags & Models</TabsTrigger>
              <TabsTrigger value="terminal">Terminal & Shell</TabsTrigger>
              <TabsTrigger value="safety">Safety & Sandbox</TabsTrigger>
            </TabsList>

            <TabsContent value="permissions" className="min-h-0 flex-1">
              <ScrollArea className="h-full">
                <div className="flex flex-col gap-4 py-4 pr-3">
                  <Card size="sm">
                    <CardHeader>
                      <CardTitle>Claude Code</CardTitle>
                      <CardDescription>Model, retries, and permission bypass for autonomous loops</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <FieldGroup>
                        <Field orientation="horizontal">
                          <div className="flex flex-col gap-1">
                            <FieldTitle>Dangerously Skip Permissions</FieldTitle>
                            <FieldDescription>
                              Bypasses confirmation prompts so Claude can iterate in mesh loops. Flag: --dangerously-skip-permissions
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
                            <FieldLabel htmlFor="claude-model">Claude Model</FieldLabel>
                            <OptionSelect
                              id="claude-model"
                              value={config.claude.model}
                              items={CLAUDE_MODELS}
                              onValueChange={(value) =>
                                setConfig({ ...config, claude: { ...config.claude, model: value } })
                              }
                            />
                          </Field>
                          <Field>
                            <FieldLabel htmlFor="claude-retries">Max Autonomous Repair Retries</FieldLabel>
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
                      <CardDescription>Verifier model and self-correction budget</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="grid gap-4 sm:grid-cols-2">
                        <Field>
                          <FieldLabel htmlFor="agy-model">AGY Gemini Model</FieldLabel>
                          <OptionSelect
                            id="agy-model"
                            value={config.agy.model}
                            items={AGY_MODELS}
                            onValueChange={(value) =>
                              setConfig({ ...config, agy: { ...config.agy, model: value } })
                            }
                          />
                        </Field>
                        <Field>
                          <FieldLabel htmlFor="agy-budget">Self-Correction Budget (Rounds)</FieldLabel>
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
                      <CardDescription>Local subprocess, no API key required</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="grid gap-4 sm:grid-cols-2">
                        <Field>
                          <FieldLabel htmlFor="codex-model">Codex Model</FieldLabel>
                          <OptionSelect
                            id="codex-model"
                            value={config.codex.model}
                            items={CODEX_MODELS}
                            onValueChange={(value) =>
                              setConfig({ ...config, codex: { ...config.codex, model: value } })
                            }
                          />
                        </Field>
                        <Field>
                          <FieldLabel htmlFor="codex-binary">Local CLI Binary Command</FieldLabel>
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
                          <FieldDescription>Runs via local subprocess in the terminal</FieldDescription>
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
                      <CardTitle>Shell environment and font</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <FieldGroup>
                        <div className="grid gap-4 sm:grid-cols-2">
                          <Field>
                            <FieldLabel htmlFor="default-shell">Default Shell</FieldLabel>
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
                            <FieldLabel htmlFor="cursor-style">Cursor Style</FieldLabel>
                            <OptionSelect
                              id="cursor-style"
                              value={config.cursorStyle}
                              items={CURSORS}
                              onValueChange={(value) =>
                                setConfig({ ...config, cursorStyle: value as CursorStyleType })
                              }
                            />
                          </Field>
                        </div>
                        <Field>
                          <div className="flex items-center justify-between">
                            <FieldLabel htmlFor="font-size">Font Size</FieldLabel>
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
                      <CardTitle>Autonomous agent sandbox</CardTitle>
                      <CardDescription>Ephemeral git worktrees protect the active branch</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <FieldGroup>
                        <Field orientation="horizontal">
                          <div className="flex flex-col gap-1">
                            <FieldTitle>Auto-Sandbox Autonomous Runs</FieldTitle>
                            <FieldDescription>
                              Agent Mesh and Autonomous Squads run inside .warp-worktrees/ so uncommitted files stay untouched.
                            </FieldDescription>
                          </div>
                          <Switch
                            checked={config.autoSandbox}
                            onCheckedChange={(checked) => setConfig({ ...config, autoSandbox: checked })}
                          />
                        </Field>
                        <Field>
                          <FieldLabel htmlFor="verify-cmd">Default Build Verification Command</FieldLabel>
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
            Loading configuration…
          </div>
        )}

        <DialogFooter className="mx-0 mb-0 rounded-none">
          <Button variant="ghost" onClick={handleReset} disabled={!config}>
            <RotateCcwIcon data-icon="inline-start" />
            Reset to Defaults
          </Button>
          <Button onClick={handleSave} disabled={!config}>
            Save Configuration
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
