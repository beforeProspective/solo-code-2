<?php
require_once __DIR__ . '/../config/config.php';
require_once __DIR__ . '/../lib/database.php';
require_once __DIR__ . '/../lib/storage.php';

$method = $_SERVER['REQUEST_METHOD'];
$input = json_decode(file_get_contents('php://input'), true);
$user = requireAuth(['admin']);
$db = getDB();

switch ($method) {
    case 'GET':
        $action = $_GET['action'] ?? 'list';
        
        if ($action === 'list') {
            $stmt = $db->prepare("SELECT id, username, email, role, storage_adapter, created_at FROM users ORDER BY id ASC");
            $stmt->execute();
            $users = $stmt->fetchAll(PDO::FETCH_ASSOC);
            echo json_encode(['users' => $users]);
        }
        break;
        
    case 'POST':
        $action = $_GET['action'] ?? '';
        
        if ($action === 'create') {
            $username = trim($input['username'] ?? '');
            $email = trim($input['email'] ?? '');
            $password = $input['password'] ?? '';
            $role = $input['role'] ?? 'user';
            
            if (empty($username) || empty($email) || empty($password)) {
                http_response_code(400);
                echo json_encode(['error' => 'All fields are required']);
                exit;
            }
            
            if (!in_array($role, ['admin', 'user', 'viewer'])) {
                http_response_code(400);
                echo json_encode(['error' => 'Invalid role']);
                exit;
            }
            
            $stmt = $db->prepare("SELECT COUNT(*) FROM users WHERE username = ? OR email = ?");
            $stmt->execute([$username, $email]);
            if ($stmt->fetchColumn() > 0) {
                http_response_code(400);
                echo json_encode(['error' => 'Username or email already exists']);
                exit;
            }
            
            $hashedPassword = password_hash($password, PASSWORD_DEFAULT);
            $stmt = $db->prepare("INSERT INTO users (username, email, password, role) VALUES (?, ?, ?, ?)");
            
            try {
                $stmt->execute([$username, $email, $hashedPassword, $role]);
                $userId = $db->lastInsertId();
                
                $storage = StorageFactory::create('local', $userId);
                $storage->createDirectory('/');
                
                echo json_encode(['success' => true]);
            } catch (Exception $e) {
                http_response_code(500);
                echo json_encode(['error' => 'Failed to create user']);
            }
            
        } elseif ($action === 'update') {
            $id = intval($input['id'] ?? 0);
            $role = $input['role'] ?? '';
            $password = $input['password'] ?? '';
            $storageAdapter = $input['storage_adapter'] ?? '';
            
            if ($id <= 0 || $id === $user['id']) {
                http_response_code(400);
                echo json_encode(['error' => 'Invalid user']);
                exit;
            }
            
            $updates = [];
            $params = [];
            
            if (!empty($role) && in_array($role, ['admin', 'user', 'viewer'])) {
                $updates[] = 'role = ?';
                $params[] = $role;
            }
            
            if (!empty($password) && strlen($password) >= 6) {
                $updates[] = 'password = ?';
                $params[] = password_hash($password, PASSWORD_DEFAULT);
            }
            
            if (!empty($storageAdapter)) {
                $updates[] = 'storage_adapter = ?';
                $params[] = $storageAdapter;
            }
            
            if (empty($updates)) {
                http_response_code(400);
                echo json_encode(['error' => 'No updates provided']);
                exit;
            }
            
            $params[] = $id;
            $sql = "UPDATE users SET " . implode(', ', $updates) . " WHERE id = ?";
            $stmt = $db->prepare($sql);
            
            try {
                $stmt->execute($params);
                echo json_encode(['success' => true]);
            } catch (Exception $e) {
                http_response_code(500);
                echo json_encode(['error' => 'Failed to update user']);
            }
        }
        break;
        
    case 'DELETE':
        $id = intval($_GET['id'] ?? 0);
        
        if ($id <= 0 || $id === $user['id']) {
            http_response_code(400);
            echo json_encode(['error' => 'Invalid user']);
            exit;
        }
        
        $userDir = UPLOAD_DIR . 'user_' . $id . '/';
        if (is_dir($userDir)) {
            array_map('unlink', glob("$userDir*.*"));
            rmdir($userDir);
        }
        
        $stmt = $db->prepare("DELETE FROM users WHERE id = ?");
        try {
            $stmt->execute([$id]);
            echo json_encode(['success' => true]);
        } catch (Exception $e) {
            http_response_code(500);
            echo json_encode(['error' => 'Failed to delete user']);
        }
        break;
        
    default:
        http_response_code(405);
        echo json_encode(['error' => 'Method not allowed']);
}
