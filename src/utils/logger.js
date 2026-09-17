import pc from 'picocolors';
export const logger = {
    banner(title, subtitle) {
        console.log();
        console.log(pc.bold(pc.cyan('╔══════════════════════════════════════════════════════════════╗')));
        console.log(pc.bold(pc.cyan(`║  ⚡ ${title.padEnd(56)}║`)));
        if (subtitle) {
            console.log(pc.cyan(`║     ${pc.dim(subtitle).padEnd(65)}║`));
        }
        console.log(pc.bold(pc.cyan('╚══════════════════════════════════════════════════════════════╝')));
        console.log();
    },
    step(current, total, message) {
        console.log(`${pc.cyan(`[${current}/${total}]`)} ${pc.bold(message)}`);
    },
    info(message) {
        console.log(`${pc.blue('ℹ')} ${message}`);
    },
    success(message) {
        console.log(`${pc.green('✔')} ${pc.green(message)}`);
    },
    warn(message) {
        console.log(`${pc.yellow('⚠')} ${pc.yellow(message)}`);
    },
    error(message, error) {
        console.error(`${pc.red('✖')} ${pc.red(message)}`);
        if (error instanceof Error && error.stack) {
            console.error(pc.dim(error.stack));
        }
        else if (error) {
            console.error(pc.dim(String(error)));
        }
    },
    model(name, message) {
        console.log(`${pc.magenta(`[Model: ${name}]`)} ${message}`);
    },
    streamChunk(chunk) {
        process.stdout.write(pc.dim(chunk));
    },
    divider() {
        console.log(pc.dim('─'.repeat(64)));
    }
};
