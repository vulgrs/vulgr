import { useEffect } from 'react';

/**
 * When a flow dialog opens with an empty test command and the project has its own
 * test command in Settings → This project, fills that in.
 */
export function useProjectTestCommand(isOpen: boolean, cwd: string | undefined, current: string, set: (cmd: string) => void): void {
  useEffect(() => {
    if (!isOpen || !cwd || current.trim() || !window.warpApi?.getProjectConfig) return;
    let live = true;
    window.warpApi
      .getProjectConfig(cwd)
      .then((o: { defaultVerifyCmd?: string } | null) => {
        if (live && o?.defaultVerifyCmd) set(o.defaultVerifyCmd);
      })
      .catch(() => {});
    return () => {
      live = false;
    };
    // Only on opening, so clearing the field afterwards sticks.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, cwd]);
}
