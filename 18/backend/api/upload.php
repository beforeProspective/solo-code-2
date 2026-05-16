<?php
require_once __DIR__ . '/../config/config.php';
require_once __DIR__ . '/../lib/database.php';
require_once __DIR__ . '/../lib/storage.php';

$method = $_SERVER['REQUEST_METHOD'];
$user = requireAuth(['admin', 'user']);
$storage = StorageFactory::create($user['storage_adapter'], $user['id']);
$db = getDB();

$input = json_decode(file_get_contents('php://input'), true) ?: [];

function getParam($key, $default = '') {
    global $input;
    return $_POST[$key] ?? $input[$key] ?? $_GET[$key] ?? $default;
}

switch ($method) {
    case 'POST':
        $action = $_GET['action'] ?? '';
        
        if ($action === 'chunk') {
            $fileIdentifier = getParam('resumableIdentifier');
            $fileName = getParam('resumableFilename');
            $chunkNumber = intval(getParam('resumableChunkNumber', 0));
            $totalChunks = intval(getParam('resumableTotalChunks', 0));
            $currentPath = trim(getParam('currentPath'), '/');
            
            if (empty($fileIdentifier) || empty($fileName) || $chunkNumber <= 0) {
                http_response_code(400);
                echo json_encode(['error' => 'Invalid parameters']);
                exit;
            }
            
            if (!isset($_FILES['file']) || $_FILES['file']['error'] !== UPLOAD_ERR_OK) {
                http_response_code(400);
                echo json_encode(['error' => 'No chunk file']);
                exit;
            }
            
            $tempDir = UPLOAD_TEMP_DIR . $fileIdentifier . '/';
            if (!is_dir($tempDir)) {
                mkdir($tempDir, 0777, true);
            }
            
            $chunkPath = $tempDir . $chunkNumber;
            move_uploaded_file($_FILES['file']['tmp_name'], $chunkPath);
            
            $stmt = $db->prepare("INSERT INTO upload_chunks (user_id, file_identifier, filename, total_chunks, current_chunk, path) VALUES (?, ?, ?, ?, ?, ?)");
            $stmt->execute([$user['id'], $fileIdentifier, $fileName, $totalChunks, $chunkNumber, $chunkPath]);
            
            echo json_encode(['success' => true, 'chunk' => $chunkNumber]);
            
        } elseif ($action === 'complete') {
            $fileIdentifier = getParam('fileIdentifier');
            $fileName = getParam('fileName');
            $currentPath = trim(getParam('currentPath'), '/');
            
            if (empty($fileIdentifier) || empty($fileName)) {
                http_response_code(400);
                echo json_encode(['error' => 'Invalid parameters']);
                exit;
            }
            
            $tempDir = UPLOAD_TEMP_DIR . $fileIdentifier . '/';
            $destPath = trim($currentPath . '/' . $fileName, '/');
            $fullDestPath = $storage->getFullPath($destPath);
            
            $storageDir = dirname($fullDestPath);
            if (!is_dir($storageDir)) {
                mkdir($storageDir, 0777, true);
            }
            
            $finalFile = fopen($fullDestPath, 'wb');
            if (!$finalFile) {
                http_response_code(500);
                echo json_encode(['error' => 'Cannot create file']);
                exit;
            }
            
            $stmt = $db->prepare("SELECT current_chunk, path FROM upload_chunks WHERE file_identifier = ? AND user_id = ? ORDER BY current_chunk ASC");
            $stmt->execute([$fileIdentifier, $user['id']]);
            $chunks = $stmt->fetchAll(PDO::FETCH_ASSOC);
            
            foreach ($chunks as $chunk) {
                $chunkContent = file_get_contents($chunk['path']);
                fwrite($finalFile, $chunkContent);
                unlink($chunk['path']);
            }
            
            fclose($finalFile);
            rmdir($tempDir);
            
            $stmt = $db->prepare("DELETE FROM upload_chunks WHERE file_identifier = ? AND user_id = ?");
            $stmt->execute([$fileIdentifier, $user['id']]);
            
            echo json_encode(['success' => true, 'path' => $destPath]);
        }
        break;
        
    case 'GET':
        $action = $_GET['action'] ?? '';
        
        if ($action === 'check_chunk') {
            $fileIdentifier = $_GET['resumableIdentifier'] ?? '';
            $chunkNumber = intval($_GET['resumableChunkNumber'] ?? 0);
            
            if (empty($fileIdentifier) || $chunkNumber <= 0) {
                http_response_code(204);
                exit;
            }
            
            $stmt = $db->prepare("SELECT COUNT(*) FROM upload_chunks WHERE file_identifier = ? AND current_chunk = ? AND user_id = ?");
            $stmt->execute([$fileIdentifier, $chunkNumber, $user['id']]);
            
            if ($stmt->fetchColumn() > 0) {
                http_response_code(200);
                echo json_encode(['exists' => true]);
            } else {
                http_response_code(204);
            }
        }
        break;
        
    case 'DELETE':
        $action = $_GET['action'] ?? '';
        
        if ($action === 'cancel') {
            $fileIdentifier = $_GET['fileIdentifier'] ?? '';
            
            if (empty($fileIdentifier)) {
                http_response_code(400);
                echo json_encode(['error' => 'Invalid parameters']);
                exit;
            }
            
            $tempDir = UPLOAD_TEMP_DIR . $fileIdentifier . '/';
            if (is_dir($tempDir)) {
                array_map('unlink', glob("$tempDir*"));
                rmdir($tempDir);
            }
            
            $stmt = $db->prepare("DELETE FROM upload_chunks WHERE file_identifier = ? AND user_id = ?");
            $stmt->execute([$fileIdentifier, $user['id']]);
            
            echo json_encode(['success' => true]);
        }
        break;
        
    default:
        http_response_code(405);
        echo json_encode(['error' => 'Method not allowed']);
}
