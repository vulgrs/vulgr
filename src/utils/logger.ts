import pc from 'picocolors';

export const logger = {
  banner(title: string, subtitle?: string): void {
    console.log();
    console.log(pc.bold(pc.cyan('╔══════════════════════════════════════════════════════════════╗')));
    console.log(pc.bold(pc.cyan(`║  ⚡ ${title.padEnd(56)}║`)));
    if (subtitle) {
      console.log(pc.cyan(`║     ${pc.dim(subtitle).padEnd(65)}║`));
    }
    console.log(pc.bold(pc.cyan('╚══════════════════════════════════════════════════════════════╝')));
    console.log();
  },

  step(current: number, total: number, message: string): void {
    console.log(`${pc.cyan(`[${current}/${total}]`)} ${pc.bold(message)}`);
  },

  info(message: string): void {
    console.log(`${pc.blue('ℹ')} ${message}`);
  },

  success(message: string): void {
    console.log(`${pc.green('✔')} ${pc.green(message)}`);
  },

  warn(message: string): void {
    console.log(`${pc.yellow('⚠')} ${pc.yellow(message)}`);
  },

  error(message: string, error?: unknown): void {
    console.error(`${pc.red('✖')} ${pc.red(message)}`);
    if (error instanceof Error && error.stack) {
      console.error(pc.dim(error.stack));
    } else if (error) {
      console.error(pc.dim(String(error)));
    }
  },

  model(name: string, message: string): void {
    console.log(`${pc.magenta(`[Model: ${name}]`)} ${message}`);
  },

  streamChunk(chunk: string): void {
    process.stdout.write(pc.dim(chunk));
  },

  divider(): void {
    console.log(pc.dim('─'.repeat(64)));
  }
};
