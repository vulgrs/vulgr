import React, { useState } from 'react';
import { comboFromEvent, displayCombo } from '../shortcuts.js';

/**
 * A shortcut shown as keys; click it, then press the new combination.
 * Esc or clicking away cancels. The app's own shortcuts pause while it listens.
 */
export const ShortcutField: React.FC<{
  value: string;
  onChange: (combo: string) => void;
  labels: { pressKeys: string; needsModifier: string };
  ariaLabel: string;
  invalid?: boolean;
}> = ({ value, onChange, labels, ariaLabel, invalid }) => {
  const [recording, setRecording] = useState(false);
  const [hint, setHint] = useState(false);

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        data-shortcut-recorder=""
        aria-label={ariaLabel}
        onClick={() => {
          setRecording(true);
          setHint(false);
        }}
        onBlur={() => setRecording(false)}
        onKeyDown={(e) => {
          if (!recording) return;
          e.preventDefault();
          e.stopPropagation();
          if (e.key === 'Escape') {
            setRecording(false);
            return;
          }
          if (['Control', 'Meta', 'Alt', 'Shift'].includes(e.key)) return;
          const combo = comboFromEvent(e.nativeEvent);
          if (!combo) {
            setHint(true);
            return;
          }
          onChange(combo);
          setRecording(false);
          setHint(false);
        }}
        className={`min-w-[120px] rounded-[8px] border px-2.5 py-1 text-right font-mono text-[11.5px] transition-colors ${
          recording
            ? 'border-[color:var(--primary)] bg-base-app text-zinc-300'
            : invalid
              ? 'border-amber-500/50 bg-base-app text-amber-200 hover:border-amber-400 [.light_&]:text-amber-700'
              : 'border-zinc-800 bg-base-app text-zinc-200 hover:border-zinc-600'
        }`}
      >
        {recording ? labels.pressKeys : displayCombo(value)}
      </button>
      {recording && hint && <span className="text-[10.5px] text-amber-300/80 [.light_&]:text-amber-700">{labels.needsModifier}</span>}
    </div>
  );
};
