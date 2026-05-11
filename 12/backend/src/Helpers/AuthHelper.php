<?php

namespace App\Helpers;

use Firebase\JWT\JWT;
use Firebase\JWT\Key;
use Exception;

class AuthHelper
{
    public static function generateToken(array $user): string
    {
        $issuedAt = time();
        $expirationTime = $issuedAt + (60 * 60 * 24);
        
        $payload = [
            'iat' => $issuedAt,
            'exp' => $expirationTime,
            'user' => [
                'id' => $user['id'],
                'email' => $user['email'],
                'name' => $user['name'],
                'role' => $user['role']
            ]
        ];
        
        return JWT::encode($payload, $_ENV['JWT_SECRET'], 'HS256');
    }
    
    public static function decodeToken(string $token): ?object
    {
        try {
            return JWT::decode($token, new Key($_ENV['JWT_SECRET'], 'HS256'));
        } catch (Exception $e) {
            return null;
        }
    }
    
    public static function getCurrentUser($request): ?array
    {
        $token = $request->getAttribute('jwt');
        return $token ? (array)$token->user : null;
    }
    
    public static function hasRole($user, $requiredRole): bool
    {
        if (!$user) return false;
        $hierarchy = ['member' => 1, 'admin' => 2, 'owner' => 3];
        return $hierarchy[$user['role'] ?? 'member'] >= $hierarchy[$requiredRole];
    }
}
