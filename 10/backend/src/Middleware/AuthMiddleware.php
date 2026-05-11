<?php

namespace App\Middleware;

use App\Utils\JwtUtils;
use Psr\Http\Message\ServerRequestInterface as Request;
use Psr\Http\Server\RequestHandlerInterface as RequestHandler;
use Slim\Psr7\Response;

class AuthMiddleware
{
    private JwtUtils $jwtUtils;

    public function __construct(JwtUtils $jwtUtils)
    {
        $this->jwtUtils = $jwtUtils;
    }

    public function __invoke(Request $request, RequestHandler $handler): Response
    {
        $token = $this->jwtUtils->getTokenFromHeaders($request);
        
        if (!$token) {
            return $this->jsonResponse(['error' => 'Unauthorized - No token provided'], 401);
        }

        $user = $this->jwtUtils->validateToken($token);
        
        if (!$user) {
            return $this->jsonResponse(['error' => 'Unauthorized - Invalid token'], 401);
        }

        $request = $request->withAttribute('user', $user);
        
        return $handler->handle($request);
    }

    public function isAdmin(Request $request, RequestHandler $handler): Response
    {
        $token = $this->jwtUtils->getTokenFromHeaders($request);
        
        if (!$token) {
            return $this->jsonResponse(['error' => 'Unauthorized - No token provided'], 401);
        }

        $user = $this->jwtUtils->validateToken($token);
        
        if (!$user) {
            return $this->jsonResponse(['error' => 'Unauthorized - Invalid token'], 401);
        }

        if ($user['role'] !== 'admin') {
            return $this->jsonResponse(['error' => 'Forbidden - Admin access required'], 403);
        }

        $request = $request->withAttribute('user', $user);
        
        return $handler->handle($request);
    }

    private function jsonResponse(array $data, int $status = 200): Response
    {
        $response = new Response();
        $response->getBody()->write(json_encode($data));
        return $response->withHeader('Content-Type', 'application/json')->withStatus($status);
    }
}
