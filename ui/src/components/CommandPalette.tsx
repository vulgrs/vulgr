import React, { useMemo } from 'react';
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandShortcut,
} from '@/components/ui/command.js';
import type { CommandPaletteAction } from '../types/warp.js';
import { useI18n } from '../i18n/index.js';

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
  actions: CommandPaletteAction[];
}

export const CommandPalette: React.FC<CommandPaletteProps> = ({ isOpen, onClose, actions }) => {
  const { t } = useI18n();
  const groups = useMemo(() => {
    const map = new Map<string, CommandPaletteAction[]>();
    for (const action of actions) {
      const list = map.get(action.group) ?? [];
      list.push(action);
      map.set(action.group, list);
    }
    return [...map.entries()];
  }, [actions]);

  return (
    <CommandDialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title={t.workspace.paletteTitle}
      description={t.workspace.paletteDescription}
      className="sm:max-w-xl"
    >
      <Command key={isOpen ? 'open' : 'closed'}>
        <CommandInput placeholder={t.workspace.palettePlaceholder} />
        <CommandList>
          <CommandEmpty>{t.workspace.paletteEmpty}</CommandEmpty>
          {groups.map(([group, items]) => (
            <CommandGroup key={group} heading={group}>
              {items.map((action) => (
                <CommandItem
                  key={action.id}
                  value={`${action.label} ${action.group} ${action.keywords || ''}`}
                  onSelect={() => {
                    action.run();
                    onClose();
                  }}
                >
                  <span className="truncate">{action.label}</span>
                  {action.shortcut ? <CommandShortcut>{action.shortcut}</CommandShortcut> : null}
                </CommandItem>
              ))}
            </CommandGroup>
          ))}
        </CommandList>
      </Command>
    </CommandDialog>
  );
};
