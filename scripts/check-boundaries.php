<?php

declare(strict_types=1);

/**
 * Gate determinista de arquitectura modular (R1/R2/R3).
 *
 * Escanea src/Modulos/*/ y verifica que ningún módulo importe clases de
 * otro módulo por fuera de la superficie pública permitida:
 *   Modulo\...\Application\Contracts, Modulo\...\DTOs, Modulo\...\IntegrationEvents
 *
 * Salida: lista de violaciones "archivo:línea -> import". Exit 1 si hay violaciones.
 * Uso: php scripts/check-boundaries.php [ruta-src]
 */

$srcRoot = $argv[1] ?? 'src';
$publicSuffixes = ['Application\\Contracts', 'DTOs', 'IntegrationEvents'];

if (!is_dir($srcRoot)) {
    fwrite(STDERR, "No existe el directorio {$srcRoot}; nothing to check.\n");
    exit(0);
}

// Descubrir módulos: subdirectorios de src/Modulos (ajustar a la convención real)
$modulesDir = rtrim($srcRoot, '/') . '/Modulos';
$modules = is_dir($modulesDir) ? array_filter(glob($modulesDir . '/*', GLOB_ONLYDIR), 'is_dir') : [];
$moduleNames = array_map('basename', $modules);

$violations = [];
$rii = new RecursiveIteratorIterator(new RecursiveDirectoryIterator($srcRoot, FilesystemIterator::SKIP_DOTS));

foreach ($rii as $file) {
    if (!$file->isFile() || $file->getExtension() !== 'php') {
        continue;
    }
    $path = $file->getPathname();
    // Determinar módulo dueño del archivo
    $owner = null;
    foreach ($moduleNames as $m) {
        if (str_contains($path, "/Modulos/{$m}/")) {
            $owner = $m;
            break;
        }
    }
    $lines = file($path);
    foreach ($lines as $i => $line) {
        if (!preg_match('/^use\s+([^;\s]+);/', trim($line), $mt)) {
            continue;
        }
        $fqcn = $mt[1];
        foreach ($moduleNames as $m) {
            if ($m === $owner) {
                continue; // import interno del módulo: permitido
            }
            // Detectar referencia a otra raíz de módulo (patrones típicos App\Domain\Modulos\M o Modulos\M)
            if (preg_match('/(App\\\\)?Domain\\\\Modulos\\\\' . preg_quote($m, '/') . '\\\\|Modulos\\\\' . preg_quote($m, '/') . '\\\\/', $fqcn)) {
                $isPublic = false;
                foreach ($publicSuffixes as $suffix) {
                    if (str_contains($fqcn, '\\' . $suffix . '\\')) {
                        $isPublic = true;
                        break;
                    }
                }
                if (!$isPublic) {
                    $violations[] = sprintf('%s:%d -> %s (cross-module fuera de superficie pública)', $path, $i + 1, $fqcn);
                }
            }
        }
    }
}

if ($violations === []) {
    echo "OK: sin violaciones R1/R2/R3 en {$srcRoot}\n";
    exit(0);
}

fwrite(STDERR, count($violations) . " violación(es) de fronteras entre módulos:\n");
foreach ($violations as $v) {
    fwrite(STDERR, "  " . $v . "\n");
}
exit(1);
