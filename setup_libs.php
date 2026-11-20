<?php
/**
 * WebNotes - Automatischer Library-Downloader & Setup-Prüfung (setup_libs.php)
 * Lädt pdf.min.js, pdf.worker.min.js (Mozilla PDF.js) und jspdf.umd.min.js (jsPDF)
 * in den lokalen Ordner ./libs/, falls sie dort noch fehlen oder leer sind.
 */

declare(strict_types=1);
error_reporting(E_ALL);
ini_set('display_errors', '0');

$libsDir = __DIR__ . '/libs';
$dataDir = __DIR__ . '/data';
$notebooksDir = $dataDir . '/notebooks';

$requiredLibs = [
    'pdf.min.js' => [
        'url' => 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js',
        'min_size' => 100000
    ],
    'pdf.worker.min.js' => [
        'url' => 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js',
        'min_size' => 300000
    ],
    'jspdf.umd.min.js' => [
        'url' => 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js',
        'min_size' => 100000
    ]
];

function downloadRemoteFile(string $url, string $destPath): array {
    // 1. Versuch: cURL (bevorzugt auf Shared Hosting)
    if (function_exists('curl_init')) {
        $ch = curl_init($url);
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_FOLLOWLOCATION => true,
            CURLOPT_MAXREDIRS      => 5,
            CURLOPT_TIMEOUT        => 30,
            CURLOPT_CONNECTTIMEOUT => 10,
            CURLOPT_SSL_VERIFYPEER => true,
            CURLOPT_USERAGENT      => 'WebNotes-Setup/1.0'
        ]);
        $data = curl_exec($ch);
        $httpCode = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $err = curl_error($ch);
        curl_close($ch);

        if ($data !== false && $httpCode >= 200 && $httpCode < 300 && strlen($data) > 1024) {
            if (file_put_contents($destPath, $data, LOCK_EX) !== false) {
                return ['ok' => true, 'method' => 'curl', 'bytes' => strlen($data)];
            }
        }
    }

    // 2. Fallback: file_get_contents mit Stream Context
    if ( filter_var(ini_get('allow_url_fopen'), FILTER_VALIDATE_BOOLEAN) || ini_get('allow_url_fopen') === '1' ) {
        $ctx = stream_context_create([
            'http' => [
                'method'  => 'GET',
                'timeout' => 30,
                'header'  => "User-Agent: WebNotes-Setup/1.0\r\n"
            ]
        ]);
        $data = @file_get_contents($url, false, $ctx);
        if ($data !== false && strlen($data) > 1024) {
            if (file_put_contents($destPath, $data, LOCK_EX) !== false) {
                return ['ok' => true, 'method' => 'stream', 'bytes' => strlen($data)];
            }
        }
    }

    return ['ok' => false, 'error' => $err ?? 'Download fehlgeschlagen (weder cURL noch allow_url_fopen erfolgreich).'];
}

function ensureDirectories(string $libsDir, string $dataDir, string $notebooksDir): array {
    $messages = [];
    foreach ([$libsDir, $dataDir, $notebooksDir] as $dir) {
        if (!is_dir($dir)) {
            if (@mkdir($dir, 0755, true)) {
                $messages[] = "Ordner erstellt: " . basename($dir);
            } else {
                $messages[] = "FEHLER: Konnte Ordner nicht erstellen: " . basename($dir);
            }
        }
    }

    // .htaccess Schutz in ./data sicherstellen
    $htaccessPath = $dataDir . '/.htaccess';
    if (!file_exists($htaccessPath)) {
        $htaccessContent = "<IfModule mod_authz_core.c>\n    Require all denied\n</IfModule>\n<IfModule !mod_authz_core.c>\n    Order deny,allow\n    Deny from all\n</IfModule>\nOptions -Indexes\n";
        @file_put_contents($htaccessPath, $htaccessContent, LOCK_EX);
        $messages[] = ".htaccess Schutz in ./data/ angelegt.";
    }

    // index.html Leerseite als zusätzlicher Schutz in ./data/
    $indexGuard = $dataDir . '/index.html';
    if (!file_exists($indexGuard)) {
        @file_put_contents($indexGuard, "<!DOCTYPE html><html><head><meta charset='utf-8'><title>403 Forbidden</title></head><body></body></html>", LOCK_EX);
    }

    return $messages;
}

$dirMessages = ensureDirectories($libsDir, $dataDir, $notebooksDir);
$forceRefresh = isset($_GET['force']) && $_GET['force'] === '1';
$results = [];
$allReady = true;

foreach ($requiredLibs as $filename => $meta) {
    $filePath = $libsDir . '/' . $filename;
    $existsAndValid = file_exists($filePath) && filesize($filePath) >= $meta['min_size'];

    if ($existsAndValid && !$forceRefresh) {
        $results[$filename] = [
            'status' => 'present',
            'bytes'  => filesize($filePath),
            'note'   => 'Bereits lokal vorhanden'
        ];
        continue;
    }

    $dl = downloadRemoteFile($meta['url'], $filePath);
    if ($dl['ok'] && filesize($filePath) >= $meta['min_size']) {
        $results[$filename] = [
            'status' => 'downloaded',
            'bytes'  => $dl['bytes'],
            'method' => $dl['method'],
            'note'   => 'Erfolgreich heruntergeladen'
        ];
    } else {
        $allReady = false;
        $results[$filename] = [
            'status' => 'error',
            'bytes'  => file_exists($filePath) ? filesize($filePath) : 0,
            'note'   => $dl['error'] ?? 'Datei zu klein oder Download blockiert'
        ];
    }
}

// Falls per JSON/AJAX von der App aufgerufen (?format=json)
if ((isset($_GET['format']) && $_GET['format'] === 'json') ||
    (isset($_SERVER['HTTP_ACCEPT']) && strpos($_SERVER['HTTP_ACCEPT'], 'application/json') !== false)) {
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode([
        'ok'          => $allReady,
        'directories' => $dirMessages,
        'libraries'   => $results,
        'writable'    => [
            'libs'      => is_writable($libsDir),
            'data'      => is_writable($dataDir),
            'notebooks' => is_writable($notebooksDir)
        ]
    ], JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE);
    exit;
}

// HTML-Ausgabe bei direktem Browser-Aufruf
header('Content-Type: text/html; charset=utf-8');
?>
<!DOCTYPE html>
<html lang="de">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>WebNotes – System- & Library-Setup</title>
    <style>
        body {
            font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
            background: #f2f3f5;
            color: #1e293b;
            margin: 0;
            padding: 32px 16px;
        }
        .card {
            max-width: 680px;
            margin: 0 auto;
            background: #ffffff;
            border-radius: 14px;
            box-shadow: 0 8px 24px rgba(0, 0, 0, 0.08);
            overflow: hidden;
        }
        .header {
            background: #2b579a;
            color: #ffffff;
            padding: 20px 24px;
            display: flex;
            align-items: center;
            justify-content: space-between;
        }
        .header h1 {
            margin: 0;
            font-size: 1.25rem;
            font-weight: 600;
        }
        .content {
            padding: 24px;
        }
        table {
            width: 100%;
            border-collapse: collapse;
            margin: 16px 0 24px;
        }
        th, td {
            text-align: left;
            padding: 12px;
            border-bottom: 1px solid #e2e8f0;
            font-size: 0.95rem;
        }
        th {
            color: #64748b;
            font-weight: 600;
            font-size: 0.82rem;
            text-transform: uppercase;
        }
        .badge {
            display: inline-block;
            padding: 4px 10px;
            border-radius: 999px;
            font-size: 0.8rem;
            font-weight: 600;
        }
        .badge-ok { background: #dcfce7; color: #166534; }
        .badge-err { background: #fee2e2; color: #991b1b; }
        .actions {
            display: flex;
            gap: 12px;
            margin-top: 20px;
        }
        .btn {
            display: inline-block;
            text-decoration: none;
            padding: 10px 18px;
            border-radius: 8px;
            font-weight: 600;
            font-size: 0.92rem;
            background: #2b579a;
            color: #ffffff;
        }
        .btn-secondary {
            background: #e2e8f0;
            color: #1e293b;
        }
    </style>
</head>
<body>
    <div class="card">
        <div class="header">
            <h1>WebNotes – Lokale Bibliotheken & Server-Check</h1>
            <span><?= $allReady ? 'Bereit ✓' : 'Aktion erforderlich' ?></span>
        </div>
        <div class="content">
            <p>Alle Bibliotheken werden DSGVO-konform lokal in <code>./libs/</code> vorgehalten (keine externen CDNs zur Laufzeit).</p>
            <table>
                <thead>
                    <tr>
                        <th>Datei</th>
                        <th>Größe</th>
                        <th>Status</th>
                    </tr>
                </thead>
                <tbody>
                    <?php foreach ($results as $file => $info): ?>
                    <tr>
                        <td><code>./libs/<?= htmlspecialchars($file) ?></code></td>
                        <td><?= number_format($info['bytes'] / 1024, 1, ',', '.') ?> KB</td>
                        <td>
                            <?php if ($info['status'] !== 'error'): ?>
                                <span class="badge badge-ok">✓ <?= htmlspecialchars($info['note']) ?></span>
                            <?php else: ?>
                                <span class="badge badge-err">✕ <?= htmlspecialchars($info['note']) ?></span>
                            <?php endif; ?>
                        </td>
                    </tr>
                    <?php endforeach; ?>
                </tbody>
            </table>

            <p><strong>Schreibrechte auf dem Webspace:</strong><br>
                <code>./libs/</code>: <?= is_writable($libsDir) ? 'Beschreibbar ✓' : 'Nicht beschreibbar ✕' ?> &nbsp;|&nbsp;
                <code>./data/</code>: <?= is_writable($dataDir) ? 'Beschreibbar ✓' : 'Nicht beschreibbar ✕' ?> &nbsp;|&nbsp;
                <code>./data/notebooks/</code>: <?= is_writable($notebooksDir) ? 'Beschreibbar ✓' : 'Nicht beschreibbar ✕' ?>
            </p>

            <div class="actions">
                <a class="btn" href="index.html">Zu WebNotes starten →</a>
                <a class="btn btn-secondary" href="setup_libs.php?force=1">Bibliotheken neu herunterladen</a>
            </div>
        </div>
    </div>
</body>
</html>
