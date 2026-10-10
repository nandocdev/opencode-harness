import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const repositoryRoot = resolve(import.meta.dirname, '..');
const validator = join(repositoryRoot, 'scripts/validate-agents.mjs');
function agent(name, mode = 'subagent', task = '  task: deny') {
  return ['---', `description: ${name}`, `mode: ${mode}`, 'permission:', '  edit:', '    "*": deny', task, '  bash:', '    "*": deny', '---', `# ${name}`, ''].join('\n');
}
function fixture(configOverrides = {}, extraAgents = {}) {
  const root = mkdtempSync(join(tmpdir(), 'opencode-config-'));
  mkdirSync(join(root, '.opencode', 'agents'), { recursive: true });
  writeFileSync(join(root, 'AGENTS.md'), '# Rules\n');
  writeFileSync(join(root, '.opencode', 'agents', 'orchestrator.md'), agent('orchestrator', 'primary', ['  task:', '    "*": deny', '    "tech-lead": allow'].join('\n')));
  writeFileSync(join(root, '.opencode', 'agents', 'tech-lead.md'), agent('tech-lead'));
  for (const [name, content] of Object.entries(extraAgents)) writeFileSync(join(root, '.opencode', 'agents', name + '.md'), content);
  writeFileSync(join(root, 'opencode.json'), JSON.stringify({
    default_agent: 'orchestrator',
    experimental: { subagent_depth: 1 },
    permission: { '*': 'ask', bash: { '*': 'ask' } },
    mcp: { 'laravel-boost': { enabled: false } },
    ...configOverrides
  }, null, 2));
  return root;
}
function run(root) { return spawnSync(process.execPath, [validator], { cwd: root, encoding: 'utf8' }); }

test('accepts valid least-privilege configuration', () => {
  const root = fixture();
  try { const result = run(root); assert.equal(result.status, 0, result.stderr || result.stdout); }
  finally { rmSync(root, { recursive: true, force: true }); }
});
test('rejects global wildcard allow', () => {
  const root = fixture({ permission: { '*': 'allow', bash: { '*': 'allow' } } });
  try { const result = run(root); assert.notEqual(result.status, 0); assert.match(result.stderr, /Global wildcard permission/i); }
  finally { rmSync(root, { recursive: true, force: true }); }
});
test('requires orchestrator as default agent', () => {
  const root = fixture({ default_agent: 'tech-lead' });
  try { const result = run(root); assert.notEqual(result.status, 0); assert.match(result.stderr, /default_agent must be orchestrator/i); }
  finally { rmSync(root, { recursive: true, force: true }); }
});
test('rejects missing agents in orchestrator allowlist', () => {
  const root = fixture();
  try {
    writeFileSync(join(root, '.opencode', 'agents', 'orchestrator.md'), agent('orchestrator', 'primary', ['  task:', '    "*": deny', '    "missing-agent": allow'].join('\n')));
    const result = run(root); assert.notEqual(result.status, 0); assert.match(result.stderr, /allows missing agent "missing-agent"/i);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
test('requires task denial on every subagent', () => {
  const root = fixture({}, { specialist: agent('specialist').replace('  task: deny\n', '') });
  try { const result = run(root); assert.notEqual(result.status, 0); assert.match(result.stderr, /must explicitly deny further task delegation/i); }
  finally { rmSync(root, { recursive: true, force: true }); }
});
