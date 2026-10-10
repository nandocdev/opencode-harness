<?php

declare(strict_types=1);

/** Regression tests for the architecture gate using isolated fixtures. */

$checker = __DIR__ . '/check-boundaries.php';
$tempRoot = sys_get_temp_dir() . '/opencode-boundaries-' . bin2hex(random_bytes(6));

function runChecker(string $checker, string $source): array
{
    exec(escapeshellarg(PHP_BINARY) . ' ' . escapeshellarg($checker) . ' ' . escapeshellarg($source) . ' 2>&1', $output, $status);
    return [$status, implode("\\n", $output)];
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

    mkdir($tempRoot . '/empty-src');
    [$status] = runChecker($checker, $tempRoot . '/empty-src');
    if ($status === 0) {
        throw new RuntimeException('A source directory without modules must fail.');
    }

    $src = $tempRoot . '/valid/src';
    writeFixture($src . '/Billing/Service.php', "<?php\\nnamespace App\\\\Billing;\\nuse App\\\\Orders\\\\Application\\\\Contracts\\\\OrderReader as Reader;\\n");
    writeFixture($src . '/Orders/Application/Contracts/OrderReader.php', "<?php\\nnamespace App\\\\Orders\\\\Application\\\\Contracts;\\n");
    [$status, $output] = runChecker($checker, $src);
    if ($status !== 0) {
        throw new RuntimeException('Aliased public contract import should pass: ' . $output);
    }

    writeFixture($src . '/Billing/Service.php', "<?php\\nnamespace App\\\\Billing;\\nuse App\\\\Orders\\\\Infrastructure\\\\SqlOrderReader;\\n");
    [$status, $output] = runChecker($checker, $src);
    if ($status === 0) {
        throw new RuntimeException('Private cross-module import must fail: ' . $output);
    }

    writeFixture($src . '/Billing/Service.php', "<?php\\nnamespace App\\\\Billing;\\nclass Service { public function run(): object { return new \\\\App\\\\Orders\\\\Infrastructure\\\\SqlOrderReader(); } }\\n");
    [$status, $output] = runChecker($checker, $src);
    if ($status === 0) {
        throw new RuntimeException('Fully qualified private cross-module reference must fail: ' . $output);
    }
    echo "OK: check-boundaries tests passed\\n";
} finally {
    $iterator = new RecursiveIteratorIterator(new RecursiveDirectoryIterator($tempRoot, FilesystemIterator::SKIP_DOTS), RecursiveIteratorIterator::CHILD_FIRST);
    foreach ($iterator as $entry) {
        $entry->isDir() ? rmdir($entry->getPathname()) : unlink($entry->getPathname());
    }
    rmdir($tempRoot);
}
