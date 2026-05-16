<?php
$uri = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);
$uri = preg_replace('#^/api#', '', $uri);
$uri = trim($uri, '/');

$routes = [
    'auth' => 'api/auth.php',
    'files' => 'api/files.php',
    'upload' => 'api/upload.php',
    'admin' => 'api/admin.php',
];

$parts = explode('/', $uri);
$endpoint = $parts[0] ?? '';

if (isset($routes[$endpoint])) {
    require_once __DIR__ . '/' . $routes[$endpoint];
} else {
    http_response_code(404);
    echo json_encode(['error' => 'Endpoint not found']);
}
