<?php
require_once __DIR__ . '/../config/config.php';
require_once __DIR__ . '/../lib/database.php';
require_once __DIR__ . '/../lib/jwt.php';
require_once __DIR__ . '/../lib/storage.php';

$method = $_SERVER['REQUEST_METHOD'];
$input = json_decode(file_get_contents('php://input'), true);

switch ($method) {
    case 'POST':
        $action = $_GET['action'] ?? '';
        
        if ($action === 'register') {
            $username = trim($input['username'] ?? '');
            $email = trim($input['email'] ?? '');
            $password = $input['password'] ?? '';
            
            if (empty($username) || empty($email) || empty($password)) {
                http_response_code(400);
                echo json_encode(['error' => 'All fields are required']);
                exit;
            }
            
            if (strlen($password) < 6) {
                http_response_code(400);
                echo json_encode(['error' => 'Password must be at least 6 characters']);
                exit;
            }
            
            $db = getDB();
            
            $stmt = $db->prepare("SELECT COUNT(*) FROM users WHERE username = ? OR email = ?");
            $stmt->execute([$username, $email]);
            if ($stmt->fetchColumn() > 0) {
                http_response_code(400);
                echo json_encode(['error' => 'Username or email already exists']);
                exit;
            }
            
            $hashedPassword = password_hash($password, PASSWORD_DEFAULT);
            $stmt = $db->prepare("INSERT INTO users (username, email, password, role) VALUES (?, ?, ?, 'user')");
            
            try {
                $stmt->execute([$username, $email, $hashedPassword]);
                $userId = $db->lastInsertId();
                
                $storage = StorageFactory::create('local', $userId);
                $storage->createDirectory('/');
                
                echo json_encode(['message' => 'Registration successful']);
            } catch (Exception $e) {
                http_response_code(500);
                echo json_encode(['error' => 'Registration failed']);
            }
        } elseif ($action === 'login') {
            $username = trim($input['username'] ?? '');
            $password = $input['password'] ?? '';
            
            if (empty($username) || empty($password)) {
                http_response_code(400);
                echo json_encode(['error' => 'Username and password are required']);
                exit;
            }
            
            $db = getDB();
            $stmt = $db->prepare("SELECT * FROM users WHERE username = ? OR email = ?");
            $stmt->execute([$username, $username]);
            $user = $stmt->fetch(PDO::FETCH_ASSOC);
            
            if (!$user || !password_verify($password, $user['password'])) {
                http_response_code(401);
                echo json_encode(['error' => 'Invalid credentials']);
                exit;
            }
            
            $token = JWT::encode([
                'user_id' => $user['id'],
                'username' => $user['username'],
                'role' => $user['role']
            ], JWT_SECRET, JWT_EXPIRE);
            
            unset($user['password']);
            echo json_encode([
                'token' => $token,
                'user' => $user
            ]);
        } elseif ($action === 'me') {
            $user = requireAuth();
            echo json_encode(['user' => $user]);
        }
        break;
        
    default:
        http_response_code(405);
        echo json_encode(['error' => 'Method not allowed']);
}
