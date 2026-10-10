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
    fwrite(STDERR, "ERROR: no existe el directorio fuente esperado: {$srcRoot}\n");
    exit(1);
}

$modulesDir = rtrim($srcRoot, DIRECTORY_SEPARATOR) . DIRECTORY_SEPARATOR . 'Modulos';
if (!is_dir($modulesDir)) {
    fwrite(STDERR, "ERROR: no existe el directorio de módulos esperado: {$modulesDir}\n");
    exit(1);
}

$modules = array_values(array_filter(glob($modulesDir . DIRECTORY_SEPARATOR . '*', GLOB_ONLYDIR) ?: [], 'is_dir'));
if ($modules === []) {
    fwrite(STDERR, "ERROR: no se encontraron módulos en {$modulesDir}; no es posible verificar fronteras.\n");
    exit(1);
}

$moduleNames = array_map('basename', $modules);
$violations = [];
$rii = new RecursiveIteratorIterator(new RecursiveDirectoryIterator($srcRoot, FilesystemIterator::SKIP_DOTS));

foreach ($rii as $file) {
    if (!$file->isFile() || $file->getExtension() !== 'php') {
        continue;
    }

    $path = $file->getPathname();
    $owner = null;
    foreach ($moduleNames as $moduleName) {
        if (str_contains($path, DIRECTORY_SEPARATOR . 'Modulos' . DIRECTORY_SEPARATOR . $moduleName . DIRECTORY_SEPARATOR)) {
            $owner = $moduleName;
            break;
        }
    }

    $lines = file($path);
    if ($lines === false) {
        fwrite(STDERR, "ERROR: no se pudo leer {$path}\n");
        exit(1);
    }

    foreach ($lines as $index => $line) {
        if (!preg_match('/^use\s+([^;\s]+);/', trim($line), $matches)) {
            continue;
        }

        $fqcn = $matches[1];
        foreach ($moduleNames as $targetModule) {
            if ($targetModule === $owner) {
                continue;
            }

            $pattern = '/(App\\\\)?Domain\\\\Modulos\\\\' . preg_quote($targetModule, '/') . '\\\\|Modulos\\\\' . preg_quote($targetModule, '/') . '\\\\/';
            if (!preg_match($pattern, $fqcn)) {
                continue;
            }

            $isPublic = false;
            foreach ($publicSuffixes as $suffix) {
                if (str_contains($fqcn, '\\' . $suffix . '\\')) {
                    $isPublic = true;
                    break;
                }
            }

            if (!$isPublic) {
                $violations[] = sprintf('%s:%d -> %s (cross-module fuera de superficie pública)', $path, $index + 1, $fqcn);
            }
        }
    }
}

if ($violations !== []) {
    fwrite(STDERR, count($violations) . " violación(es) de fronteras entre módulos:\n");
    foreach ($violations as $violation) {
        fwrite(STDERR, "  {$violation}\n");
    }
    exit(1);
}

echo "OK: sin violaciones R1/R2/R3 en {$srcRoot}\n";
