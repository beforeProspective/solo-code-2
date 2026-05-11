<?php

namespace App\Controllers;

use App\Config\Database;
use App\Utils\JwtUtils;
use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Message\ServerRequestInterface as Request;

class AuthController
{
    private Database $db;
    private JwtUtils $jwtUtils;

    public function __construct(Database $db, JwtUtils $jwtUtils)
    {
        $this->db = $db;
        $this->jwtUtils = $jwtUtils;
    }

    public function login(Request $request, Response $response): Response
    {
        $body = json_decode($request->getBody()->getContents(), true);
        
        $username = $body['username'] ?? '';
        $password = $body['password'] ?? '';

        if (empty($username) || empty($password)) {
            return $this->jsonResponse($response, ['error' => 'Username and password are required'], 400);
        }

        $pdo = $this->db->getConnection();
        $stmt = $pdo->prepare("SELECT * FROM users WHERE username = ?");
        $stmt->execute([$username]);
        $user = $stmt->fetch();

        if (!$user || !password_verify($password, $user['password_hash'])) {
            return $this->jsonResponse($response, ['error' => 'Invalid credentials'], 401);
        }

        $token = $this->jwtUtils->generateToken($user);

        return $this->jsonResponse($response, [
            'message' => 'Login successful',
            'token' => $token,
            'user' => [
                'id' => $user['id'],
                'username' => $user['username'],
                'email' => $user['email'],
                'role' => $user['role']
            ]
        ]);
    }

    public function register(Request $request, Response $response): Response
    {
        $body = json_decode($request->getBody()->getContents(), true);
        
        $username = $body['username'] ?? '';
        $password = $body['password'] ?? '';
        $email = $body['email'] ?? '';

        if (empty($username) || empty($password) || empty($email)) {
            return $this->jsonResponse($response, ['error' => 'All fields are required'], 400);
        }

        if (strlen($password) < 6) {
            return $this->jsonResponse($response, ['error' => 'Password must be at least 6 characters'], 400);
        }

        $pdo = $this->db->getConnection();
        
        $stmt = $pdo->prepare("SELECT id FROM users WHERE username = ? OR email = ?");
        $stmt->execute([$username, $email]);
        if ($stmt->fetch()) {
            return $this->jsonResponse($response, ['error' => 'Username or email already exists'], 409);
        }

        $passwordHash = password_hash($password, PASSWORD_DEFAULT);
        $stmt = $pdo->prepare("INSERT INTO users (username, password_hash, email, role) VALUES (?, ?, ?, 'user')");
        $stmt->execute([$username, $passwordHash, $email]);

        $userId = $pdo->lastInsertId();
        $token = $this->jwtUtils->generateToken([
            'id' => $userId,
            'username' => $username,
            'email' => $email,
            'role' => 'user'
        ]);

        return $this->jsonResponse($response, [
            'message' => 'User registered successfully',
            'token' => $token,
            'user' => [
                'id' => $userId,
                'username' => $username,
                'email' => $email,
                'role' => 'user'
            ]
        ], 201);
    }

    public function me(Request $request, Response $response): Response
    {
        $user = $request->getAttribute('user');
        return $this->jsonResponse($response, ['user' => $user]);
    }

    private function jsonResponse(Response $response, array $data, int $status = 200): Response
    {
        $response->getBody()->write(json_encode($data));
        return $response->withHeader('Content-Type', 'application/json')->withStatus($status);
    }
}
