<?php

namespace App\Controllers;

use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Message\ServerRequestInterface as Request;
use App\Database;
use App\Helpers\AuthHelper;
use PDO;

class TaskController
{
    public function index(Request $request, Response $response, array $args): Response
    {
        $projectId = $args['projectId'];
        $pdo = Database::getConnection();
        
        $sql = "SELECT t.*, 
                u.name as assignee_name, u.email as assignee_email,
                c.name as creator_name,
                m.name as milestone_name
                FROM tasks t
                LEFT JOIN users u ON t.assignee_id = u.id
                LEFT JOIN users c ON t.creator_id = c.id
                LEFT JOIN milestones m ON t.milestone_id = m.id
                WHERE t.project_id = ?";
        
        $stmt = $pdo->prepare($sql);
        $stmt->execute([$projectId]);
        $tasks = $stmt->fetchAll();
        
        $response->getBody()->write(json_encode($tasks));
        return $response->withHeader('Content-Type', 'application/json');
    }
    
    public function show(Request $request, Response $response, array $args): Response
    {
        $pdo = Database::getConnection();
        $id = $args['id'];
        
        $sql = "SELECT t.*, 
                u.name as assignee_name, u.email as assignee_email,
                c.name as creator_name,
                m.name as milestone_name
                FROM tasks t
                LEFT JOIN users u ON t.assignee_id = u.id
                LEFT JOIN users c ON t.creator_id = c.id
                LEFT JOIN milestones m ON t.milestone_id = m.id
                WHERE t.id = ?";
        
        $stmt = $pdo->prepare($sql);
        $stmt->execute([$id]);
        $task = $stmt->fetch();
        
        if (!$task) {
            $response->getBody()->write(json_encode(['error' => 'Task not found']));
            return $response->withStatus(404)->withHeader('Content-Type', 'application/json');
        }
        
        $response->getBody()->write(json_encode($task));
        return $response->withHeader('Content-Type', 'application/json');
    }
    
    public function create(Request $request, Response $response, array $args): Response
    {
        $user = AuthHelper::getCurrentUser($request);
        $data = json_decode($request->getBody()->getContents(), true);
        $projectId = $args['projectId'];
        
        $pdo = Database::getConnection();
        $stmt = $pdo->prepare("INSERT INTO tasks (project_id, milestone_id, title, description, status, priority, assignee_id, creator_id, due_date) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)");
        $stmt->execute([
            $projectId,
            $data['milestone_id'] ?? null,
            $data['title'] ?? '',
            $data['description'] ?? '',
            $data['status'] ?? 'todo',
            $data['priority'] ?? 'medium',
            $data['assignee_id'] ?? null,
            $user['id'],
            $data['due_date'] ?? null
        ]);
        
        $taskId = $pdo->lastInsertId();
        $this->logActivity($user['id'], 'create', 'task', $taskId, "Created task: {$data['title']}");
        
        $response->getBody()->write(json_encode(['id' => $taskId, 'message' => 'Task created']));
        return $response->withStatus(201)->withHeader('Content-Type', 'application/json');
    }
    
    public function update(Request $request, Response $response, array $args): Response
    {
        $user = AuthHelper::getCurrentUser($request);
        $data = json_decode($request->getBody()->getContents(), true);
        $id = $args['id'];
        
        $pdo = Database::getConnection();
        $stmt = $pdo->prepare("UPDATE tasks SET milestone_id = ?, title = ?, description = ?, status = ?, priority = ?, assignee_id = ?, due_date = ? WHERE id = ?");
        $stmt->execute([
            $data['milestone_id'] ?? null,
            $data['title'] ?? '',
            $data['description'] ?? '',
            $data['status'] ?? 'todo',
            $data['priority'] ?? 'medium',
            $data['assignee_id'] ?? null,
            $data['due_date'] ?? null,
            $id
        ]);
        
        $this->logActivity($user['id'], 'update', 'task', $id, "Updated task: {$data['title']}");
        
        $response->getBody()->write(json_encode(['message' => 'Task updated']));
        return $response->withHeader('Content-Type', 'application/json');
    }
    
    public function updateStatus(Request $request, Response $response, array $args): Response
    {
        $user = AuthHelper::getCurrentUser($request);
        $data = json_decode($request->getBody()->getContents(), true);
        $id = $args['id'];
        
        $pdo = Database::getConnection();
        $stmt = $pdo->prepare("SELECT title FROM tasks WHERE id = ?");
        $stmt->execute([$id]);
        $task = $stmt->fetch();
        
        $stmt = $pdo->prepare("UPDATE tasks SET status = ? WHERE id = ?");
        $stmt->execute([$data['status'] ?? 'todo', $id]);
        
        $this->logActivity($user['id'], 'update_status', 'task', $id, "Updated status of '{$task['title']}' to {$data['status']}");
        
        $response->getBody()->write(json_encode(['message' => 'Status updated']));
        return $response->withHeader('Content-Type', 'application/json');
    }
    
    public function delete(Request $request, Response $response, array $args): Response
    {
        $user = AuthHelper::getCurrentUser($request);
        $id = $args['id'];
        
        $pdo = Database::getConnection();
        $stmt = $pdo->prepare("SELECT title FROM tasks WHERE id = ?");
        $stmt->execute([$id]);
        $task = $stmt->fetch();
        
        $stmt = $pdo->prepare("DELETE FROM tasks WHERE id = ?");
        $stmt->execute([$id]);
        
        $this->logActivity($user['id'], 'delete', 'task', $id, "Deleted task: {$task['title']}");
        
        $response->getBody()->write(json_encode(['message' => 'Task deleted']));
        return $response->withHeader('Content-Type', 'application/json');
    }
    
    private function logActivity($userId, $action, $targetType, $targetId, $details): void
    {
        $pdo = Database::getConnection();
        $stmt = $pdo->prepare("INSERT INTO activity_logs (user_id, action, target_type, target_id, details) VALUES (?, ?, ?, ?, ?)");
        $stmt->execute([$userId, $action, $targetType, $targetId, $details]);
    }
}
