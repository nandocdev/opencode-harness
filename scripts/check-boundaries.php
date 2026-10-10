<?php

declare(strict_types=1);

/**
 * Deterministic modular architecture gate (R1/R2/R3).
 *
 * Scans module directories directly under src/ and checks cross-module imports.
 * Public cross-module surfaces: Application\\Contracts, Application\\DTOs,
 * and IntegrationEvents. This lightweight check is not a full PHP AST analysis.
 *
 * Usage: php scripts/check-boundaries.php [source-directory]
 */

$srcRoot = rtrim($argv[1] ?? 'src', DIRECTORY_SEPARATOR);
if (!is_dir($srcRoot)) {
    fwrite(STDERR, "ERROR: expected source directory does not exist: {$srcRoot}\\n");
    exit(1);
}

$modules = array_values(array_filter(
    glob($srcRoot . DIRECTORY_SEPARATOR . '*', GLOB_ONLYDIR) ?: [],
    static fn (string $path): bool => basename($path) !== 'Shared'
));
if ($modules === []) {
    fwrite(STDERR, "ERROR: no module directories found directly under {$srcRoot}; cannot verify boundaries.\\n");
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
        if (str_contains($path, DIRECTORY_SEPARATOR . $moduleName . DIRECTORY_SEPARATOR)) {
            $owner = $moduleName;
            break;
        }
    }
    if ($owner === null) {
        continue;
    }

    $contents = file_get_contents($path);
    if ($contents === false) {
        fwrite(STDERR, "ERROR: unable to read {$path}\\n");
        exit(1);
    }

    $references = [];
    if (preg_match_all('/^\\s*use\\s+([^;]+);/m', $contents, $matches)) {
        foreach ($matches[1] as $importList) {
            foreach (explode(',', $importList) as $import) {
                $import = preg_replace('/\\s+as\\s+\\w+/i', '', trim($import));
                if ($import !== '') {
                    $references[] = trim($import, " \\\\t\\n\\r\\\\");
                }
            }
        }
    }
    if (preg_match_all('~\\\\\\\\[A-Za-z_][A-Za-z0-9_]*(?:\\\\\\\\[A-Za-z_][A-Za-z0-9_]*)+~', $contents, $matches)) {
        $references = array_merge($references, $matches[0]);
    }

    foreach (array_unique($references) as $reference) {
        $segments = explode('\\\\', trim($reference, '\\\\'));
        foreach ($moduleNames as $targetModule) {
            if ($targetModule === $owner) {
                continue;
            }
            $position = array_search($targetModule, $segments, true);
            if ($position === false || !isset($segments[$position + 1])) {
                continue;
            }
            $tail = array_slice($segments, $position + 1);
            $isPublic = ($tail[0] ?? null) === 'Application'
                && in_array($tail[1] ?? null, ['Contracts', 'DTOs', 'IntegrationEvents'], true)
                || ($tail[0] ?? null) === 'IntegrationEvents';
            if (!$isPublic) {
                $violations[] = sprintf('%s -> %s (cross-module import outside public surface)', $path, $reference);
            }
        }
    }
}

if ($violations !== []) {
    fwrite(STDERR, count($violations) . " module boundary violation(s):\\n");
    foreach (array_unique($violations) as $violation) {
        fwrite(STDERR, "  {$violation}\\n");
    }
    exit(1);
}
echo "OK: no detected R1/R2/R3 violations under {$srcRoot}\\n";
