import { appendFileSync, existsSync, mkdirSync, renameSync, statSync, unlinkSync } from 'node:fs';
import { dirname } from 'node:path';

export type LogLevel = 'error' | 'warn' | 'info';

/**
 * An append-only log file that never grows past `maxBytes`: when full it
 * becomes `<file>.1` (replacing the older one) and a new file starts.
 * Writing never throws, so logging an error can't cause another one.
 */
export class LogFile {
  constructor(readonly file: string, private readonly maxBytes = 2 * 1024 * 1024) {}

  write(level: LogLevel, source: string, message: string): void {
    const line = `${new Date().toISOString()} ${level.toUpperCase().padEnd(5)} [${source}] ${message.replace(/\r?\n/g, '\n    ')}\n`;
    try {
      mkdirSync(dirname(this.file), { recursive: true });
      if (existsSync(this.file) && statSync(this.file).size + line.length > this.maxBytes) {
        const old = `${this.file}.1`;
        if (existsSync(old)) unlinkSync(old);
        renameSync(this.file, old);
      }
      appendFileSync(this.file, line, 'utf-8');
    } catch {
      // Nowhere left to report it.
    }
  }
}

/** A thrown value as text, with its stack when there is one. */
export function describeError(value: unknown): string {
  if (value instanceof Error) return value.stack || `${value.name}: ${value.message}`;
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}
