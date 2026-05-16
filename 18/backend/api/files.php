<?php
require_once __DIR__ . '/../config/config.php';
require_once __DIR__ . '/../lib/database.php';
require_once __DIR__ . '/../lib/storage.php';

$method = $_SERVER['REQUEST_METHOD'];
$input = json_decode(file_get_contents('php://input'), true);
$user = requireAuth();
$storage = StorageFactory::create($user['storage_adapter'], $user['id']);
$db = getDB();

function getPathParam() {
    return trim($_GET['path'] ?? '', '/');
}

function isEditable($role) {
    return in_array($role, ['admin', 'user']);
}

switch ($method) {
    case 'GET':
        $action = $_GET['action'] ?? 'list';
        
        if ($action === 'list') {
            $path = getPathParam();
            $items = $storage->listFiles($path);
            
            $search = $_GET['search'] ?? '';
            if (!empty($search)) {
                $items = array_filter($items, function($item) use ($search) {
                    return stripos($item['name'], $search) !== false;
                });
            }
            
            usort($items, function($a, $b) {
                if ($a['type'] !== $b['type']) {
                    return $a['type'] === 'directory' ? -1 : 1;
                }
                return strcasecmp($a['name'], $b['name']);
            });
            
            echo json_encode(['items' => array_values($items)]);
            
        } elseif ($action === 'download') {
            if (!isEditable($user['role']) && $user['role'] !== 'viewer') {
                http_response_code(403);
                echo json_encode(['error' => 'Forbidden']);
                exit;
            }
            
            $path = getPathParam();
            $fullPath = $storage->getFullPath($path);
            
            if (!$storage->exists($path)) {
                http_response_code(404);
                echo json_encode(['error' => 'File not found']);
                exit;
            }
            
            if (is_dir($fullPath)) {
                require_once __DIR__ . '/../lib/zip.php';
                $zipFile = createZipFromDirectory($fullPath, basename($path));
                
                header('Content-Type: application/zip');
                header('Content-Disposition: attachment; filename="' . basename($path) . '.zip"');
                header('Content-Length: ' . filesize($zipFile));
                readfile($zipFile);
                unlink($zipFile);
            } else {
                header('Content-Type: application/octet-stream');
                header('Content-Disposition: attachment; filename="' . basename($path) . '"');
                header('Content-Length: ' . $storage->getSize($path));
                echo $storage->download($path);
            }
            
        } elseif ($action === 'preview') {
            $path = getPathParam();
            if (!$storage->exists($path)) {
                http_response_code(404);
                echo json_encode(['error' => 'File not found']);
                exit;
            }
            
            $ext = strtolower(pathinfo($path, PATHINFO_EXTENSION));
            $imageExts = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp'];
            
            if (in_array($ext, $imageExts)) {
                $content = $storage->download($path);
                $mime = mime_content_type($storage->getFullPath($path));
                header('Content-Type: ' . $mime);
                echo $content;
            } else {
                header('Content-Type: text/plain');
                echo $storage->download($path);
            }
            
        } elseif ($action === 'download_bulk') {
            $paths = json_decode($_GET['paths'] ?? '[]', true);
            
            require_once __DIR__ . '/../lib/zip.php';
            $zipFile = createZipFromPaths($paths, $storage, 'files_' . time() . '.zip');
            
            header('Content-Type: application/zip');
            header('Content-Disposition: attachment; filename="files.zip"');
            header('Content-Length: ' . filesize($zipFile));
            readfile($zipFile);
            unlink($zipFile);
        }
        break;
        
    case 'POST':
        $action = $_GET['action'] ?? '';
        
        if (!isEditable($user['role'])) {
            http_response_code(403);
            echo json_encode(['error' => 'Read-only access']);
            exit;
        }
        
        if ($action === 'upload') {
            $path = getPathParam();
            
            if (isset($_FILES['file']) && $_FILES['file']['error'] === UPLOAD_ERR_OK) {
                $fileName = basename($_FILES['file']['name']);
                $destPath = trim($path . '/' . $fileName, '/');
                
                if ($storage->upload($_FILES['file']['tmp_name'], $destPath)) {
                    echo json_encode(['success' => true, 'path' => $destPath]);
                } else {
                    http_response_code(500);
                    echo json_encode(['error' => 'Upload failed']);
                }
            } else {
                http_response_code(400);
                echo json_encode(['error' => 'No file uploaded']);
            }
            
        } elseif ($action === 'create_directory') {
            $path = getPathParam();
            $name = trim($input['name'] ?? '');
            
            if (empty($name)) {
                http_response_code(400);
                echo json_encode(['error' => 'Name is required']);
                exit;
            }
            
            $newPath = trim($path . '/' . $name, '/');
            if ($storage->exists($newPath)) {
                http_response_code(400);
                echo json_encode(['error' => 'Directory already exists']);
                exit;
            }
            
            if ($storage->createDirectory($newPath)) {
                echo json_encode(['success' => true, 'path' => $newPath]);
            } else {
                http_response_code(500);
                echo json_encode(['error' => 'Failed to create directory']);
            }
            
        } elseif ($action === 'create_file') {
            $path = getPathParam();
            $name = trim($input['name'] ?? '');
            $content = $input['content'] ?? '';
            
            if (empty($name)) {
                http_response_code(400);
                echo json_encode(['error' => 'Name is required']);
                exit;
            }
            
            $newPath = trim($path . '/' . $name, '/');
            $fullPath = $storage->getFullPath($newPath);
            
            if ($storage->exists($newPath)) {
                http_response_code(400);
                echo json_encode(['error' => 'File already exists']);
                exit;
            }
            
            if (file_put_contents($fullPath, $content) !== false) {
                echo json_encode(['success' => true, 'path' => $newPath]);
            } else {
                http_response_code(500);
                echo json_encode(['error' => 'Failed to create file']);
            }
            
        } elseif ($action === 'copy') {
            $source = trim($input['source'] ?? '', '/');
            $destination = trim($input['destination'] ?? '', '/');
            
            if (empty($source) || empty($destination)) {
                http_response_code(400);
                echo json_encode(['error' => 'Source and destination are required']);
                exit;
            }
            
            if ($storage->copy($source, $destination)) {
                echo json_encode(['success' => true]);
            } else {
                http_response_code(500);
                echo json_encode(['error' => 'Copy failed']);
            }
            
        } elseif ($action === 'move') {
            $source = trim($input['source'] ?? '', '/');
            $destination = trim($input['destination'] ?? '', '/');
            
            if (empty($source) || empty($destination)) {
                http_response_code(400);
                echo json_encode(['error' => 'Source and destination are required']);
                exit;
            }
            
            if ($storage->move($source, $destination)) {
                echo json_encode(['success' => true]);
            } else {
                http_response_code(500);
                echo json_encode(['error' => 'Move failed']);
            }
            
        } elseif ($action === 'rename') {
            $path = getPathParam();
            $newName = trim($input['name'] ?? '');
            
            if (empty($path) || empty($newName)) {
                http_response_code(400);
                echo json_encode(['error' => 'Path and name are required']);
                exit;
            }
            
            $parentDir = dirname($path);
            $newPath = trim($parentDir . '/' . $newName, '/');
            
            if ($storage->exists($newPath)) {
                http_response_code(400);
                echo json_encode(['error' => 'Path already exists']);
                exit;
            }
            
            if ($storage->move($path, $newPath)) {
                echo json_encode(['success' => true, 'path' => $newPath]);
            } else {
                http_response_code(500);
                echo json_encode(['error' => 'Rename failed']);
            }
            
        } elseif ($action === 'edit') {
            $path = getPathParam();
            $content = $input['content'] ?? '';
            
            if (empty($path)) {
                http_response_code(400);
                echo json_encode(['error' => 'Path is required']);
                exit;
            }
            
            $fullPath = $storage->getFullPath($path);
            
            if (is_dir($fullPath)) {
                http_response_code(400);
                echo json_encode(['error' => 'Cannot edit directory']);
                exit;
            }
            
            if (file_put_contents($fullPath, $content) !== false) {
                echo json_encode(['success' => true]);
            } else {
                http_response_code(500);
                echo json_encode(['error' => 'Edit failed']);
            }
            
        } elseif ($action === 'delete') {
            $paths = $input['paths'] ?? [];
            
            if (empty($paths)) {
                http_response_code(400);
                echo json_encode(['error' => 'No paths provided']);
                exit;
            }
            
            $success = true;
            foreach ($paths as $path) {
                $path = trim($path, '/');
                if (!$storage->delete($path)) {
                    $success = false;
                }
            }
            
            if ($success) {
                echo json_encode(['success' => true]);
            } else {
                http_response_code(500);
                echo json_encode(['error' => 'Some items could not be deleted']);
            }
        }
        break;
        
    default:
        http_response_code(405);
        echo json_encode(['error' => 'Method not allowed']);
}
