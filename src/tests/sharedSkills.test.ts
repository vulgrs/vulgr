import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import {
  SharedSkillsRegistry,
  extractPlaceholders,
  interpolateSkillCommand,
  BUILTIN_SKILLS,
} from '../engine/sharedSkills.js';

describe('SharedSkills Suite', () => {
  const testFileName = '.test-skills.json';
  const testFilePath = join(process.cwd(), testFileName);

  beforeEach(() => {
    if (existsSync(testFilePath)) {
      unlinkSync(testFilePath);
    }
  });

  afterEach(() => {
    if (existsSync(testFilePath)) {
      unlinkSync(testFilePath);
    }
  });

  it('loads built-in skills across git, docker, node, and ai categories', () => {
    const registry = new SharedSkillsRegistry(process.cwd(), testFileName);
    const gitSkills = registry.listSkills('git');
    const dockerSkills = registry.listSkills('docker');
    const aiSkills = registry.listSkills('ai');

    assert.ok(gitSkills.length >= 3);
    assert.ok(dockerSkills.length >= 3);
    assert.ok(aiSkills.length >= 2);
  });

  it('extracts placeholder variables correctly from command templates', () => {
    const template = 'docker run -d -p {{host_port}}:{{container_port}} --name {{name}} {{image}}';
    const placeholders = extractPlaceholders(template);

    assert.strictEqual(placeholders.length, 4);
    assert.ok(placeholders.includes('host_port'));
    assert.ok(placeholders.includes('container_port'));
    assert.ok(placeholders.includes('name'));
    assert.ok(placeholders.includes('image'));
  });

  it('interpolates command template with provided values and parameter defaults', () => {
    const template = 'git checkout -b {{branch_name}}';
    const interpolated = interpolateSkillCommand(
      template,
      { branch_name: 'feature/user-auth' },
      [{ name: 'branch_name', label: 'Branch', description: '', defaultValue: 'main' }]
    );
    assert.strictEqual(interpolated, 'git checkout -b feature/user-auth');

    // Fallback to default
    const fallback = interpolateSkillCommand(
      template,
      {},
      [{ name: 'branch_name', label: 'Branch', description: '', defaultValue: 'main' }]
    );
    assert.strictEqual(fallback, 'git checkout -b main');
  });

  it('saves and deletes custom user skills', () => {
    const registry = new SharedSkillsRegistry(process.cwd(), testFileName);
    const custom = registry.saveCustomSkill({
      id: 'custom:k8s-rollout',
      name: 'K8s Rollout Restart',
      category: 'custom',
      description: 'Restart deployment rollout',
      commandTemplate: 'kubectl rollout restart deployment/{{deployment}}',
      parameters: [{ name: 'deployment', label: 'Deployment', description: '', defaultValue: 'web' }],
      tags: ['k8s', 'deploy'],
    });

    assert.strictEqual(custom.id, 'custom:k8s-rollout');
    assert.strictEqual(custom.isCustom, true);

    const fetched = registry.getSkill('custom:k8s-rollout');
    assert.ok(fetched);
    assert.strictEqual(fetched.name, 'K8s Rollout Restart');

    const deleted = registry.deleteCustomSkill('custom:k8s-rollout');
    assert.strictEqual(deleted, true);
    assert.strictEqual(registry.getSkill('custom:k8s-rollout'), undefined);
  });

  it('generates a concise prompt summary for AI agent discovery', () => {
    const registry = new SharedSkillsRegistry(process.cwd(), testFileName);
    const summary = registry.getSkillsPromptSummary();

    assert.ok(summary.includes('[Available Shared Skills]'));
    assert.ok(summary.includes('git:commit_all'));
    assert.ok(summary.includes('docker:run_container'));
  });
});
