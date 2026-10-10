<?php

declare(strict_types=1);

/** Smoke tests for the architecture gate, using isolated temporary fixtures. */

$checker = __DIR__ . '/check-boundaries.php';
$tempRoot = sys_get_temp_dir() . '/opencode-boundaries-' . bin2hex(random_bytes(6));

function runChecker(string $checker, string $source): array
{
    $command = escapeshellarg(PHP_BINARY) . ' ' . escapeshellarg($checker) . ' ' . escapeshellarg($source) . ' 2>&1';
    exec($command, $output, $status);

    return [$status, implode("\n", $output)];
}

function writeFixture(string $path, string $content): void
{
    if (!is_dir(dirname($path))) {
        mkdir(dirname($path), 0777, true);
    }
    file_put_contents($path, $content);
}

try {
    mkdir($tempRoot);
    [$status] = runChecker($checker, $tempRoot . '/missing');
    if ($status === 0) {
        throw new RuntimeException('A missing source directory must fail.');
    }

    mkdir($tempRoot . '/without-modules');
    [$status] = runChecker($checker, $tempRoot . '/without-modules');
    if ($status === 0) {
        throw new RuntimeException('A missing Modulos directory must fail.');
    }

    $src = $tempRoot . '/valid/src';
    writeFixture($src . '/Modulos/Billing/Service.php', "<?php\nnamespace App\\Domain\\Modulos\\Billing;\nuse App\\Domain\\Modulos\\Orders\\Application\\Contracts\\OrderReader;\n");
    writeFixture($src . '/Modulos/Orders/Application/Contracts/OrderReader.php', "<?php\nnamespace App\\Domain\\Modulos\\Orders\\Application\\Contracts;\n");
    [$status, $output] = runChecker($checker, $src);
    if ($status !== 0) {
        throw new RuntimeException('Public contract import should pass: ' . $output);
    }

    writeFixture($src . '/Modulos/Billing/Service.php', "<?php\nnamespace App\\Domain\\Modulos\\Billing;\nuse App\\Domain\\Modulos\\Orders\\Infrastructure\\SqlOrderReader;\n");
    [$status, $output] = runChecker($checker, $src);
    if ($status === 0) {
        throw new RuntimeException('A private cross-module import must fail.');
    }

    echo "OK: check-boundaries tests passed\n";
} finally {
    $iterator = new RecursiveIteratorIterator(
        new RecursiveDirectoryIterator($tempRoot, FilesystemIterator::SKIP_DOTS),
        RecursiveIteratorIterator::CHILD_FIRST
    );
    foreach ($iterator as $entry) {
        $entry->isDir() ? rmdir($entry->getPathname()) : unlink($entry->getPathname());
    }
    rmdir($tempRoot);
}
