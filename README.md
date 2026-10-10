# opencode-harness

Configuración multi-agente para [OpenCode](https://opencode.ai) orientada a un monolito modular Laravel (dominio HorariosWFM/OPSIS).

## Estructura

```
opencode.json            # configuración principal (¡no "opemcode.json"!)
opencode/
  agents/                # agentes: 1 primary (orchestrator) + subagentes especialistas
  prompts/               # instrucciones normativas (architecture.md, conventions.md)
scripts/
  validate-agents.mjs    # coherencia de permisos/config (gate determinista)
  check-boundaries.php   # fronteras entre módulos R1/R2/R3 (gate determinista)
.github/workflows/
  quality-gates.yml      # enforcement en CI: pint, pest, arquitectura, secret scan
```

La carpeta `opencode/` (sin punto) se usa deliberadamente para poder versionarla en Git.

## Modelo de agentes

| Agente | Modo | Rol | Escrito | Bash |
| --- | --- | --- | --- | --- |
| `orchestrator` | primary | Clasifica riesgo, delega, verifica gates | ✗ | solo lectura git |
| `tech-lead` | subagent | Ejecutor técnico e integrador | ✓ | allowlist checks |
| `planner` | subagent | Planes y ADRs | docs/adr, docs/requisitos | solo lectura |
| `domain-expert` | subagent | Autoridad de negocio (SME) | docs/requisitos | ✗ |
| `backend` / `frontend` / `dba` | subagent | Implementación por capa | src acotado | allowlist checks |
| `devops` | subagent | CI/CD e infra | docker/, .github/, deploy/ | ✗ |
| `secqa` | subagent | Tests y seguridad OWASP | tests/, docs/reviews | allowlist checks |
| `review` | subagent | Code review independiente R1-R8 | docs/reviews | solo lectura git |
| `git` | subagent | Commits, releases, changelog | CHANGELOG.md | git write = ask |

Principios: separación coordinador/ejecutor (SRP), mínimo privilegio con default-deny, handoffs como artefactos versionados (`docs/adr`, `docs/requisitos`, `docs/reviews`) y gates verificables en CI además de las instrucciones al modelo.

## Validación local

```bash
node scripts/validate-agents.mjs
php scripts/check-boundaries.php src
```

## Secretos

El MCP `stitch` lee `STITCH_API_KEY` del entorno (`{env:STITCH_API_KEY}`) y está deshabilitado por defecto. Nunca hardcodear API keys en `opencode.json`.
