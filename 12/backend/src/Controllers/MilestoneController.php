<?php

namespace App\Controllers;

use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Message\ServerRequestInterface as Request;
use App\Database;
use App\Helpers\AuthHelper;
use PDO;

class MilestoneController
{
    public function index(Request $request, Response $response, array $args): Response
    {
        $projectId = $args['projectId'];
        $pdo = Database::getConnection();
        
        $sql = "SELECT m.*, 
                (SELECT COUNT(*) FROM tasks WHERE milestone_id = m.id) as task_count,
                (SELECT COUNT(*) FROM tasks WHERE milestone_id = m.id AND status = 'completed') as completed_tasks
                FROM milestones m WHERE m.project_id = ? ORDER BY m.due_date ASC";
        
        $stmt = $pdo->prepare($sql);
        $stmt->execute([$projectId]);
        $milestones = $stmt->fetchAll();
        
        $response->getBody()->write(json_encode($milestones));
        return $response->withHeader('Content-Type', 'application/json');
    }
    
    public function create(Request $request, Response $response, array $args): Response
    {
        $user = AuthHelper::getCurrentUser($request);
        $data = json_decode($request->getBody()->getContents(), true);
        $projectId = $args['projectId'];
        
        $pdo = Database::getConnection();
        $stmt = $pdo->prepare("INSERT INTO milestones (project_id, name, description, due_date, status) VALUES (?, ?, ?, ?, 'pending')");
        $stmt->execute([
            $projectId,
            $data['name'] ?? '',
            $data['description'] ?? '',
            $data['due_date'] ?? null
        ]);
        
        $this->logActivity($user['id'], 'create', 'milestone', $pdo->lastInsertId(), "Created milestone: {$data['name']}");
        
        $response->getBody()->write(json_encode(['id' => $pdo->lastInsertId(), 'message' => 'Milestone created']));
        return $response->withStatus(201)->withHeader('Content-Type', 'application/json');
    }
    
    public function update(Request $request, Response $response, array $args): Response
    {
        $user = AuthHelper::getCurrentUser($request);
        $data = json_decode($request->getBody()->getContents(), true);
        $id = $args['id'];
        
        $pdo = Database::getConnection();
        $stmt = $pdo->prepare("UPDATE milestones SET name = ?, description = ?, due_date = ?, status = ? WHERE id = ?");
        $stmt->execute([
            $data['name'] ?? '',
            $data['description'] ?? '',
            $data['due_date'] ?? null,
            $data['status'] ?? 'pending',
            $id
        ]);
        
        $this->logActivity($user['id'], 'update', 'milestone', $id, "Updated milestone: {$data['name']}");
        
        $response->getBody()->write(json_encode(['message' => 'Milestone updated']));
        return $response->withHeader('Content-Type', 'application/json');
    }
    
    public function delete(Request $request, Response $response, array $args): Response
    {
        $user = AuthHelper::getCurrentUser($request);
        $id = $args['id'];
        
        $pdo = Database::getConnection();
        $stmt = $pdo->prepare("SELECT name FROM milestones WHERE id = ?");
        $stmt->execute([$id]);
        $milestone = $stmt->fetch();
        
        $stmt = $pdo->prepare("DELETE FROM milestones WHERE id = ?");
        $stmt->execute([$id]);
        
        $this->logActivity($user['id'], 'delete', 'milestone', $id, "Deleted milestone: {$milestone['name']}");
        
        $response->getBody()->write(json_encode(['message' => 'Milestone deleted']));
        return $response->withHeader('Content-Type', 'application/json');
    }
    
    private function logActivity($userId, $action, $targetType, $targetId, $details): void
    {
        $pdo = Database::getConnection();
        $stmt = $pdo->prepare("INSERT INTO activity_logs (user_id, action, target_type, target_id, details) VALUES (?, ?, ?, ?, ?)");
        $stmt->execute([$userId, $action, $targetType, $targetId, $details]);
    }
}
