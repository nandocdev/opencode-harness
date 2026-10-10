#!/usr/bin/env node
/**
 * Structural validation for OpenCode configuration and agent policy.
 * Runtime permission resolution still requires integration tests against OpenCode.
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const failures = [];
const ok = (condition, message) => { if (!condition) failures.push(message); };
const agentsDirectory = '.opencode/agents';
ok(existsSync('opencode.json'), 'Missing opencode.json');
let config = null;
if (existsSync('opencode.json')) {
  try { config = JSON.parse(readFileSync('opencode.json', 'utf8')); }
  catch (error) { failures.push('opencode.json is not valid JSON: ' + error.message); }
}
if (config) {
  ok(config.default_agent === 'orchestrator', 'default_agent must be orchestrator');
  ok(config.experimental?.subagent_depth === 1, 'experimental.subagent_depth must be 1');
  ok(config.instructions === undefined, 'Use root AGENTS.md instead of config.instructions');
  const permissions = config.permission ?? config.permissions ?? {};
  ok(permissions['*'] !== 'allow', 'Global wildcard permission must not be allow');
  ok(permissions.bash?.['*'] !== 'allow' && permissions.shell?.['*'] !== 'allow', 'Global shell wildcard permission must not be allow');
  ok(existsSync('AGENTS.md'), 'Missing root AGENTS.md');
  ok(config.mcp?.['laravel-boost']?.enabled !== true, 'laravel-boost must be disabled outside a Laravel application');
  for (const [name, mcp] of Object.entries(config.mcp ?? {})) {
    ok(!/STITCH-API-KEY|YOUR[_-]?KEY|placeholder/i.test(JSON.stringify(mcp.headers ?? {})), `MCP "${name}" contains a hardcoded key placeholder`);
  }
}
const parseFrontmatter = (content) => content.match(/^---\n([\s\S]*?)\n---/)?.[1] ?? null;
const agents = new Map();
if (!existsSync(agentsDirectory)) {
  failures.push(`Agent directory not found: ${agentsDirectory}`);
} else {
  for (const file of readdirSync(agentsDirectory).filter((item) => item.endsWith('.md'))) {
    const content = readFileSync(join(agentsDirectory, file), 'utf8');
    const fm = parseFrontmatter(content);
    ok(fm !== null, `${file}: missing frontmatter`);
    if (!fm) continue;
    agents.set(file, fm);
    ok(/^description:\s*\S+/m.test(fm), `${file}: missing description`);
    ok(/^mode:\s*(primary|subagent)\s*$/m.test(fm), `${file}: invalid/missing mode`);
    const primary = /^mode:\s*primary\s*$/m.test(fm);
    if (!primary) ok(/^  task:\s*deny\s*$/m.test(fm) || /^  task:\n    "\*":\s*deny\s*$/m.test(fm), `${file}: subagent must explicitly deny further task delegation`);
    const bashBlock = fm.match(/^  bash:\n((?:    .*\n)*)/m)?.[1] ?? '';
    ok(!/^    "\*":\s*allow\s*$/m.test(bashBlock), `${file}: bash wildcard allow is forbidden`);
    if (file !== 'tech-lead.md') {
      const editBlock = fm.match(/^  edit:\n((?:    .*\n)*)/m)?.[1] ?? '';
      ok(!/^  edit:\s*allow\s*$/m.test(fm) && (/^  edit:\s*deny\s*$/m.test(fm) || /^    "\*":\s*deny\s*$/m.test(editBlock)), `${file}: edit must default to deny`);
    }
  }
  const primaries = [...agents.entries()].filter(([, fm]) => /^mode:\s*primary\s*$/m.test(fm)).map(([file]) => file);
  ok(primaries.length === 1 && primaries[0] === 'orchestrator.md', `Expected orchestrator as the only primary agent; found ${primaries.join(', ') || 'none'}`);
  const taskBlock = (agents.get('orchestrator.md') ?? '').match(/^  task:\n((?:    .*\n)*)/m)?.[1] ?? '';
  const allowlist = [...taskBlock.matchAll(/^    "([^"]+)":\s*allow\s*$/gm)].map((match) => match[1]);
  for (const name of allowlist) {
    const target = agents.get(`${name}.md`);
    ok(target !== undefined, `orchestrator allows missing agent "${name}"`);
    if (target) ok(/^mode:\s*subagent\s*$/m.test(target), `orchestrator target "${name}" must be a subagent`);
  }
}
if (failures.length) {
  console.error('FAIL:\n - ' + failures.join('\n - '));
  process.exit(1);
}
console.log('OK: OpenCode configuration and agent policy are structurally consistent');
