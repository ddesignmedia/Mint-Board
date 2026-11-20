<?php
/**
 * WebNotes – Granulares Sync-, Speicher- & Asset-Backend (api.php)
 * Optimiert für Wacom Cintiq 22 (Windows) & iPad (Apple Pencil) mit Offline-Queue & Konfliktschutz.
 */

declare(strict_types=1);
error_reporting(E_ALL);
ini_set('display_errors', '0');

// Session mit langer Lebensdauer starten
$cookieLifetime = 60 * 60 * 24 * 30; // 30 Tage
session_set_cookie_params([
    'lifetime' => $cookieLifetime,
    'path'     => '/',
    'httponly' => true,
    'samesite' => 'Lax'
]);
session_start();

define('DATA_DIR', __DIR__ . '/data');
define('NOTEBOOKS_DIR', DATA_DIR . '/notebooks');
define('AUTH_FILE', DATA_DIR . '/auth.json');
define('FOLDERS_FILE', DATA_DIR . '/folders.json');
define('AUTH_COOKIE_NAME', 'webnotes_auth_token');
define('DEFAULT_PIN', 'schule2026'); // Wird beim ersten Start als bcrypt-Hash in data/auth.json gespeichert

// Basisverzeichnisse und Schutzdateien sicherstellen
function initStorage(): void {
    foreach ([DATA_DIR, NOTEBOOKS_DIR] as $dir) {
        if (!is_dir($dir)) {
            @mkdir($dir, 0755, true);
        }
    }

    $htaccess = DATA_DIR . '/.htaccess';
    if (!file_exists($htaccess)) {
        $rules = "<IfModule mod_authz_core.c>\n    Require all denied\n</IfModule>\n<IfModule !mod_authz_core.c>\n    Order deny,allow\n    Deny from all\n</IfModule>\nOptions -Indexes\n";
        @file_put_contents($htaccess, $rules, LOCK_EX);
    }

    if (!file_exists(AUTH_FILE)) {
        $secret = bin2hex(random_bytes(32));
        $authData = [
            'passwordHash' => password_hash(DEFAULT_PIN, PASSWORD_DEFAULT),
            'cookieSecret' => $secret,
            'updatedAt'    => round(microtime(true) * 1000)
        ];
        writeJsonAtomic(AUTH_FILE, $authData);
    }

    if (!file_exists(FOLDERS_FILE)) {
        $now = (int)round(microtime(true) * 1000);
        $defaultFolders = [
            'folders' => [
                [
                    'id'        => 'fld_mint',
                    'name'      => '5 NTB – Natur & Technik',
                    'color'     => '#6ea864',
                    'createdAt' => $now,
                    'order'     => 1
                ],
                [
                    'id'        => 'fld_chemie',
                    'name'      => 'Chemie & Übungen',
                    'color'     => '#2b579a',
                    'createdAt' => $now,
                    'order'     => 2
                ],
                [
                    'id'        => 'fld_allgemein',
                    'name'      => 'Tafelanschriebe',
                    'color'     => '#d97706',
                    'createdAt' => $now,
                    'order'     => 3
                ]
            ],
            'lastModified' => $now
        ];
        writeJsonAtomic(FOLDERS_FILE, $defaultFolders);
    }
}

/**
 * Atomares Schreiben von JSON-Dateien (verhindert korrupte JSONs bei Verbindungsabbruch)
 */
function writeJsonAtomic(string $path, array $data): bool {
    $dir = dirname($path);
    if (!is_dir($dir)) {
        @mkdir($dir, 0755, true);
    }
    $json = json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_PRETTY_PRINT);
    if ($json === false) {
        return false;
    }
    $tmpFile = $path . '.tmp.' . uniqid('', true);
    if (@file_put_contents($tmpFile, $json, LOCK_EX) === false) {
        return false;
    }
    if (!@rename($tmpFile, $path)) {
        $copied = @copy($tmpFile, $path);
        @unlink($tmpFile);
        return $copied;
    }
    return true;
}

function readJsonFile(string $path, array $default = []): array {
    if (!file_exists($path)) {
        return $default;
    }
    $raw = @file_get_contents($path);
    if ($raw === false || $raw === '') {
        return $default;
    }
    $decoded = json_decode($raw, true);
    return is_array($decoded) ? $decoded : $default;
}

function sendJson(array $payload, int $statusCode = 200): void {
    http_response_code($statusCode);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');
    echo json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

function getJsonBody(): array {
    $raw = file_get_contents('php://input');
    if (!$raw) {
        return [];
    }
    $data = json_decode($raw, true);
    return is_array($data) ? $data : [];
}

function sanitizeId(string $id, string $prefix = ''): string {
    $clean = preg_replace('/[^a-zA-Z0-9_\-]/', '', $id) ?? '';
    if ($prefix !== '' && strpos($clean, $prefix) !== 0) {
        $clean = $prefix . $clean;
    }
    return substr($clean, 0, 80);
}

function nowMs(): int {
    return (int)round(microtime(true) * 1000);
}

// Authentifizierung wird bereits durch das übergeordnete /locked Portal gewährleistet
function isAuthenticated(): bool {
    return true;
}

function setAuthSessionAndCookie(): void {
    $_SESSION['webnotes_authed'] = true;
    $authData = readJsonFile(AUTH_FILE);
    $secret = $authData['cookieSecret'] ?? '';
    $token = hash_hmac('sha256', 'webnotes_valid_user', $secret . ($authData['passwordHash'] ?? ''));
    setcookie(AUTH_COOKIE_NAME, $token, [
        'expires'  => time() + (60 * 60 * 24 * 30),
        'path'     => '/',
        'httponly' => true,
        'samesite' => 'Lax'
    ]);
}

function clearAuthSessionAndCookie(): void {
    $_SESSION['webnotes_authed'] = false;
    session_destroy();
    setcookie(AUTH_COOKIE_NAME, '', [
        'expires'  => time() - 3600,
        'path'     => '/',
        'httponly' => true,
        'samesite' => 'Lax'
    ]);
}

function createEmptyPageData(string $pageId, int $timestamp): array {
    return [
        'pageId'       => $pageId,
        'lastModified' => $timestamp,
        'strokes'      => [],
        'shapes'       => [],
        'texts'        => [],
        'images'       => [],
        'stickers'     => [],
        'labItems'     => [],
        'backgroundAsset' => null
    ];
}

function ensureDefaultDemoNotebook(): void {
    // Falls noch überhaupt kein Heft existiert, erstelle ein Starter-Heft ("5 NTB" wie im Referenz-Screenshot)
    $existing = glob(NOTEBOOKS_DIR . '/nb_*', GLOB_ONLYDIR);
    if (!empty($existing)) {
        return;
    }
    $nbId = 'nb_demo_5ntb';
    $nbPath = NOTEBOOKS_DIR . '/' . $nbId;
    @mkdir($nbPath . '/assets', 0755, true);

    $now = nowMs();
    $coverPageId = 'page_cover_1';
    $firstPageId = 'page_sheet_1';

    $meta = [
        'id'           => $nbId,
        'title'        => '5 NTB – Natur und Technik',
        'folderId'     => 'fld_mint',
        'createdAt'    => $now,
        'lastModified' => $now,
        'coverStyle'   => [
            'preset'       => 'sage',       // Salbeigrün mit hellgrünem Buchrücken
            'bgColor'      => '#88b378',
            'spineColor'   => '#a3c995',
            'pattern'      => 'school_label',
            'labelTitle'   => '5 NTB',
            'labelSub'     => 'Tafelheft & Notizen'
        ],
        'pages' => [
            [
                'id'              => $coverPageId,
                'isCover'         => true,
                'paperColor'      => '#88b378',
                'paperTemplate'   => 'cover_sage',
                'backgroundAsset' => null,
                'lastModified'    => $now
            ],
            [
                'id'              => $firstPageId,
                'isCover'         => false,
                'paperColor'      => '#fbf8ee',
                'paperTemplate'   => 'grid_5mm',
                'backgroundAsset' => null,
                'lastModified'    => $now
            ]
        ]
    ];

    writeJsonAtomic($nbPath . '/meta.json', $meta);
    writeJsonAtomic($nbPath . '/page_' . $coverPageId . '.json', createEmptyPageData($coverPageId, $now));
    writeJsonAtomic($nbPath . '/page_' . $firstPageId . '.json', createEmptyPageData($firstPageId, $now));
}

function deleteDirectoryRecursive(string $dir): bool {
    if (!is_dir($dir)) {
        return true;
    }
    $items = scandir($dir);
    if ($items === false) {
        return false;
    }
    foreach ($items as $item) {
        if ($item === '.' || $item === '..') {
            continue;
        }
        $path = $dir . '/' . $item;
        if (is_dir($path)) {
            deleteDirectoryRecursive($path);
        } else {
            @unlink($path);
        }
    }
    return @rmdir($dir);
}

function copyDirectoryRecursive(string $src, string $dst): bool {
    if (!is_dir($src)) {
        return false;
    }
    @mkdir($dst, 0755, true);
    $items = scandir($src);
    if ($items === false) {
        return false;
    }
    foreach ($items as $item) {
        if ($item === '.' || $item === '..') {
            continue;
        }
        $srcPath = $src . '/' . $item;
        $dstPath = $dst . '/' . $item;
        if (is_dir($srcPath)) {
            copyDirectoryRecursive($srcPath, $dstPath);
        } else {
            @copy($srcPath, $dstPath);
        }
    }
    return true;
}

// Initialisierung ausführen
initStorage();
ensureDefaultDemoNotebook();

$action = $_GET['action'] ?? $_POST['action'] ?? '';
$body = [];
if ($_SERVER['REQUEST_METHOD'] === 'POST' && empty($_POST) && empty($_FILES)) {
    $body = getJsonBody();
    if ($action === '' && isset($body['action'])) {
        $action = (string)$body['action'];
    }
}

// Öffentliche / Auth-Endpunkte
if ($action === 'auth_status' || $action === 'ping') {
    sendJson([
        'ok'            => true,
        'authenticated' => isAuthenticated(),
        'serverTime'    => nowMs()
    ]);
}

if ($action === 'login') {
    $password = (string)($body['password'] ?? $_POST['password'] ?? '');
    $authData = readJsonFile(AUTH_FILE);
    $hash = $authData['passwordHash'] ?? '';

    if ($password !== '' && $hash !== '' && password_verify($password, $hash)) {
        setAuthSessionAndCookie();
        sendJson([
            'ok'            => true,
            'authenticated' => true,
            'serverTime'    => nowMs()
        ]);
    }
    sendJson([
        'ok'    => false,
        'error' => 'Ungültiges Passwort / PIN. (Standard beim Erststart: schule2026)'
    ], 401);
}

if ($action === 'logout') {
    clearAuthSessionAndCookie();
    sendJson(['ok' => true, 'authenticated' => false]);
}

// Alle weiteren Aktionen erfordern gültige Authentifizierung
if (!isAuthenticated()) {
    sendJson([
        'ok'            => false,
        'authenticated' => false,
        'error'         => 'Nicht angemeldet. Bitte zuerst einloggen.'
    ], 401);
}

// Passwort ändern
if ($action === 'change_password') {
    $currentPassword = (string)($body['currentPassword'] ?? '');
    $newPassword = (string)($body['newPassword'] ?? '');
    if (strlen($newPassword) < 4) {
        sendJson(['ok' => false, 'error' => 'Das neue Passwort muss mindestens 4 Zeichen lang sein.'], 400);
    }
    $authData = readJsonFile(AUTH_FILE);
    if (!password_verify($currentPassword, $authData['passwordHash'] ?? '')) {
        sendJson(['ok' => false, 'error' => 'Aktuelles Passwort ist nicht korrekt.'], 403);
    }
    $authData['passwordHash'] = password_hash($newPassword, PASSWORD_DEFAULT);
    $authData['updatedAt'] = nowMs();
    writeJsonAtomic(AUTH_FILE, $authData);
    setAuthSessionAndCookie();
    sendJson(['ok' => true]);
}

// Dashboard-Daten abrufen (Ordner + alle Hefte mit Cover & Seitenanzahl)
if ($action === 'dashboard') {
    $foldersData = readJsonFile(FOLDERS_FILE, ['folders' => []]);
    $notebooks = [];
    $dirs = glob(NOTEBOOKS_DIR . '/nb_*', GLOB_ONLYDIR) ?: [];

    foreach ($dirs as $dir) {
        $metaPath = $dir . '/meta.json';
        if (file_exists($metaPath)) {
            $meta = readJsonFile($metaPath);
            if (!empty($meta['id'])) {
                $notebooks[] = [
                    'id'           => $meta['id'],
                    'title'        => $meta['title'] ?? 'Unbenanntes Heft',
                    'folderId'     => $meta['folderId'] ?? 'fld_mint',
                    'createdAt'    => $meta['createdAt'] ?? 0,
                    'lastModified' => $meta['lastModified'] ?? 0,
                    'coverStyle'   => $meta['coverStyle'] ?? [],
                    'pageCount'    => isset($meta['pages']) && is_array($meta['pages']) ? count($meta['pages']) : 0,
                    'firstPageId'  => $meta['pages'][0]['id'] ?? null
                ];
            }
        }
    }

    // Sortiere Hefte absteigend nach letzter Änderung
    usort($notebooks, fn($a, $b) => ($b['lastModified'] <=> $a['lastModified']));

    sendJson([
        'ok'         => true,
        'folders'    => $foldersData['folders'] ?? [],
        'notebooks'  => $notebooks,
        'serverTime' => nowMs()
    ]);
}

// Ordner speichern (Anlegen, Umbenennen, Farbe ändern, Sortieren, Löschen)
if ($action === 'save_folders') {
    $folders = $body['folders'] ?? null;
    if (!is_array($folders)) {
        sendJson(['ok' => false, 'error' => 'Ungültige Ordner-Liste.'], 400);
    }
    $cleanFolders = [];
    foreach ($folders as $idx => $f) {
        if (!is_array($f) || empty($f['id'])) {
            continue;
        }
        $cleanFolders[] = [
            'id'        => sanitizeId((string)$f['id'], 'fld_'),
            'name'      => trim((string)($f['name'] ?? 'Ordner')),
            'color'     => preg_match('/^#[0-9a-fA-F]{6}$/', (string)($f['color'] ?? '')) ? $f['color'] : '#2b579a',
            'createdAt' => (int)($f['createdAt'] ?? nowMs()),
            'order'     => (int)($f['order'] ?? ($idx + 1))
        ];
    }
    $now = nowMs();
    writeJsonAtomic(FOLDERS_FILE, [
        'folders'      => $cleanFolders,
        'lastModified' => $now
    ]);
    sendJson(['ok' => true, 'folders' => $cleanFolders, 'lastModified' => $now]);
}

// Neues Heft anlegen
if ($action === 'create_notebook') {
    $now = nowMs();
    $nbId = !empty($body['id']) ? sanitizeId((string)$body['id'], 'nb_') : ('nb_' . $now . '_' . substr(bin2hex(random_bytes(3)), 0, 6));
    $nbPath = NOTEBOOKS_DIR . '/' . $nbId;
    @mkdir($nbPath . '/assets', 0755, true);

    $title = trim((string)($body['title'] ?? 'Neues Heft'));
    $folderId = sanitizeId((string)($body['folderId'] ?? 'fld_mint'));
    $paperColor = (string)($body['paperColor'] ?? '#fbf8ee');
    $paperTemplate = (string)($body['paperTemplate'] ?? 'grid_5mm');

    $coverStyle = is_array($body['coverStyle'] ?? null) ? $body['coverStyle'] : [
        'preset'     => 'sage',
        'bgColor'    => '#88b378',
        'spineColor' => '#a3c995',
        'pattern'    => 'school_label',
        'labelTitle' => $title,
        'labelSub'   => date('d.m.Y')
    ];

    $hasCover = $body['hasCover'] ?? true;
    $pages = [];

    if ($hasCover) {
        $coverId = 'page_cov_' . substr(bin2hex(random_bytes(4)), 0, 8);
        $pages[] = [
            'id'              => $coverId,
            'isCover'         => true,
            'paperColor'      => $coverStyle['bgColor'] ?? '#88b378',
            'paperTemplate'   => 'cover_' . ($coverStyle['preset'] ?? 'sage'),
            'backgroundAsset' => null,
            'lastModified'    => $now
        ];
        writeJsonAtomic($nbPath . '/page_' . $coverId . '.json', createEmptyPageData($coverId, $now));
    }

    $page1Id = 'page_' . substr(bin2hex(random_bytes(4)), 0, 8);
    $pages[] = [
        'id'              => $page1Id,
        'isCover'         => false,
        'paperColor'      => $paperColor,
        'paperTemplate'   => $paperTemplate,
        'backgroundAsset' => null,
        'lastModified'    => $now
    ];
    writeJsonAtomic($nbPath . '/page_' . $page1Id . '.json', createEmptyPageData($page1Id, $now));

    $meta = [
        'id'           => $nbId,
        'title'        => $title,
        'folderId'     => $folderId,
        'createdAt'    => $now,
        'lastModified' => $now,
        'coverStyle'   => $coverStyle,
        'pages'        => $pages
    ];

    writeJsonAtomic($nbPath . '/meta.json', $meta);
    sendJson(['ok' => true, 'notebook' => $meta]);
}

// Heft duplizieren
if ($action === 'duplicate_notebook') {
    $srcId = sanitizeId((string)($body['notebookId'] ?? ''), 'nb_');
    $srcPath = NOTEBOOKS_DIR . '/' . $srcId;
    if (!is_dir($srcPath) || !file_exists($srcPath . '/meta.json')) {
        sendJson(['ok' => false, 'error' => 'Quell-Heft nicht gefunden.'], 404);
    }
    $now = nowMs();
    $newId = 'nb_' . $now . '_' . substr(bin2hex(random_bytes(3)), 0, 6);
    $dstPath = NOTEBOOKS_DIR . '/' . $newId;

    if (!copyDirectoryRecursive($srcPath, $dstPath)) {
        sendJson(['ok' => false, 'error' => 'Fehler beim Kopieren des Heftes.'], 500);
    }

    $meta = readJsonFile($dstPath . '/meta.json');
    $meta['id'] = $newId;
    $meta['title'] = ($meta['title'] ?? 'Heft') . ' (Kopie)';
    $meta['createdAt'] = $now;
    $meta['lastModified'] = $now;
    writeJsonAtomic($dstPath . '/meta.json', $meta);

    sendJson(['ok' => true, 'notebook' => $meta]);
}

// Heft löschen
if ($action === 'delete_notebook') {
    $nbId = sanitizeId((string)($body['notebookId'] ?? $_GET['notebookId'] ?? ''), 'nb_');
    $nbPath = NOTEBOOKS_DIR . '/' . $nbId;
    if (!is_dir($nbPath)) {
        sendJson(['ok' => false, 'error' => 'Heft nicht gefunden.'], 404);
    }
    deleteDirectoryRecursive($nbPath);
    sendJson(['ok' => true, 'deletedId' => $nbId]);
}

// Heft-Metadaten abrufen / Polling für Multi-Device-Sync (poll_meta / get_notebook)
if ($action === 'get_notebook' || $action === 'poll_meta') {
    $nbId = sanitizeId((string)($_GET['notebookId'] ?? $body['notebookId'] ?? ''), 'nb_');
    $metaPath = NOTEBOOKS_DIR . '/' . $nbId . '/meta.json';
    if (!file_exists($metaPath)) {
        sendJson(['ok' => false, 'error' => 'Heft nicht gefunden.'], 404);
    }
    $meta = readJsonFile($metaPath);
    sendJson([
        'ok'         => true,
        'meta'       => $meta,
        'serverTime' => nowMs()
    ]);
}

// Heft-Metadaten speichern (Titel, Ordner, Cover-Stil, Seiten-Reihenfolge, Papier-Templates)
if ($action === 'save_meta') {
    $nbId = sanitizeId((string)($body['notebookId'] ?? ''), 'nb_');
    $nbPath = NOTEBOOKS_DIR . '/' . $nbId;
    $metaPath = $nbPath . '/meta.json';
    if (!file_exists($metaPath)) {
        sendJson(['ok' => false, 'error' => 'Heft nicht gefunden.'], 404);
    }

    $serverMeta = readJsonFile($metaPath);
    $baseTimestamp = isset($body['baseTimestamp']) ? (int)$body['baseTimestamp'] : 0;
    $forceOverwrite = !empty($body['force']);

    // Konfliktschutz falls Metadaten auf anderem Gerät neuer sind
    if (!$forceOverwrite && $baseTimestamp > 0 && isset($serverMeta['lastModified']) && (int)$serverMeta['lastModified'] > $baseTimestamp) {
        sendJson([
            'ok'         => false,
            'conflict'   => true,
            'error'      => 'Heft-Struktur wurde zwischenzeitlich auf einem anderen Gerät geändert.',
            'serverMeta' => $serverMeta
        ], 409);
    }

    $now = nowMs();
    if (isset($body['title'])) {
        $serverMeta['title'] = trim((string)$body['title']);
    }
    if (isset($body['folderId'])) {
        $serverMeta['folderId'] = sanitizeId((string)$body['folderId']);
    }
    if (isset($body['coverStyle']) && is_array($body['coverStyle'])) {
        $serverMeta['coverStyle'] = $body['coverStyle'];
    }

    if (isset($body['pages']) && is_array($body['pages'])) {
        $existingPageMap = [];
        foreach (($serverMeta['pages'] ?? []) as $p) {
            $existingPageMap[$p['id']] = $p;
        }

        $newPages = [];
        $keepIds = [];
        foreach ($body['pages'] as $p) {
            if (!is_array($p) || empty($p['id'])) {
                continue;
            }
            $pid = sanitizeId((string)$p['id'], 'page_');
            $keepIds[$pid] = true;
            $prev = $existingPageMap[$pid] ?? null;

            $pageEntry = [
                'id'              => $pid,
                'isCover'         => !empty($p['isCover']),
                'paperColor'      => (string)($p['paperColor'] ?? ($prev['paperColor'] ?? '#fbf8ee')),
                'paperTemplate'   => (string)($p['paperTemplate'] ?? ($prev['paperTemplate'] ?? 'grid_5mm')),
                'backgroundAsset' => $p['backgroundAsset'] ?? ($prev['backgroundAsset'] ?? null),
                'aspectRatio'     => isset($p['aspectRatio']) ? (float)$p['aspectRatio'] : ($prev['aspectRatio'] ?? 0.70707),
                'lastModified'    => isset($p['lastModified']) ? (int)$p['lastModified'] : ($prev['lastModified'] ?? $now)
            ];
            $newPages[] = $pageEntry;

            // Falls Seite neu angelegt wurde, leere Seitendatei erstellen
            $pageFilePath = $nbPath . '/page_' . $pid . '.json';
            if (!file_exists($pageFilePath)) {
                // Falls eine Quellseite zum Duplizieren angegeben wurde
                if (!empty($p['duplicateFrom'])) {
                    $srcPid = sanitizeId((string)$p['duplicateFrom'], 'page_');
                    $srcPagePath = $nbPath . '/page_' . $srcPid . '.json';
                    if (file_exists($srcPagePath)) {
                        $copiedData = readJsonFile($srcPagePath);
                        $copiedData['pageId'] = $pid;
                        $copiedData['lastModified'] = $now;
                        writeJsonAtomic($pageFilePath, $copiedData);
                    } else {
                        writeJsonAtomic($pageFilePath, createEmptyPageData($pid, $now));
                    }
                } else {
                    writeJsonAtomic($pageFilePath, createEmptyPageData($pid, $now));
                }
            }
        }

        // Gelöschte Seiten-JSONs aufräumen
        foreach (array_keys($existingPageMap) as $oldPid) {
            if (!isset($keepIds[$oldPid])) {
                $oldFile = $nbPath . '/page_' . $oldPid . '.json';
                if (file_exists($oldFile)) {
                    @unlink($oldFile);
                }
            }
        }

        $serverMeta['pages'] = $newPages;
    }

    $serverMeta['lastModified'] = $now;
    writeJsonAtomic($metaPath, $serverMeta);

    sendJson([
        'ok'           => true,
        'meta'         => $serverMeta,
        'lastModified' => $now
    ]);
}

// Einzelne Seite abrufen (oder mehrere Seiten auf einmal via pageIds)
if ($action === 'get_page') {
    $nbId = sanitizeId((string)($_GET['notebookId'] ?? $body['notebookId'] ?? ''), 'nb_');
    $pageId = sanitizeId((string)($_GET['pageId'] ?? $body['pageId'] ?? ''), 'page_');
    $nbPath = NOTEBOOKS_DIR . '/' . $nbId;
    if (!is_dir($nbPath)) {
        sendJson(['ok' => false, 'error' => 'Heft nicht gefunden.'], 404);
    }

    $pageFile = $nbPath . '/page_' . $pageId . '.json';
    if (!file_exists($pageFile)) {
        $now = nowMs();
        $empty = createEmptyPageData($pageId, $now);
        writeJsonAtomic($pageFile, $empty);
        sendJson(['ok' => true, 'page' => $empty]);
    }

    $pageData = readJsonFile($pageFile);
    sendJson(['ok' => true, 'page' => $pageData]);
}

// Alle Seiten eines Heftes auf einmal laden (z. B. für 300-DPI PDF-Export oder Thumbnail-Warmup)
if ($action === 'get_all_pages') {
    $nbId = sanitizeId((string)($_GET['notebookId'] ?? $body['notebookId'] ?? ''), 'nb_');
    $nbPath = NOTEBOOKS_DIR . '/' . $nbId;
    $metaPath = $nbPath . '/meta.json';
    if (!file_exists($metaPath)) {
        sendJson(['ok' => false, 'error' => 'Heft nicht gefunden.'], 404);
    }
    $meta = readJsonFile($metaPath);
    $pagesData = [];
    foreach (($meta['pages'] ?? []) as $p) {
        $pid = $p['id'];
        $pFile = $nbPath . '/page_' . $pid . '.json';
        $pagesData[$pid] = file_exists($pFile) ? readJsonFile($pFile) : createEmptyPageData($pid, (int)($p['lastModified'] ?? 0));
    }
    sendJson([
        'ok'    => true,
        'meta'  => $meta,
        'pages' => $pagesData
    ]);
}

// Einzelne Seite speichern (Granularer Auto-Save + 409 Stale-Tab-Konfliktschutz)
if ($action === 'save_page') {
    $nbId = sanitizeId((string)($body['notebookId'] ?? ''), 'nb_');
    $pageId = sanitizeId((string)($body['pageId'] ?? ''), 'page_');
    $nbPath = NOTEBOOKS_DIR . '/' . $nbId;
    $metaPath = $nbPath . '/meta.json';

    if (!file_exists($metaPath) || $pageId === '') {
        sendJson(['ok' => false, 'error' => 'Heft oder Seite ungültig.'], 404);
    }

    $pageFile = $nbPath . '/page_' . $pageId . '.json';
    $serverPage = file_exists($pageFile) ? readJsonFile($pageFile) : null;

    $baseTimestamp = isset($body['baseTimestamp']) ? (int)$body['baseTimestamp'] : 0;
    $forceOverwrite = !empty($body['force']);

    // Konfliktschutz: Ist der Stand auf dem Server neuer als der baseTimestamp des Clients?
    if (!$forceOverwrite && $serverPage !== null && $baseTimestamp > 0) {
        $serverTs = (int)($serverPage['lastModified'] ?? 0);
        if ($serverTs > $baseTimestamp) {
            sendJson([
                'ok'              => false,
                'conflict'        => true,
                'error'           => 'Diese Seite wurde auf einem anderen Gerät aktualisiert.',
                'serverPage'      => $serverPage,
                'serverTimestamp' => $serverTs
            ], 409);
        }
    }

    $now = nowMs();
    $incomingData = is_array($body['pageData'] ?? null) ? $body['pageData'] : $body;

    $pagePayload = [
        'pageId'          => $pageId,
        'lastModified'    => $now,
        'strokes'         => is_array($incomingData['strokes'] ?? null) ? $incomingData['strokes'] : [],
        'shapes'          => is_array($incomingData['shapes'] ?? null) ? $incomingData['shapes'] : [],
        'texts'           => is_array($incomingData['texts'] ?? null) ? $incomingData['texts'] : [],
        'images'          => is_array($incomingData['images'] ?? null) ? $incomingData['images'] : [],
        'stickers'        => is_array($incomingData['stickers'] ?? null) ? $incomingData['stickers'] : [],
        'labItems'        => is_array($incomingData['labItems'] ?? null) ? $incomingData['labItems'] : [],
        'backgroundAsset' => $incomingData['backgroundAsset'] ?? ($serverPage['backgroundAsset'] ?? null)
    ];

    if (!writeJsonAtomic($pageFile, $pagePayload)) {
        sendJson(['ok' => false, 'error' => 'Schreibfehler beim Speichern der Seite.'], 500);
    }

    // Aktualisiere lastModified in der meta.json für diese Seite & das Heft
    $meta = readJsonFile($metaPath);
    $pageFound = false;
    if (isset($meta['pages']) && is_array($meta['pages'])) {
        foreach ($meta['pages'] as &$p) {
            if (($p['id'] ?? '') === $pageId) {
                $p['lastModified'] = $now;
                if (isset($incomingData['paperColor'])) {
                    $p['paperColor'] = (string)$incomingData['paperColor'];
                }
                if (isset($incomingData['paperTemplate'])) {
                    $p['paperTemplate'] = (string)$incomingData['paperTemplate'];
                }
                if (array_key_exists('backgroundAsset', $incomingData)) {
                    $p['backgroundAsset'] = $incomingData['backgroundAsset'];
                }
                $pageFound = true;
                break;
            }
        }
        unset($p);
    }
    if (!$pageFound) {
        $meta['pages'][] = [
            'id'              => $pageId,
            'isCover'         => false,
            'paperColor'      => (string)($incomingData['paperColor'] ?? '#fbf8ee'),
            'paperTemplate'   => (string)($incomingData['paperTemplate'] ?? 'grid_5mm'),
            'backgroundAsset' => $incomingData['backgroundAsset'] ?? null,
            'lastModified'    => $now
        ];
    }
    $meta['lastModified'] = $now;
    writeJsonAtomic($metaPath, $meta);

    sendJson([
        'ok'           => true,
        'pageId'       => $pageId,
        'lastModified' => $now,
        'notebookTs'   => $now
    ]);
}

// Asset-Upload (Bilder via Datei-Dialog, Drag & Drop, Ctrl+V Snipping Tool oder gerenderte PDF-Hintergründe)
if ($action === 'upload_asset') {
    $nbId = sanitizeId((string)($_POST['notebookId'] ?? $_GET['notebookId'] ?? $body['notebookId'] ?? ''), 'nb_');
    $nbPath = NOTEBOOKS_DIR . '/' . $nbId;
    if (!is_dir($nbPath)) {
        sendJson(['ok' => false, 'error' => 'Ziel-Heft existiert nicht.'], 404);
    }

    $assetsDir = $nbPath . '/assets';
    if (!is_dir($assetsDir)) {
        @mkdir($assetsDir, 0755, true);
    }

    $allowedMimeToExt = [
        'image/png'  => 'png',
        'image/jpeg' => 'jpg',
        'image/webp' => 'webp',
        'image/gif'  => 'gif',
        'image/svg+xml' => 'svg'
    ];

    // Fall A: Klassischer FormData Multipart-Datei-Upload ($_FILES['file'])
    if (!empty($_FILES['file']) && $_FILES['file']['error'] === UPLOAD_ERR_OK) {
        $tmpName = $_FILES['file']['tmp_name'];
        $finfo = finfo_open(FILEINFO_MIME_TYPE);
        $mime = finfo_file($finfo, $tmpName) ?: '';
        finfo_close($finfo);

        if (!isset($allowedMimeToExt[$mime])) {
            sendJson(['ok' => false, 'error' => 'Nicht unterstütztes Bildformat: ' . $mime], 400);
        }

        $ext = $allowedMimeToExt[$mime];
        $prefix = !empty($_POST['assetType']) ? preg_replace('/[^a-z0-9_]/i', '', (string)$_POST['assetType']) . '_' : 'img_';
        $fileName = $prefix . nowMs() . '_' . substr(bin2hex(random_bytes(4)), 0, 8) . '.' . $ext;
        $destPath = $assetsDir . '/' . $fileName;

        if (!move_uploaded_file($tmpName, $destPath)) {
            sendJson(['ok' => false, 'error' => 'Asset konnte nicht gespeichert werden.'], 500);
        }

        $dims = @getimagesize($destPath);
        sendJson([
            'ok'       => true,
            'fileName' => $fileName,
            'url'      => 'api.php?action=get_asset&notebookId=' . rawurlencode($nbId) . '&file=' . rawurlencode($fileName),
            'width'    => $dims ? (int)$dims[0] : 0,
            'height'   => $dims ? (int)$dims[1] : 0
        ]);
    }

    // Fall B: Data-URL Fallback (falls vom Client als Base64 übergeben)
    $dataUrl = (string)($body['dataUrl'] ?? $_POST['dataUrl'] ?? '');
    if ($dataUrl !== '' && preg_match('/^data:(image\/[a-zA-Z0-9+.\-]+);base64,(.+)$/', $dataUrl, $matches)) {
        $mime = strtolower($matches[1]);
        if (!isset($allowedMimeToExt[$mime])) {
            sendJson(['ok' => false, 'error' => 'Nicht unterstütztes Bildformat.'], 400);
        }
        $binary = base64_decode($matches[2], true);
        if ($binary === false) {
            sendJson(['ok' => false, 'error' => 'Fehlerhafte Base64-Bilddaten.'], 400);
        }
        $ext = $allowedMimeToExt[$mime];
        $prefix = !empty($body['assetType']) ? preg_replace('/[^a-z0-9_]/i', '', (string)$body['assetType']) . '_' : 'img_';
        $fileName = $prefix . nowMs() . '_' . substr(bin2hex(random_bytes(4)), 0, 8) . '.' . $ext;
        $destPath = $assetsDir . '/' . $fileName;

        if (file_put_contents($destPath, $binary, LOCK_EX) === false) {
            sendJson(['ok' => false, 'error' => 'Asset konnte nicht geschrieben werden.'], 500);
        }
        $dims = @getimagesize($destPath);
        sendJson([
            'ok'       => true,
            'fileName' => $fileName,
            'url'      => 'api.php?action=get_asset&notebookId=' . rawurlencode($nbId) . '&file=' . rawurlencode($fileName),
            'width'    => $dims ? (int)$dims[0] : 0,
            'height'   => $dims ? (int)$dims[1] : 0
        ]);
    }

    sendJson(['ok' => false, 'error' => 'Keine gültige Bilddatei empfangen.'], 400);
}

// Authentifizierte Auslieferung von Server-Assets (da ./data/ per .htaccess gesperrt ist)
if ($action === 'get_asset') {
    $nbId = sanitizeId((string)($_GET['notebookId'] ?? ''), 'nb_');
    $file = basename((string)($_GET['file'] ?? ''));
    $filePath = NOTEBOOKS_DIR . '/' . $nbId . '/assets/' . $file;

    if ($file === '' || !file_exists($filePath) || !is_file($filePath)) {
        http_response_code(404);
        exit('Asset not found');
    }

    $ext = strtolower(pathinfo($filePath, PATHINFO_EXTENSION));
    $mimeMap = [
        'png'  => 'image/png',
        'jpg'  => 'image/jpeg',
        'jpeg' => 'image/jpeg',
        'webp' => 'image/webp',
        'gif'  => 'image/gif',
        'svg'  => 'image/svg+xml'
    ];
    $mime = $mimeMap[$ext] ?? 'application/octet-stream';
    $etag = '"' . md5_file($filePath) . '"';

    if (isset($_SERVER['HTTP_IF_NONE_MATCH']) && trim($_SERVER['HTTP_IF_NONE_MATCH']) === $etag) {
        http_response_code(304);
        exit;
    }

    header('Content-Type: ' . $mime);
    header('Content-Length: ' . filesize($filePath));
    header('Cache-Control: private, max-age=31536000, immutable');
    header('ETag: ' . $etag);
    readfile($filePath);
    exit;
}

sendJson([
    'ok'    => false,
    'error' => 'Unbekannte API-Action: ' . htmlspecialchars($action)
], 400);
