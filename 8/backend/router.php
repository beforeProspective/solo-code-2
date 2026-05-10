<?php
$uri = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);
$uri = preg_replace('#^/index\.php#', '', $uri);
$uri = rtrim($uri, '/') ?: '/';

$_SERVER['REQUEST_URI'] = $uri;

if (file_exists(__DIR__ . $uri) && is_file(__DIR__ . $uri) && $uri !== '/index.php') {
    return false;
}

require_once __DIR__ . '/index.php';
