<?php

namespace App\Controllers;

use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Message\ServerRequestInterface as Request;
use App\Database;
use App\Helpers\AuthHelper;
use PDO;

class CommentController
{
    public function index(Request $request, Response $response, array $args): Response
    {
        $taskId = $args['taskId'];
        $pdo = Database::getConnection();
        
        $sql = "SELECT c.*, u.name as user_name, u.email as user_email
                FROM comments c
                JOIN users u ON c.user_id = u.id
                WHERE c.task_id = ?
                ORDER BY c.created_at ASC";
        
        $stmt = $pdo->prepare($sql);
        $stmt->execute([$taskId]);
        $comments = $stmt->fetchAll();
        
        $response->getBody()->write(json_encode($comments));
        return $response->withHeader('Content-Type', 'application/json');
    }
    
    public function create(Request $request, Response $response, array $args): Response
    {
        $user = AuthHelper::getCurrentUser($request);
        $data = json_decode($request->getBody()->getContents(), true);
        $taskId = $args['taskId'];
        
        $pdo = Database::getConnection();
        $stmt = $pdo->prepare("INSERT INTO comments (task_id, user_id, content) VALUES (?, ?, ?)");
        $stmt->execute([$taskId, $user['id'], $data['content'] ?? '']);
        
        $this->logActivity($user['id'], 'comment', 'task', $taskId, "Added comment to task");
        
        $response->getBody()->write(json_encode(['id' => $pdo->lastInsertId(), 'message' => 'Comment added']));
        return $response->withStatus(201)->withHeader('Content-Type', 'application/json');
    }
    
    public function update(Request $request, Response $response, array $args): Response
    {
        $user = AuthHelper::getCurrentUser($request);
        $data = json_decode($request->getBody()->getContents(), true);
        $id = $args['id'];
        
        $pdo = Database::getConnection();
        
        $stmt = $pdo->prepare("SELECT user_id FROM comments WHERE id = ?");
        $stmt->execute([$id]);
        $comment = $stmt->fetch();
        
        if (!$comment || ($comment['user_id'] != $user['id'] && !AuthHelper::hasRole($user, 'admin'))) {
            $response->getBody()->write(json_encode(['error' => 'Access denied']));
            return $response->withStatus(403)->withHeader('Content-Type', 'application/json');
        }
        
        $stmt = $pdo->prepare("UPDATE comments SET content = ? WHERE id = ?");
        $stmt->execute([$data['content'] ?? '', $id]);
        
        $response->getBody()->write(json_encode(['message' => 'Comment updated']));
        return $response->withHeader('Content-Type', 'application/json');
    }
    
    public function delete(Request $request, Response $response, array $args): Response
    {
        $user = AuthHelper::getCurrentUser($request);
        $id = $args['id'];
        
        $pdo = Database::getConnection();
        
        $stmt = $pdo->prepare("SELECT user_id FROM comments WHERE id = ?");
        $stmt->execute([$id]);
        $comment = $stmt->fetch();
        
        if (!$comment || ($comment['user_id'] != $user['id'] && !AuthHelper::hasRole($user, 'admin'))) {
            $response->getBody()->write(json_encode(['error' => 'Access denied']));
            return $response->withStatus(403)->withHeader('Content-Type', 'application/json');
        }
        
        $stmt = $pdo->prepare("DELETE FROM comments WHERE id = ?");
        $stmt->execute([$id]);
        
        $response->getBody()->write(json_encode(['message' => 'Comment deleted']));
        return $response->withHeader('Content-Type', 'application/json');
    }
    
    private function logActivity($userId, $action, $targetType, $targetId, $details): void
    {
        $pdo = Database::getConnection();
        $stmt = $pdo->prepare("INSERT INTO activity_logs (user_id, action, target_type, target_id, details) VALUES (?, ?, ?, ?, ?)");
        $stmt->execute([$userId, $action, $targetType, $targetId, $details]);
    }
}
