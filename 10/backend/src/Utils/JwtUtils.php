<?php

namespace App\Utils;

use Firebase\JWT\JWT;
use Firebase\JWT\Key;

class JwtUtils
{
    private string $secret;
    private int $expire;

    public function __construct()
    {
        $this->secret = $_ENV['JWT_SECRET'] ?? 'default_secret_key_change_me';
        $this->expire = (int)($_ENV['JWT_EXPIRE'] ?? 3600);
    }

    public function generateToken(array $user): string
    {
        $payload = [
            'iss' => 'localhost',
            'aud' => 'localhost',
            'iat' => time(),
            'exp' => time() + $this->expire,
            'user' => [
                'id' => $user['id'],
                'username' => $user['username'],
                'email' => $user['email'],
                'role' => $user['role'],
            ]
        ];

        return JWT::encode($payload, $this->secret, 'HS256');
    }

    public function validateToken(string $token): ?array
    {
        try {
            $decoded = JWT::decode($token, new Key($this->secret, 'HS256'));
            return (array)$decoded->user;
        } catch (\Exception $e) {
            return null;
        }
    }

    public function getTokenFromHeaders(\Psr\Http\Message\ServerRequestInterface $request): ?string
    {
        $header = $request->getHeaderLine('Authorization');
        if (preg_match('/Bearer\s+(\S+)/', $header, $matches)) {
            return $matches[1];
        }
        return null;
    }
}
