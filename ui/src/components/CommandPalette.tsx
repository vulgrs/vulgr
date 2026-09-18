import React, { useEffect, useMemo, useRef, useState } from 'react';
import { CornerDownLeft, Search } from 'lucide-react';
import type { CommandPaletteAction } from '../types/warp.js';

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
  actions: CommandPaletteAction[];
}

export const CommandPalette: React.FC<CommandPaletteProps> = ({ isOpen, onClose, actions }) => {
  const [query, setQuery] = useState('');
  const [highlighted, setHighlighted] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setHighlighted(0);
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [isOpen]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return actions;
    return actions.filter((a) =>
      `${a.label} ${a.group} ${a.keywords || ''}`.toLowerCase().includes(q)
    );
  }, [query, actions]);

  useEffect(() => {
    setHighlighted(0);
  }, [query]);

  if (!isOpen) return null;

  const runHighlighted = () => {
    const action = filtered[highlighted];
    if (action) {
      action.run();
      onClose();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlighted((h) => Math.min(h + 1, filtered.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlighted((h) => Math.max(h - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      runHighlighted();
    }
  };

  return (
    <div
      className="fixed inset-0 bg-black/80 z-[100] flex items-start justify-center pt-[15vh] select-none"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-xl bg-[#09090b] rounded-xl shadow-2xl border border-zinc-800 overflow-hidden animate-in fade-in zoom-in-95 duration-100"
      >
        <div className="flex items-center px-4 py-3 border-b border-zinc-800 bg-zinc-950">
          <Search size={15} className="text-zinc-400 mr-2.5 flex-shrink-0" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type a command or search actions..."
            className="flex-1 bg-transparent outline-none text-sm text-zinc-100 placeholder:text-zinc-600 font-sans"
          />
          <span className="text-[10px] text-zinc-500 font-mono bg-zinc-900 border border-zinc-800 rounded px-1.5 py-0.5">
            Esc
          </span>
        </div>

        <div className="max-h-80 overflow-y-auto py-2 px-1.5 space-y-0.5">
          {filtered.length === 0 ? (
            <div className="px-3 py-8 text-center text-xs text-zinc-600">No matching commands found</div>
          ) : (
            filtered.map((action, i) => (
              <div
                key={action.id}
                onMouseEnter={() => setHighlighted(i)}
                onClick={() => {
                  action.run();
                  onClose();
                }}
                className={`flex items-center justify-between px-3 py-2 rounded-lg cursor-pointer text-xs transition-all duration-150 ${
 i === highlighted
 ? 'bg-zinc-800/90 text-zinc-100 border border-zinc-700/60 shadow-sm'
 : 'text-zinc-400 hover:bg-zinc-900/60 hover:text-zinc-200 border border-transparent'
 }`}
              >
                <div className="flex items-center space-x-2.5 min-w-0">
                  <span className="text-[10px] uppercase font-bold tracking-wider text-zinc-500 w-16 flex-shrink-0 font-mono">
                    {action.group}
                  </span>
                  <span className="truncate font-medium">{action.label}</span>
                </div>
                <div className="flex items-center space-x-2 flex-shrink-0">
                  {action.shortcut && (
                    <span className="text-[10px] font-mono text-zinc-400 bg-zinc-900 border border-zinc-800 rounded px-1.5 py-0.5">
                      {action.shortcut}
                    </span>
                  )}
                  {i === highlighted && <CornerDownLeft size={12} className="text-zinc-300" />}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};
