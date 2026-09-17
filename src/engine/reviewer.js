import * as p from '@clack/prompts';
import pc from 'picocolors';
import { GitUtils } from '../git/gitUtils.js';
import { logger } from '../utils/logger.js';
export class AdversarialReviewer {
    contextBus;
    gitUtils;
    cwd;
    constructor(contextBus, options = {}) {
        this.contextBus = contextBus;
        this.cwd = options.cwd ?? process.cwd();
        this.gitUtils = new GitUtils(this.cwd);
    }
    /**
     * Prompts the secondary CLI to conduct an adversarial code review of git diff.
     */
    async reviewChanges(reviewerAdapter) {
        const diffResult = this.gitUtils.getDiff();
        if (!diffResult.hasChanges) {
            return {
                reviewerName: reviewerAdapter.name,
                passed: true,
                summary: 'No changes detected in working tree to review.',
                findings: [],
                rawReview: '',
                diffAnalyzed: '',
            };
        }
        logger.info(`Starting Adversarial Review with ${pc.cyan(reviewerAdapter.name)} on ${diffResult.filesChanged.length} file(s)...`);
        const reviewPrompt = [
            `You are an elite, highly adversarial Senior Security & Systems Architect.`,
            `Your task is to conduct an uncompromising, paranoid code review on the following git diff.`,
            ``,
            `Examine strictly for:`,
            `1. SECURITY: Secret leaks, OWASP top 10, injection, broken authentication/authorization, untrusted deserialization.`,
            `2. MEMORY & RESOURCE LEAKS: Unclosed file/socket handles, unbounded collections, event listener leaks, timer leaks.`,
            `3. EDGE CASES & RELIABILITY: Race conditions, unhandled exceptions, null/undefined hazards, missing input validations.`,
            ``,
            `GIT DIFF TO REVIEW:`,
            `\`\`\`diff`,
            diffResult.diff,
            `\`\`\``,
            ``,
            `Output your review in the following strict block format:`,
            `[FINDINGS]`,
            `- Severity: CRITICAL | WARNING | SUGGESTION | INFO`,
            `  Category: SECURITY | MEMORY_LEAK | EDGE_CASE | SYNTAX | GENERAL`,
            `  File: <path/to/file>`,
            `  Line: <approximate line>`,
            `  Title: <Short concise finding title>`,
            `  Description: <Detailed explanation>`,
            `  Recommendation: <Concrete remediation>`,
            `[/FINDINGS]`,
            `Summary: <One paragraph executive summary and verdict>`,
        ].join('\n');
        this.contextBus.recordLog('REVIEW', 'info', `Running adversarial review with ${reviewerAdapter.name}`);
        const result = await reviewerAdapter.execute(reviewPrompt, {
            cwd: this.cwd,
        });
        const report = this.parseReviewOutput(reviewerAdapter.name, result.stdout, diffResult.diff);
        this.contextBus.saveLog('adversarial-review', result.stdout);
        this.contextBus.updateManifest({
            reviewerAdapter: reviewerAdapter.name,
            reviewPassed: report.passed,
        });
        return report;
    }
    /**
     * Parses semi-structured text output from the model into formal ReviewFinding objects.
     */
    parseReviewOutput(reviewerName, rawText, diff) {
        const findings = [];
        const findingsMatch = rawText.match(/\[FINDINGS\]([\s\S]*?)\[\/FINDINGS\]/i);
        if (findingsMatch && findingsMatch[1]) {
            const entries = findingsMatch[1].split(/(?=- Severity:)/i).filter((s) => s.trim().length > 0);
            for (const entry of entries) {
                const severityMatch = entry.match(/Severity:\s*(CRITICAL|WARNING|SUGGESTION|INFO)/i);
                const categoryMatch = entry.match(/Category:\s*(SECURITY|MEMORY_LEAK|EDGE_CASE|SYNTAX|GENERAL)/i);
                const fileMatch = entry.match(/File:\s*([^\r\n]+)/i);
                const lineMatch = entry.match(/Line:\s*(\d+)/i);
                const titleMatch = entry.match(/Title:\s*([^\r\n]+)/i);
                const descMatch = entry.match(/Description:\s*([^\r\n]+(?:\r?\n(?!\s*(?:Recommendation:|\S+:))[^\r\n]+)*)/i);
                const recMatch = entry.match(/Recommendation:\s*([^\r\n]+(?:\r?\n(?!\s*\S+:)[^\r\n]+)*)/i);
                if (titleMatch) {
                    const severity = severityMatch?.[1]?.toUpperCase() || 'INFO';
                    findings.push({
                        severity,
                        category: categoryMatch?.[1]?.toUpperCase() || 'GENERAL',
                        file: fileMatch?.[1]?.trim(),
                        line: lineMatch ? parseInt(lineMatch[1], 10) : undefined,
                        title: titleMatch[1].trim(),
                        description: descMatch ? descMatch[1].trim() : '',
                        recommendation: recMatch ? recMatch[1].trim() : undefined,
                    });
                }
            }
        }
        // Extract summary
        const summaryMatch = rawText.match(/Summary:\s*([^\r\n]+(?:[\r\n]+[^\r\n]+)*)/i);
        const summary = summaryMatch ? summaryMatch[1].trim() : rawText.slice(0, 300).trim();
        const hasCritical = findings.some((f) => f.severity === 'CRITICAL');
        return {
            reviewerName,
            passed: !hasCritical,
            summary,
            findings,
            rawReview: rawText,
            diffAnalyzed: diff,
        };
    }
    /**
     * Renders the interactive terminal approval modal using @clack/prompts.
     */
    async presentInteractiveReview(report) {
        p.intro(pc.bold(pc.bgMagenta(pc.white(' 🛡️ ADVERSARIAL CODE REVIEW REPORT '))));
        if (report.findings.length === 0) {
            p.note('No vulnerabilities, leaks, or major edge cases reported!', pc.green('✔ Clean Bill of Health'));
        }
        else {
            console.log();
            for (const finding of report.findings) {
                let badge = pc.blue('[INFO]');
                if (finding.severity === 'CRITICAL')
                    badge = pc.bold(pc.bgRed(pc.white(' CRITICAL ')));
                else if (finding.severity === 'WARNING')
                    badge = pc.bold(pc.yellow('⚠ WARNING'));
                else if (finding.severity === 'SUGGESTION')
                    badge = pc.cyan('💡 SUGGESTION');
                const location = finding.file ? ` (${pc.underline(finding.file)}${finding.line ? `:${finding.line}` : ''})` : '';
                console.log(` ${badge} ${pc.bold(finding.title)}${location}`);
                console.log(`   ${pc.dim('Category:')} ${finding.category}`);
                console.log(`   ${finding.description}`);
                if (finding.recommendation) {
                    console.log(`   ${pc.green('Remedy:')} ${finding.recommendation}`);
                }
                console.log();
            }
        }
        p.note(report.summary, pc.bold(`Review Summary (${report.reviewerName})`));
        const decision = await p.select({
            message: pc.bold('Review complete. What action do you want to take?'),
            options: [
                {
                    value: 'APPROVE',
                    label: pc.green('✔ Approve & Keep Changes'),
                    hint: 'Keep code in working tree',
                },
                {
                    value: 'REQUEST_FIX',
                    label: pc.yellow('🔄 Request Model Fix'),
                    hint: 'Send adversarial findings back to primary CLI to remediate',
                },
                {
                    value: 'DISCARD',
                    label: pc.red('✖ Discard & Rollback All Changes'),
                    hint: 'Git reset --hard and clean working tree',
                },
            ],
        });
        if (p.isCancel(decision)) {
            p.cancel('Operation cancelled by user.');
            return 'DISCARD';
        }
        if (decision === 'DISCARD') {
            this.gitUtils.revertAllChanges();
            p.log.warn(pc.red('Changes rolled back. Working directory restored to clean state.'));
        }
        else if (decision === 'APPROVE') {
            p.log.success(pc.green('Changes approved by developer!'));
        }
        p.outro(pc.dim('Adversarial review cycle concluded.'));
        return decision;
    }
}
