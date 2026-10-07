import React from 'react';
import { Button } from '@/components/ui/button.js';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog.js';
import { useI18n } from '../i18n/index.js';
import { AgentSetupPanel } from './AgentSetupPanel.js';

interface AgentSetupModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Opens a terminal tab running the command (install by hand, or the first-run sign-in). */
  onRunInTerminal: (command: string, title: string) => void;
}

export const AgentSetupModal: React.FC<AgentSetupModalProps> = ({ isOpen, onClose, onRunInTerminal }) => {
  const { t } = useI18n();
  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="flex max-h-[85vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-2xl">
        <DialogHeader className="gap-1.5 border-b px-5 py-4 pr-12">
          <DialogTitle>{t.agentSetup.title}</DialogTitle>
          <DialogDescription>{t.agentSetup.description}</DialogDescription>
        </DialogHeader>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          <AgentSetupPanel
            onRunInTerminal={(command, title) => {
              onRunInTerminal(command, title);
              onClose();
            }}
          />
        </div>
        <DialogFooter className="border-t px-5 py-3">
          <Button onClick={onClose}>{t.agentSetup.done}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
