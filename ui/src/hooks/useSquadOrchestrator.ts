import { useState, useEffect, useRef, useCallback } from 'react';
import type { SquadSession, SessionType, SquadPhase } from '../types/warp.js';

export const useSquadOrchestrator = (cwd: string) => {
  const [squad, setSquad] = useState<SquadSession | null>(null);
  const squadRef = useRef<SquadSession | null>(null);
  squadRef.current = squad;

  const builderBufferRef = useRef<string>('');
  const verifierBufferRef = useRef<string>('');
  const idleTimerRef = useRef<any>(null);
  const errorDetectedRef = useRef<string | null>(null);

  // Clean ANSI escape codes
  const stripAnsi = (str: string) => str.replace(/\x1B\[[0-?]*[ -/]*[@-~]/g, '');

  const startSquad = useCallback(
    (
      config: {
        goal: string;
        builder: SessionType;
        verifier: SessionType;
        verifyCmd: string;
        maxRounds: number;
      },
      tabId: string,
      builderSessionId: string,
      verifierSessionId: string
    ) => {
      const initialSquad: SquadSession = {
        active: true,
        tabId,
        builderSessionId,
        verifierSessionId,
        builderType: config.builder,
        verifierType: config.verifier,
        goal: config.goal,
        verifyCmd: config.verifyCmd,
        phase: 'building',
        round: 1,
        maxRounds: config.maxRounds,
      };

      builderBufferRef.current = '';
      verifierBufferRef.current = '';
      errorDetectedRef.current = null;
      setSquad(initialSquad);

      // Send initial goal prompt to Builder after slight delay for PTY readiness
      setTimeout(() => {
        if (window.warpApi) {
          const prompt = `Task: ${config.goal}\nPlease implement the necessary code changes. When finished, inform that code is ready.\r`;
          window.warpApi.writeTerminal(builderSessionId, prompt);
        }
      }, 1400);
    },
    []
  );

  const triggerVerification = useCallback(() => {
    const current = squadRef.current;
    if (!current || !window.warpApi) return;

    setSquad((prev) => (prev ? { ...prev, phase: 'verifying' } : null));
    verifierBufferRef.current = '';
    errorDetectedRef.current = null;

    setTimeout(() => {
      // Execute verify command in verifier terminal
      window.warpApi.writeTerminal(current.verifierSessionId, `${current.verifyCmd}\r`);
    }, 600);
  }, []);

  const triggerRepair = useCallback((errorSnippet: string) => {
    const current = squadRef.current;
    if (!current || !window.warpApi) return;

    if (current.round >= current.maxRounds) {
      setSquad((prev) =>
        prev
          ? {
              ...prev,
              phase: 'paused',
              lastErrorSnippet: errorSnippet,
            }
          : null
      );
      return;
    }

    setSquad((prev) =>
      prev
        ? {
            ...prev,
            phase: 'repairing',
            round: prev.round + 1,
            lastErrorSnippet: errorSnippet,
          }
        : null
    );

    setTimeout(() => {
      const repairPrompt = `The verification command "${current.verifyCmd}" failed with:\n${errorSnippet.slice(
        0,
        1500
      )}\nPlease diagnose and fix this error now.\r`;
      window.warpApi.writeTerminal(current.builderSessionId, repairPrompt);
      setSquad((prev) => (prev ? { ...prev, phase: 'building' } : null));
      builderBufferRef.current = '';
    }, 800);
  }, []);

  // Listen to PTY data for the active Squad
  useEffect(() => {
    if (!window.warpApi) return;

    const unsubscribe = window.warpApi.onTerminalData(({ id, data }: { id: string; data: string }) => {
      const current = squadRef.current;
      if (!current || !current.active || current.phase === 'paused') return;

      const clean = stripAnsi(data);

      // Builder pane data handling
      if (id === current.builderSessionId && current.phase === 'building') {
        builderBufferRef.current += clean;

        // Reset idle debounce timer
        if (idleTimerRef.current) clearTimeout(idleTimerRef.current);

        // When Builder stops typing for 4.5 seconds after producing substantial output (>60 chars)
        if (builderBufferRef.current.length > 60) {
          idleTimerRef.current = setTimeout(() => {
            if (squadRef.current?.phase === 'building') {
              setSquad((prev) => (prev ? { ...prev, phase: 'handing_off' } : null));
              setTimeout(() => {
                triggerVerification();
              }, 1200);
            }
          }, 4500);
        }
      }

      // Verifier pane data handling
      if (id === current.verifierSessionId && current.phase === 'verifying') {
        verifierBufferRef.current += clean;

        // Sniff for error patterns
        if (
          /(?:error\s+TS\d+:|TS\d{4}:|FAIL\s+|Tests:\s+\d+\s+failed|AssertionError|Traceback \(most recent call last\):|error\[E\d+\]:|npm ERR!)/i.test(
            clean
          )
        ) {
          errorDetectedRef.current = (errorDetectedRef.current || '') + '\n' + clean.trim();
        }

        // Reset idle debounce timer for verification completion
        if (idleTimerRef.current) clearTimeout(idleTimerRef.current);

        if (verifierBufferRef.current.length > 40) {
          idleTimerRef.current = setTimeout(() => {
            if (squadRef.current?.phase === 'verifying') {
              if (errorDetectedRef.current) {
                // Verification failed -> trigger auto repair loop
                triggerRepair(errorDetectedRef.current);
              } else if (
                /(?:PASS|passed|ok|0 failed|build successful|Compiled successfully)/i.test(
                  verifierBufferRef.current
                )
              ) {
                // Verification passed!
                setSquad((prev) => (prev ? { ...prev, phase: 'consensus' } : null));
              }
            }
          }, 3500);
        }
      }
    });

    return () => {
      unsubscribe();
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    };
  }, [triggerVerification, triggerRepair]);

  const togglePause = useCallback(() => {
    setSquad((prev) => {
      if (!prev) return null;
      const nextPhase: SquadPhase = prev.phase === 'paused' ? 'building' : 'paused';
      return { ...prev, phase: nextPhase };
    });
  }, []);

  const forceHandoff = useCallback(() => {
    const current = squadRef.current;
    if (!current) return;

    if (current.phase === 'building' || current.phase === 'paused') {
      setSquad((prev) => (prev ? { ...prev, phase: 'handing_off' } : null));
      setTimeout(() => triggerVerification(), 500);
    } else if (current.phase === 'verifying') {
      if (errorDetectedRef.current) {
        triggerRepair(errorDetectedRef.current);
      } else {
        triggerRepair(verifierBufferRef.current || 'Tests completed with status check requested.');
      }
    }
  }, [triggerVerification, triggerRepair]);

  const stopSquad = useCallback(() => {
    if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    setSquad(null);
  }, []);

  return {
    squad,
    startSquad,
    togglePause,
    forceHandoff,
    stopSquad,
  };
};
