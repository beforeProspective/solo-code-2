<?php
define('JWT_SECRET', 'file_manager_secret_key_2024');
define('JWT_EXPIRE', 3600 * 24);
define('UPLOAD_DIR', __DIR__ . '/../storage/');
define('UPLOAD_TEMP_DIR', __DIR__ . '/../temp/');
define('DB_PATH', __DIR__ . '/../database.sqlite');
define('MAX_UPLOAD_SIZE', 100 * 1024 * 1024);
define('CHUNK_SIZE', 2 * 1024 * 1024);

if (!file_exists(UPLOAD_DIR)) {
    mkdir(UPLOAD_DIR, 0777, true);
}
if (!file_exists(UPLOAD_TEMP_DIR)) {
    mkdir(UPLOAD_TEMP_DIR, 0777, true);
}

header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}
