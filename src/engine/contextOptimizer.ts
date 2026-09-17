/**
 * Context & Token Optimizer Engine
 *
 * Prevents prompt bloat and memory leaks by stripping ANSI codes,
 * collapsing redundant progress bars/spinners, squashing repetitive log lines,
 * and performing intelligent sliding-window truncation.
 */

export interface OptimizeOptions {
  maxLines?: number;
  maxBytes?: number;
  preserveHeadLines?: number;
  preserveTailLines?: number;
  squashDuplicates?: boolean;
}

export class ContextOptimizer {
  private static readonly ANSI_REGEX = /\x1B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])/g;

  /**
   * Strips ANSI escape codes, VT100 control codes, and backspaces.
   */
  static cleanAnsi(text: string): string {
    if (!text) return '';
    return text
      .replace(this.ANSI_REGEX, '')
      .replace(/\x08/g, '') // Backspaces
      .replace(/\r\n/g, '\n');
  }

  static stripAnsi(text: string): string {
    return this.cleanAnsi(text);
  }

  /**
   * Removes command-line spinner/progress bar overwrites (e.g. npm [==  ] 20%)
   */
  static cleanSpinners(text: string): string {
    if (!text) return '';
    const lines = text.split('\n').map((line) => {
      const lastSegment = line.split('\r').pop();
      return lastSegment !== undefined ? lastSegment : line;
    });
    return lines.join('\n');
  }

  /**
   * Squashes consecutive identical lines (e.g. repeated warnings or build ticks).
   */
  static squashDuplicateLines(lines: string[]): string[] {
    const result: string[] = [];
    let prevLine = '';
    let duplicateCount = 0;

    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed === prevLine && trimmed.length > 0) {
        duplicateCount++;
      } else {
        if (duplicateCount > 1) {
          result.push(`  ... [repeated ${duplicateCount - 1} more times]`);
        }
        result.push(line);
        prevLine = trimmed;
        duplicateCount = 1;
      }
    }

    if (duplicateCount > 1) {
      result.push(`  ... [repeated ${duplicateCount - 1} more times]`);
    }

    return result;
  }

  /**
   * Optimizes terminal output or compiler traces for AI prompts and storage.
   * Keeps top lines for command context and bottom lines for actual failure/stack trace.
   */
  static optimizeTerminalLog(raw: string, options: OptimizeOptions = {}): string {
    if (!raw) return '';

    const maxLines = options.maxLines ?? 60;
    const maxBytes = options.maxBytes ?? 8192;
    const preserveHead = options.preserveHeadLines ?? 15;
    const preserveTail = options.preserveTailLines ?? 40;

    let cleaned = this.cleanAnsi(raw);
    cleaned = this.cleanSpinners(cleaned);

    let lines = cleaned.split('\n');

    if (options.squashDuplicates !== false) {
      lines = this.squashDuplicateLines(lines);
    }

    if (lines.length > maxLines) {
      const head = lines.slice(0, preserveHead);
      const tail = lines.slice(-preserveTail);
      const omittedCount = lines.length - preserveHead - preserveTail;

      lines = [
        ...head,
        `\n--- [✂️ Context Optimizer: ${omittedCount} intermediate lines omitted to save tokens] ---\n`,
        ...tail,
      ];
    }

    let result = lines.join('\n');

    if (Buffer.byteLength(result, 'utf-8') > maxBytes) {
      result = result.slice(-maxBytes);
      result = `[Context truncated to ${maxBytes} bytes]...\n` + result;
    }

    return result.trim();
  }

  /**
   * Compacts large git diffs so agents don't blow token context windows.
   */
  static optimizeDiff(diff: string, maxLines = 100): string {
    if (!diff) return '';

    const cleaned = this.cleanAnsi(diff);
    const lines = cleaned.split('\n');

    if (lines.length <= maxLines) {
      return cleaned.trim();
    }

    // Keep header hunk and tail, replace middle
    const headCount = Math.floor(maxLines * 0.4);
    const tailCount = Math.floor(maxLines * 0.6);
    const omitted = lines.length - headCount - tailCount;

    const compacted = [
      ...lines.slice(0, headCount),
      `\n@@ ... [Diff compacted: ${omitted} lines omitted to stay within token budget] ... @@\n`,
      ...lines.slice(-tailCount),
    ].join('\n');

    return compacted.trim();
  }

  /**
   * Quick heuristic token estimator (~4 chars per token).
   */
  static estimateTokenCost(text: string): number {
    if (!text) return 0;
    return Math.ceil(text.length / 4);
  }
}
