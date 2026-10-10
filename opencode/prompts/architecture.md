# Arquitectura: Monolito Modular

## Principios

- Cada módulo es dueño de su comportamiento, sus datos y su superficie pública.
- Las dependencias entre módulos apuntan a contratos explícitos, nunca a implementaciones concretas.
- La base de datos es un recurso compartido; la independencia de los módulos se mantiene en el diseño, no con restricciones artificiales.
- La complejidad se paga solo cuando compra una frontera real.

## Estructura base

```text
app/                                # LEGADO CONGELADO. Solo providers raíz, middleware global, excepciones globales.

src/                                # Todo código nuevo vive aquí
    ├── {Modulo}/                   # Módulo de dominio
    │   ├── Domain/                 # PHP puro: value objects, enums, eventos internos, excepciones
    │   ├── Application/            # Contracts, DTOs, actions, domain services e integration events
    │   ├── Infrastructure/         # Models, persistence, database, config y providers
    │   └── Presentation/           # Controllers, Livewire, routes y vistas de negocio
    └── Shared/                     # Shared Kernel mínimo, solo si cumple R8

docs/
    ├── adr/                        # Architecture Decision Records
    ├── requisitos/                 # Casos de uso y criterios de aceptación
    ├── iteraciones/                # Planes de iteración
    ├── reviews/                    # Code reviews
    ├── api/                        # OpenAPI specs
    ├── arquitectura/               # Diagramas y R1-R8
    └── runbooks/                   # Procedimientos operativos
```

## Reglas normativas

### R1 — Autocontención estricta

- Todo el comportamiento y los datos que un módulo posee viven dentro del módulo.
- PROHIBIDAS referencias `../OtroModulo/` por ruta de archivo.
- Lo que un módulo necesita de otro se consume por la superficie pública definida en R2.
- Las FKs entre módulos están prohibidas por defecto; una excepción requiere ADR y cumple la política de consistencia.

### R2 — Superficie pública limitada a contratos

| Importable desde otro módulo ✅                        | Prohibido ❌                                                 |
| ----------------------------------------------------- | ----------------------------------------------------------- |
| `OtroModulo\Application\Contracts\*`                  | `OtroModulo\Domain\*`                                       |
| `OtroModulo\Application\DTOs\*`                       | `OtroModulo\Application\Actions\*`                          |
| `OtroModulo\Application\IntegrationEvents\*`          | `OtroModulo\Infrastructure\*`                               |
| Contratos de lectura que devuelven DTOs o read models | `OtroModulo\Presentation\*`                                 |
|                                                       | Modelos Eloquent, tablas, eventos internos o lógica privada |

- Síncrono: inyección de un contrato, nunca de un concreto.
- Asíncrono: `IntegrationEvents` versionados con DTOs estables; los eventos de dominio son internos.
- Consultas cross-module: contrato de lectura o read model explícito, nunca relación Eloquent ni JOIN ad hoc.
- PROHIBIDOS `app()`, `resolve()` y facades que resuelvan implementaciones de otros módulos.
- Enums y value objects que formen parte de un contrato público se exponen desde `Application\Contracts`.

### R3 — Dirección de dependencias

```text
Presentation → Application → Domain
Infrastructure → Application → Domain
Domain → nada externo (ni Laravel, ni otros módulos, ni Shared de dominio)
```

Una capa o contrato se crea solo si reduce acoplamiento, habilita pruebas o protege una frontera real. No se imponen capas vacías por simetría.

### R4 — Provider como punto de binding y registro

- Cada módulo tiene un provider: `Infrastructure/Providers/{Modulo}ModuleProvider.php`.
- Extiende `Shared\AbstractModuleProvider` e implementa `module()`, `alias()` y `routeFiles()`.
- Registra únicamente elementos propios: bindings, config, rutas, vistas, migraciones, policies, eventos y jobs.
- PROHIBIDO bindear contratos o registrar componentes de otro módulo.

### R5 — Modelos Eloquent anémicos y escrituras por casos de uso

El modelo Eloquent solo contiene `$fillable`, `$casts`, accessors o mutators de formato, relaciones intra-módulo y scopes simples.

- HTTP, Livewire, CLI, webhooks y jobs delegan toda escritura en casos de uso de `Application`.
- La lógica de negocio, transiciones de estado, emails y colas no viven en el modelo.
- Observers solo para lógica transversal no crítica, como auditoría, caché o logs.
- Las invariantes críticas se respaldan también con constraints de base de datos.

### R6 — Acceso a datos cross-module y consistencia

- PROHIBIDO que un módulo lea o escriba directamente tablas, modelos o relaciones Eloquent de otro módulo.
- Las lecturas cross-module pasan por un contrato de consulta o un read model con DTOs propios.
- Toda relación lógica entre módulos declara quién es dueño del dato, qué ocurre al borrarlo, si la consistencia es síncrona o eventual, cómo se valida la referencia sin FK y quién compensa o reconcilia fallos parciales.
- Una FK entre módulos es una excepción que requiere ADR: ciclo de vida compartido, propietario explícito, sin cascadas y con estrategia de despliegue y borrado documentada.
- `->readonly()` no sustituye una frontera arquitectónica.

### R7 — Casos de uso y servicios por responsabilidad

- Una Action representa un caso de uso acotado y una responsabilidad clara.
- Un Domain Service aparece cuando debe coordinar invariantes o varios elementos del mismo módulo.
- El número de líneas o dependencias no es un gate: la causa es responsabilidad y cohesión.
- Un Domain Service puro no depende de Laravel; persistencia e integraciones quedan en Application e Infrastructure.

### R8 — Shared Kernel con regla del 3

Antes de añadir a `Shared/`, responde:

1. ¿Lo usarían al menos tres módulos?
2. ¿Sigue sin conocer el vocabulario ni las reglas de ningún dominio?

Si alguna respuesta es no, el código pertenece a un módulo. `Shared/` no es un lugar preasignado para tenants, dinero, usuarios u otros conceptos de negocio.

## Entradas, jobs y eventos

- Todos los puntos de entrada aplican autenticación, autorización, validación y las mismas invariantes.
- Un job de negocio debe poder ejecutarse más de una vez sin duplicar efectos.
- Define reintentos, backoff, timeout, dead-letter y alertas según criticidad.
- Usa `afterCommit` cuando el efecto dependa de una transacción confirmada.
- El scheduler usa locks o una fuente única cuando puede ejecutarse en varios nodos.
- `IntegrationEvents` se versionan y conservan compatibilidad con consumidores existentes.
- Usa outbox solo cuando exista una necesidad concreta de atomicidad entre estado y evento.

## Migraciones sin downtime

Usa expand/contract:

1. **Expand**: cambios compatibles con la versión actual.
2. **Deploy**: código compatible con el esquema anterior y el nuevo.
3. **Backfill**: por lotes, con control de carga y posibilidad de reanudar.
4. **Switch**: la aplicación usa la estructura nueva.
5. **Contract**: limpieza en un release posterior.

No elimines columnas ni renombres en el mismo release en que dejas de usarlas. Evalúa lock timeouts y queries bloqueantes.

## Anti-patrones

- `use OtroModulo\Domain\*` o `OtroModulo\Infrastructure\*`
- Lógica de negocio en modelos, providers, vistas o puntos de entrada
- Queries Eloquent, `belongsTo`, `hasMany` o joins hacia datos de otro módulo
- `app()` o `resolve()` con implementaciones de otro módulo
- Dependencia de eventos internos o acciones de otro módulo
- Código de dominio en `Shared/`
- Dependencias o efectos externos dentro de una transacción
- Migraciones destructivas sin expand/contract y forward-fix

## Checklist de creación de módulo nuevo

1. Crear el árbol mínimo de `Domain`, `Application`, `Infrastructure` y `Presentation`; añadir jobs, listeners y policies solo si aplican.
2. Declarar el namespace en `composer.json` y ejecutar `composer dump-autoload`.
3. Crear `{Modulo}ModuleProvider` extendiendo `AbstractModuleProvider`.
4. Registrar el provider en `bootstrap/providers.php`.
5. Definir rutas contra Actions, contratos de lectura y DTOs propios.
6. Registrar vistas con el namespace del módulo y permisos de autorización en cada punto de entrada.
7. Añadir tests de comportamiento, factories y el test de arquitectura (p. ej. `pest-plugin-arch`) que prohíba imports prohibidos.
8. Documentar en `docs/arquitectura/` cualquier límite de módulo que no sea evidente.