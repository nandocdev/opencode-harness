#!/usr/bin/env node
/**
 * Validador de coherencia de la configuración opencode.
 * - opencode.json debe ser JSON válido y llamarse exactamente así (no "opemcode.json").
 * - Cada agente debe tener frontmatter con description, mode y permission.
 * - Principio de mínimo privilegio: ningún agente (salvo excepciones listadas)
 *   puede tener bash "*": allow ni edit: allow sin deny por defecto.
 * - Los paths de instructions deben existir.
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

let failures = [];
const ok = (c, msg) => { if (!c) failures.push(msg); };

// 1. Config principal
ok(existsSync('opencode.json'), 'Falta opencode.json (¿typo "opemcode.json"?)');
if (existsSync('opemcode.json')) failures.push('Existe opemcode.json (typo): renombrar a opencode.json');
let cfg = null;
if (existsSync('opencode.json')) {
  try { cfg = JSON.parse(readFileSync('opencode.json', 'utf8')); }
  catch (e) { failures.push('opencode.json no es JSON válido: ' + e.message); }
}
if (cfg) {
  for (const p of cfg.instructions ?? []) ok(existsSync(p), `instruction inexistente: ${p}`);
  for (const [name, mcp] of Object.entries(cfg.mcp ?? {})) {
    const headers = JSON.stringify(mcp.headers ?? {});
    ok(!/STITCH-API-KEY|YOUR[_-]?KEY|placeholder/i.test(headers), `mcp "${name}": API key placeholder hardcodeada`);
  }
}

// 2. Agentes
const agentsDir = 'opencode/agents';
const parseFront = (t) => {
  const m = t.match(/^---\n([\s\S]*?)\n---/);
  return m ? m[1] : null;
};
for (const f of readdirSync(agentsDir).filter((x) => x.endsWith('.md'))) {
  const t = readFileSync(join(agentsDir, f), 'utf8');
  const fm = parseFront(t);
  ok(fm !== null, `${f}: falta frontmatter`);
  if (!fm) continue;
  ok(/description:/.test(fm), `${f}: falta description`);
  ok(/mode:\s*(primary|subagent)/.test(fm), `${f}: mode inválido o ausente`);
  // mínimo privilegio: bash no puede abrir el mundo
  const bashBlock = fm.match(/bash:\n((?:\s+.*\n)+)/);
  if (bashBlock && /"\*":\s*allow/.test(bashBlock[1])) {
    failures.push(`${f}: bash tiene "*": allow — exigir default-deny con allowlist explícita`);
  }
  const editBlock = fm.match(/edit:\n((?:\s+.*\n)+)/);
  if (editBlock && !/"\*":\s*deny/.test(editBlock[1]) && !/^\s*edit:\s*allow/m.test(fm) === false) {
    // edit: allow global solo permitido en tech-lead (ejecutor)
    if (f !== 'tech-lead.md' && !/"\*":\s*deny/.test(editBlock[1])) {
      failures.push(`${f}: edit sin default-deny — requiere alcance explícito`);
    }
  }
  if (!/"\*":\s*deny/.test(editBlock?.[0] ?? '') && !/edit:\s*deny/.test(fm) && f !== 'tech-lead.md') {
    failures.push(`${f}: permisos demasiado laxos`);
  }
}

// 3. Un solo primary orquestador
const primaries = readdirSync(agentsDir).filter((x) => x.endsWith('.md')).filter((f) => /mode:\s*primary/.test(parseFront(readFileSync(join(agentsDir, f), 'utf8')) ?? ''));
ok(primaries.length === 1 && primaries[0] === 'orchestrator.md', `debe existir un único primary (orchestrator.md); encontrados: ${primaries.join(', ') || 'ninguno'}`);

if (failures.length) {
  console.error('FAIL:\n - ' + failures.join('\n - '));
  process.exit(1);
}
console.log('OK: configuración opencode coherente (permisos, archivos, MCPs, orquestador único)');
