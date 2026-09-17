export class MockCliAdapter {
    name;
    binaryPath = 'mock-cli';
    attemptCount = 0;
    shouldFailVerificationFirst = false;
    constructor(name = 'mock', shouldFailVerificationFirst = false) {
        this.name = name;
        this.shouldFailVerificationFirst = shouldFailVerificationFirst;
    }
    async isAvailable() {
        return true;
    }
    async getVersion() {
        return '1.0.0-mock';
    }
    async execute(prompt, options = {}) {
        this.attemptCount++;
        const startTime = Date.now();
        // Check if this is an adversarial review prompt
        if (prompt.includes('Adversarial Review') || prompt.includes('CRITICAL') || prompt.includes('git diff')) {
            const mockReview = `
### Adversarial Code Review Report
Overall Verdict: PASS

[FINDINGS]
- Severity: WARNING
  Category: EDGE_CASE
  File: src/auth/token.ts
  Line: 42
  Title: Potential Race Condition in Token Refresh
  Description: Concurrent refresh requests might exchange the same refresh token twice.
  Recommendation: Implement a mutex or Redis lock for atomic rotation.

- Severity: INFO
  Category: GENERAL
  File: src/auth/token.ts
  Line: 12
  Title: Explicit Expiration Constant
  Description: Using an explicit named constant for expiration seconds improves readability.
  Recommendation: Move literal 3600 to TOKEN_EXPIRATION_SECONDS.
[/FINDINGS]

Summary: The code is well-structured and safe. No critical vulnerabilities found. Minor edge case identified.
`;
            if (options.onStdout)
                options.onStdout(mockReview);
            return {
                exitCode: 0,
                stdout: mockReview,
                stderr: '',
                executionTimeMs: Date.now() - startTime,
                timedOut: false,
            };
        }
        // Check if this is a self-correction repair prompt
        if (prompt.includes('Verification failed') || prompt.includes('Şu hatayı aldık')) {
            const repairOutput = `[Self-Correction Applied]: Fixed TypeScript compiler type mismatch error in patch #1.`;
            if (options.onStdout)
                options.onStdout(repairOutput);
            return {
                exitCode: 0,
                stdout: repairOutput,
                stderr: '',
                executionTimeMs: Date.now() - startTime,
                timedOut: false,
            };
        }
        // Normal generation prompt
        const standardOutput = `[${this.name} Output]: Processed user prompt successfully. Changes staged for verification.`;
        if (options.onStdout)
            options.onStdout(standardOutput);
        return {
            exitCode: 0,
            stdout: standardOutput,
            stderr: '',
            executionTimeMs: Date.now() - startTime,
            timedOut: false,
        };
    }
}
