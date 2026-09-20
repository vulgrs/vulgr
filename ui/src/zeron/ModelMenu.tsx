import React, { useState } from 'react';
import { Check, ChevronDown } from 'lucide-react';
import {
  MODEL_OPTIONS,
  EFFORT_LEVELS,
  type EffortLevel,
  type ModelOption,
} from './types.js';

interface ModelMenuProps {
  model: ModelOption;
  effort: EffortLevel;
  onSelectModel: (m: ModelOption) => void;
  onSelectEffort: (e: EffortLevel) => void;
  /** Open the panel upward (composer sits near the bottom of the screen). */
  dropUp?: boolean;
}

export const ModelMenu: React.FC<ModelMenuProps> = ({
  model,
  effort,
  onSelectModel,
  onSelectEffort,
  dropUp = true,
}) => {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 text-zinc-300 hover:text-white transition-colors"
        title="Choose model and effort"
      >
        <span className="inline-flex items-center justify-center w-4 h-4 rounded-[4px] bg-gradient-to-br from-zinc-200 to-zinc-400 text-[9px] font-bold text-black">
          ✳
        </span>
        <span className="font-semibold text-zinc-200">{model.label}</span>
        <span className="text-zinc-500">{effort}</span>
        <ChevronDown size={12} className="text-zinc-600" />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div
            className={`absolute z-50 left-0 w-60 rounded-xl border border-white/10 bg-[#141416] shadow-[0_18px_40px_-12px_rgba(0,0,0,0.8)] p-1.5 ${
              dropUp ? 'bottom-full mb-2' : 'top-full mt-2'
            }`}
          >
            <div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
              Model
            </div>
            {MODEL_OPTIONS.map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => {
                  onSelectModel(m);
                  setOpen(false);
                }}
                className="w-full flex items-center justify-between px-2 py-1.5 rounded-md text-[12.5px] text-zinc-200 hover:bg-white/[0.06] transition-colors"
              >
                <span className="flex items-center gap-2">
                  <span className="inline-flex items-center justify-center w-4 h-4 rounded-[4px] bg-gradient-to-br from-zinc-200 to-zinc-400 text-[9px] font-bold text-black">
                    ✳
                  </span>
                  {m.label}
                </span>
                {m.id === model.id && <Check size={13} className="text-emerald-400" />}
              </button>
            ))}

            <div className="h-px bg-white/[0.06] my-1.5" />

            <div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
              Effort
            </div>
            <div className="flex flex-wrap gap-1 px-1 pb-1">
              {EFFORT_LEVELS.map((e) => (
                <button
                  key={e}
                  type="button"
                  onClick={() => {
                    onSelectEffort(e);
                    setOpen(false);
                  }}
                  className={`px-2 py-1 rounded-md text-[11.5px] transition-colors ${
                    e === effort
                      ? 'bg-white/[0.12] text-white'
                      : 'text-zinc-400 hover:bg-white/[0.06]'
                  }`}
                >
                  {e}
                </button>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
};
