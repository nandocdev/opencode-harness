# Convenciones de código

## PHP

- **Curly braces siempre**: incluso para cuerpos de una línea
- **Constructor property promotion**: `public function __construct(public GitHub $github) { }`
- **Return types explícitos**: `function isAccessible(User $user, ?string $path = null): bool`
- **Enums en TitleCase**: `FavoritePerson`, `BestLake`, `Monthly`
- **PHPDoc sobre comentarios inline**: Solo comentarios inline para lógica excepcionalmente compleja
- **Array shapes en PHPDoc**: usa `@param array{name: string, age: int} $data`

## Testing con Pest

- **Crear tests**: `php artisan make:test --pest {name}` y ubica el archivo según la estructura de `tests/` del proyecto
- **Ejecutar tests narrow**: `php artisan test --compact --filter=testName` o `vendor/bin/pest path/to/Test.php`
- **Tests feature > unit**: La mayoría de tests deben ser feature tests
- **Factories en tests**: Usa factories para crear modelos, verifica estados custom antes de setear manualmente
- **Faker**: Usa `$this->faker->word()` o `fake()->randomDigit()` según convención existente
- **No tests para**: cambios de estilo, layout, copy puro
- **Sí tests para**: cambios de comportamiento y lógica, con cobertura de modos de fallo importantes

## Formateo automático con Pint

Después de modificar cualquier archivo PHP, ejecuta:
```bash
vendor/bin/pint --dirty --format agent
```

## Artisan commands

- **Crear archivos**: Usa `php artisan make:` (migration, controller, model, etc.)
- **Descubrir comandos**: `php artisan list`
- **Ver parámetros**: `php artisan [command] --help`
- **Inspeccionar rutas**: `php artisan route:list` con filtros `--method=GET`, `--name=users`, `--path=api`
- **Leer config**: `php artisan config:show app.name` o lee archivos en `config/`
- **Non-interactive**: Pasa `--no-interaction` a todos los comandos Artisan

### Creación de modelos

Al crear un modelo nuevo, crea también factories y seeders útiles. Pregunta al usuario si necesita algo más usando `php artisan make:model --help` para ver opciones disponibles.

## Documentación obligatoria por agente

Estructura fija en `docs/`. Cada carpeta tiene UN agente dueño — nadie más escribe ahí, y el dueño no delega la escritura:

```text
docs/
├── adr/                    # Architecture Decision Records
├── requisitos/             # Casos de uso
├── iteraciones/            # Planes de iteración
├── reviews/                # Code reviews
├── api/                    # OpenAPI specs
├── arquitectura/           # Diagramas, R1-R8
└── runbooks/               # Procedimientos operativos
```

| Carpeta              | Contenido                                                                   | Dueño                                           | Cuándo se escribe (gate)                                                                                   | Estado         |
| -------------------- | --------------------------------------------------------------------------- | ----------------------------------------------- | ---------------------------------------------------------------------------------------------------------- | -------------- |
| `docs/adr/`          | ADR de decisiones cross-módulo                                              | `@planner`                                      | Tarea clasificada Compleja (impacto cross-módulo, `Shared/`, patrón nuevo — ver `planner.md`)               | ✅ Implementado |
| `docs/requisitos/`   | Caso de uso resumido: actor, flujo principal, criterios de aceptación       | `@planner`                                      | Tarea Estándar o Compleja, como parte de la sección "Análisis" del plan                                    | ✅ Implementado |
| `docs/iteraciones/`  | Plan de implementación tal como se ejecutó, con resultado real vs. estimado | `@tech-lead`                                    | Al cerrar el pipeline (después del paso 7 — solo si el usuario pidió persistir la iteración)                | ✅ Implementado |
| `docs/reviews/`      | Code review completo, mismo formato que ya usa `@review` en su respuesta    | `@review`                                       | Cada invocación de `@review`, sin importar el veredicto                                                    | ✅ Implementado |
| `docs/api/`          | OpenAPI spec                                                                | `@backend` o `@frontend` (quien defina la ruta) | Solo si el endpoint es público o lo consume otro módulo vía HTTP — nunca para rutas internas de un Livewire component | ✅ Implementado |
| `docs/arquitectura/` | R1-R8, diagramas                                                            | —                                               | No se reescribe aquí. La fuente única es `prompts/architecture.md`; aquí solo enlaces o diagramas propios  | ✅ Implementado |
| `docs/runbooks/`     | Procedimientos operativos repetibles (deploy, rollback, incidente)          | `@devops`                                       | Cuando `@devops` define un procedimiento que se va a repetir — no para cada deploy trivial                 | ✅ Implementado |

**Regla general**: una carpeta sin dueño con `write: true` y sin gate explícito es una carpeta vacía dentro de 3 meses. No la crees hasta que el agente correspondiente esté cableado para escribir ahí.

## Decisiones persistentes en `.ai/rules`

Si existe el directorio `.ai/rules/` en el repo:

1. **Antes de crear/editar cualquier archivo**: 
   - Lee `.ai/rules/index.md` (mapea globs a archivos de reglas)
   - Lee TODOS los archivos de reglas cuyos globs cubran el path en scope
   - Ejecuta `grep -rin 'keyword' .ai/rules` para capturar reglas que el path match no cubra

2. **No escribas código** hasta haber leído y seguido todas las reglas aplicables

3. **Registrar nuevas reglas**: Solo cuando el usuario lo pida explícitamente

4. **Instrucciones para el trabajo actual NO son reglas**: "usa X aquí", "corrige este typo" son trabajo, no reglas persistentes