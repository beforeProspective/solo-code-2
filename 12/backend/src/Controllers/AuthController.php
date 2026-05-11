<?php

namespace App\Controllers;

use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Message\ServerRequestInterface as Request;
use App\Database;
use App\Helpers\AuthHelper;
use PDO;

class AuthController
{
    public function login(Request $request, Response $response): Response
    {
        $data = json_decode($request->getBody()->getContents(), true);
        $email = $data['email'] ?? '';
        $password = $data['password'] ?? '';
        
        $pdo = Database::getConnection();
        $stmt = $pdo->prepare("SELECT * FROM users WHERE email = ?");
        $stmt->execute([$email]);
        $user = $stmt->fetch();
        
        if (!$user || !password_verify($password, $user['password'])) {
            $response->getBody()->write(json_encode(['error' => 'Invalid credentials']));
            return $response->withStatus(401)->withHeader('Content-Type', 'application/json');
        }
        
        unset($user['password']);
        $token = AuthHelper::generateToken($user);
        
        $response->getBody()->write(json_encode([
            'token' => $token,
            'user' => $user
        ]));
        return $response->withHeader('Content-Type', 'application/json');
    }
    
    public function register(Request $request, Response $response): Response
    {
        $data = json_decode($request->getBody()->getContents(), true);
        
        $email = $data['email'] ?? '';
        $password = $data['password'] ?? '';
        $name = $data['name'] ?? '';
        
        if (empty($email) || empty($password) || empty($name)) {
            $response->getBody()->write(json_encode(['error' => 'All fields are required']));
            return $response->withStatus(400)->withHeader('Content-Type', 'application/json');
        }
        
        $pdo = Database::getConnection();
        
        $stmt = $pdo->prepare("SELECT COUNT(*) FROM users WHERE email = ?");
        $stmt->execute([$email]);
        if ($stmt->fetchColumn() > 0) {
            $response->getBody()->write(json_encode(['error' => 'Email already exists']));
            return $response->withStatus(400)->withHeader('Content-Type', 'application/json');
        }
        
        $hashed = password_hash($password, PASSWORD_DEFAULT);
        $stmt = $pdo->prepare("INSERT INTO users (email, password, name, role) VALUES (?, ?, ?, 'member')");
        $stmt->execute([$email, $hashed, $name]);
        
        $userId = $pdo->lastInsertId();
        $user = [
            'id' => $userId,
            'email' => $email,
            'name' => $name,
            'role' => 'member'
        ];
        
        $token = AuthHelper::generateToken($user);
        
        $response->getBody()->write(json_encode([
            'token' => $token,
            'user' => $user
        ]));
        return $response->withStatus(201)->withHeader('Content-Type', 'application/json');
    }
    
    public function me(Request $request, Response $response): Response
    {
        $user = AuthHelper::getCurrentUser($request);
        
        $pdo = Database::getConnection();
        $stmt = $pdo->prepare("SELECT id, email, name, role, created_at FROM users WHERE id = ?");
        $stmt->execute([$user['id']]);
        $dbUser = $stmt->fetch();
        
        $response->getBody()->write(json_encode($dbUser));
        return $response->withHeader('Content-Type', 'application/json');
    }
}
