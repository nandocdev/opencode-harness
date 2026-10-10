import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, cpSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const repositoryRoot = resolve(import.meta.dirname, '..');
const validator = join(repositoryRoot, 'scripts/validate-agents.mjs');

function fixture(configOverrides = {}) {
  const root = mkdtempSync(join(tmpdir(), 'opencode-config-'));
  mkdirSync(join(root, 'opencode', 'agents'), { recursive: true });
  mkdirSync(join(root, 'opencode', 'prompts'), { recursive: true });
  writeFileSync(join(root, 'opencode', 'prompts', 'architecture.md'), '# Architecture\n');
  writeFileSync(join(root, 'opencode', 'prompts', 'conventions.md'), '# Conventions\n');
  writeFileSync(join(root, 'opencode', 'agents', 'orchestrator.md'), [
    '---',
    'description: Coordinate work',
    'mode: primary',
    'permission:',
    '  edit: deny',
    '  bash:',
    '    "*": deny',
    '---',
    '# Orchestrator',
    ''
  ].join('\n'));
  const config = {
    default_agent: 'orchestrator',
    instructions: ['opencode/prompts/architecture.md', 'opencode/prompts/conventions.md'],
    permission: { '*': 'ask', bash: { '*': 'ask' } },
    mcp: {},
    ...configOverrides
  };
  writeFileSync(join(root, 'opencode.json'), JSON.stringify(config, null, 2));
  return root;
}

function runValidator(root) {
  return spawnSync(process.execPath, [validator], { cwd: root, encoding: 'utf8' });
}

test('accepts a valid least-privilege harness configuration', () => {
  const root = fixture();
  try {
    const result = runValidator(root);
    assert.equal(result.status, 0, result.stderr || result.stdout);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('rejects wildcard allow permissions in global configuration', () => {
  const root = fixture({ permission: { '*': 'allow', bash: { '*': 'allow' } } });
  try {
    const result = runValidator(root);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /permisos globales demasiado permisivos/i);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('requires the orchestrator to be the default agent', () => {
  const root = fixture({ default_agent: 'tech-lead' });
  try {
    const result = runValidator(root);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /default_agent debe ser orchestrator/i);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
