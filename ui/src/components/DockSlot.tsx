import React, { useEffect, useRef, useState } from 'react';

interface DockSlotProps {
  /** False while a command owns the terminal: the dock is swapped for `placeholder`. */
  showDock: boolean;
  placeholder: React.ReactNode;
  children: React.ReactNode;
}

/**
 * Holds a pane's command dock. While a command runs the dock is replaced by a
 * strip of the same height, so the PTY above is never resized when a command
 * starts/ends (a resize makes ConPTY repaint and shifts the block headers).
 */
export const DockSlot: React.FC<DockSlotProps> = ({ showDock, placeholder, children }) => {
  const ref = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState<number | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || !showDock) return;
    const measure = () => setHeight(el.offsetHeight);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [showDock]);

  return (
    <div ref={ref} className="flex-shrink-0" style={!showDock && height ? { height } : undefined}>
      {showDock ? (
        children
      ) : (
        <div className="h-full bg-base-app border-t border-zinc-900/70 px-4 pt-3 text-[11px] font-mono text-zinc-600 select-none">
          {placeholder}
        </div>
      )}
    </div>
  );
};
