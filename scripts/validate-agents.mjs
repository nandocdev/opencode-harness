#!/usr/bin/env node
/**
 * Deterministic validation for OpenCode configuration and agent policy.
 * This is a structural policy check, not a substitute for runtime permission tests.
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const failures = [];
const ok = (condition, message) => { if (!condition) failures.push(message); };

ok(existsSync('opencode.json'), 'Falta opencode.json (¿typo "opemcode.json"?)');
if (existsSync('opemcode.json')) failures.push('Existe opemcode.json (typo): renombrar a opencode.json');

let config = null;
if (existsSync('opencode.json')) {
  try {
    config = JSON.parse(readFileSync('opencode.json', 'utf8'));
  } catch (error) {
    failures.push('opencode.json no es JSON válido: ' + error.message);
  }
}

if (config) {
  ok(config.default_agent === 'orchestrator', 'default_agent debe ser orchestrator para respetar el flujo de coordinación');
  const globalPermission = config.permission ?? {};
  ok(globalPermission['*'] !== 'allow', 'permisos globales demasiado permisivos: permission.* no debe ser allow');
  ok(globalPermission.bash?.['*'] !== 'allow', 'permisos globales demasiado permisivos: permission.bash.* no debe ser allow');

  for (const instruction of config.instructions ?? []) {
    ok(existsSync(instruction), `instruction inexistente: ${instruction}`);
  }

  for (const [name, mcp] of Object.entries(config.mcp ?? {})) {
    const headers = JSON.stringify(mcp.headers ?? {});
    ok(!/STITCH-API-KEY|YOUR[_-]?KEY|placeholder/i.test(headers), `mcp "${name}": API key placeholder hardcodeada`);
  }
}

const agentsDirectory = 'opencode/agents';
if (!existsSync(agentsDirectory)) {
  failures.push(`directorio de agentes inexistente: ${agentsDirectory}`);
} else {
  const files = readdirSync(agentsDirectory).filter((file) => file.endsWith('.md'));
  const parseFrontmatter = (content) => {
    const match = content.match(/^---\n([\s\S]*?)\n---/);
    return match ? match[1] : null;
  };

  for (const file of files) {
    const content = readFileSync(join(agentsDirectory, file), 'utf8');
    const frontmatter = parseFrontmatter(content);
    ok(frontmatter !== null, `${file}: falta frontmatter`);
    if (!frontmatter) continue;

    ok(/^description:\s*\S+/m.test(frontmatter), `${file}: falta description`);
    ok(/^mode:\s*(primary|subagent)\s*$/m.test(frontmatter), `${file}: mode inválido o ausente`);

    const bashBlock = frontmatter.match(/^  bash:\n((?:    .*\n)*)/m)?.[1] ?? '';
    ok(!/^    "\*":\s*allow\s*$/m.test(bashBlock), `${file}: bash tiene wildcard allow; exigir allowlist explícita`);

    if (file !== 'tech-lead.md') {
      const editBlock = frontmatter.match(/^  edit:\n((?:    .*\n)*)/m)?.[1] ?? '';
      const globalEditAllow = /^  edit:\s*allow\s*$/m.test(frontmatter);
      const explicitlyDenied = /^  edit:\s*deny\s*$/m.test(frontmatter) || /^    "\*":\s*deny\s*$/m.test(editBlock);
      ok(!globalEditAllow && explicitlyDenied, `${file}: edit requiere deny explícito por defecto`);
    }
  }

  const primaryAgents = files.filter((file) => /^mode:\s*primary\s*$/m.test(parseFrontmatter(readFileSync(join(agentsDirectory, file), 'utf8')) ?? ''));
  ok(primaryAgents.length === 1 && primaryAgents[0] === 'orchestrator.md', `debe existir un único primary (orchestrator.md); encontrados: ${primaryAgents.join(', ') || 'ninguno'}`);
}

if (failures.length > 0) {
  console.error('FAIL:\n - ' + failures.join('\n - '));
  process.exit(1);
}
console.log('OK: configuración OpenCode coherente (agente primario, permisos globales, archivos, MCPs)');
