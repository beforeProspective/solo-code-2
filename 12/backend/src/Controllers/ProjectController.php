<?php

namespace App\Controllers;

use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Message\ServerRequestInterface as Request;
use App\Database;
use App\Helpers\AuthHelper;
use PDO;

class ProjectController
{
    public function index(Request $request, Response $response): Response
    {
        $user = AuthHelper::getCurrentUser($request);
        $pdo = Database::getConnection();
        
        $sql = "SELECT p.*, u.name as owner_name, 
                (SELECT COUNT(*) FROM tasks WHERE project_id = p.id) as task_count,
                (SELECT COUNT(*) FROM tasks WHERE project_id = p.id AND status = 'completed') as completed_tasks
                FROM projects p
                LEFT JOIN users u ON p.owner_id = u.id
                LEFT JOIN project_members pm ON p.id = pm.project_id
                WHERE p.owner_id = ? OR pm.user_id = ?
                GROUP BY p.id";
        
        $stmt = $pdo->prepare($sql);
        $stmt->execute([$user['id'], $user['id']]);
        $projects = $stmt->fetchAll();
        
        $response->getBody()->write(json_encode($projects));
        return $response->withHeader('Content-Type', 'application/json');
    }
    
    public function show(Request $request, Response $response, array $args): Response
    {
        $user = AuthHelper::getCurrentUser($request);
        $pdo = Database::getConnection();
        $projectId = $args['id'];
        
        $sql = "SELECT p.*, u.name as owner_name
                FROM projects p
                LEFT JOIN users u ON p.owner_id = u.id
                LEFT JOIN project_members pm ON p.id = pm.project_id
                WHERE p.id = ? AND (p.owner_id = ? OR pm.user_id = ?)";
        
        $stmt = $pdo->prepare($sql);
        $stmt->execute([$projectId, $user['id'], $user['id']]);
        $project = $stmt->fetch();
        
        if (!$project) {
            $response->getBody()->write(json_encode(['error' => 'Project not found']));
            return $response->withStatus(404)->withHeader('Content-Type', 'application/json');
        }
        
        $response->getBody()->write(json_encode($project));
        return $response->withHeader('Content-Type', 'application/json');
    }
    
    public function create(Request $request, Response $response): Response
    {
        $user = AuthHelper::getCurrentUser($request);
        $data = json_decode($request->getBody()->getContents(), true);
        
        $pdo = Database::getConnection();
        $stmt = $pdo->prepare("INSERT INTO projects (name, description, owner_id) VALUES (?, ?, ?)");
        $stmt->execute([
            $data['name'] ?? '',
            $data['description'] ?? '',
            $user['id']
        ]);
        
        $projectId = $pdo->lastInsertId();
        
        $stmt = $pdo->prepare("INSERT INTO project_members (project_id, user_id, role) VALUES (?, ?, 'owner')");
        $stmt->execute([$projectId, $user['id']]);
        
        $this->logActivity($user['id'], 'create', 'project', $projectId, "Created project: {$data['name']}");
        
        $response->getBody()->write(json_encode(['id' => $projectId, 'message' => 'Project created']));
        return $response->withStatus(201)->withHeader('Content-Type', 'application/json');
    }
    
    public function update(Request $request, Response $response, array $args): Response
    {
        $user = AuthHelper::getCurrentUser($request);
        $data = json_decode($request->getBody()->getContents(), true);
        $projectId = $args['id'];
        
        $pdo = Database::getConnection();
        
        $stmt = $pdo->prepare("SELECT owner_id FROM projects WHERE id = ?");
        $stmt->execute([$projectId]);
        $project = $stmt->fetch();
        
        if (!$project || ($project['owner_id'] != $user['id'] && !AuthHelper::hasRole($user, 'admin'))) {
            $response->getBody()->write(json_encode(['error' => 'Access denied']));
            return $response->withStatus(403)->withHeader('Content-Type', 'application/json');
        }
        
        $stmt = $pdo->prepare("UPDATE projects SET name = ?, description = ?, status = ? WHERE id = ?");
        $stmt->execute([
            $data['name'] ?? '',
            $data['description'] ?? '',
            $data['status'] ?? 'active',
            $projectId
        ]);
        
        $this->logActivity($user['id'], 'update', 'project', $projectId, "Updated project: {$data['name']}");
        
        $response->getBody()->write(json_encode(['message' => 'Project updated']));
        return $response->withHeader('Content-Type', 'application/json');
    }
    
    public function delete(Request $request, Response $response, array $args): Response
    {
        $user = AuthHelper::getCurrentUser($request);
        $projectId = $args['id'];
        
        $pdo = Database::getConnection();
        
        $stmt = $pdo->prepare("SELECT owner_id, name FROM projects WHERE id = ?");
        $stmt->execute([$projectId]);
        $project = $stmt->fetch();
        
        if (!$project || ($project['owner_id'] != $user['id'] && !AuthHelper::hasRole($user, 'owner'))) {
            $response->getBody()->write(json_encode(['error' => 'Access denied']));
            return $response->withStatus(403)->withHeader('Content-Type', 'application/json');
        }
        
        $stmt = $pdo->prepare("DELETE FROM projects WHERE id = ?");
        $stmt->execute([$projectId]);
        
        $this->logActivity($user['id'], 'delete', 'project', $projectId, "Deleted project: {$project['name']}");
        
        $response->getBody()->write(json_encode(['message' => 'Project deleted']));
        return $response->withHeader('Content-Type', 'application/json');
    }
    
    public function members(Request $request, Response $response, array $args): Response
    {
        $projectId = $args['id'];
        $pdo = Database::getConnection();
        
        $sql = "SELECT u.id, u.name, u.email, u.role, pm.role as project_role
                FROM project_members pm
                JOIN users u ON pm.user_id = u.id
                WHERE pm.project_id = ?";
        
        $stmt = $pdo->prepare($sql);
        $stmt->execute([$projectId]);
        $members = $stmt->fetchAll();
        
        $response->getBody()->write(json_encode($members));
        return $response->withHeader('Content-Type', 'application/json');
    }
    
    public function addMember(Request $request, Response $response, array $args): Response
    {
        $user = AuthHelper::getCurrentUser($request);
        $data = json_decode($request->getBody()->getContents(), true);
        $projectId = $args['id'];
        
        $pdo = Database::getConnection();
        
        $stmt = $pdo->prepare("SELECT owner_id FROM projects WHERE id = ?");
        $stmt->execute([$projectId]);
        $project = $stmt->fetch();
        
        if (!$project || ($project['owner_id'] != $user['id'] && !AuthHelper::hasRole($user, 'admin'))) {
            $response->getBody()->write(json_encode(['error' => 'Access denied']));
            return $response->withStatus(403)->withHeader('Content-Type', 'application/json');
        }
        
        $email = $data['email'] ?? '';
        $stmt = $pdo->prepare("SELECT id, name FROM users WHERE email = ?");
        $stmt->execute([$email]);
        $targetUser = $stmt->fetch();
        
        if (!$targetUser) {
            $response->getBody()->write(json_encode(['error' => 'User not found']));
            return $response->withStatus(404)->withHeader('Content-Type', 'application/json');
        }
        
        $stmt = $pdo->prepare("INSERT INTO project_members (project_id, user_id, role) VALUES (?, ?, ?)");
        $stmt->execute([$projectId, $targetUser['id'], $data['role'] ?? 'member']);
        
        $this->logActivity($user['id'], 'add_member', 'project', $projectId, "Added {$targetUser['name']} to project");
        
        $response->getBody()->write(json_encode(['message' => 'Member added']));
        return $response->withStatus(201)->withHeader('Content-Type', 'application/json');
    }
    
    public function removeMember(Request $request, Response $response, array $args): Response
    {
        $user = AuthHelper::getCurrentUser($request);
        $projectId = $args['id'];
        $memberId = $args['memberId'];
        
        $pdo = Database::getConnection();
        
        $stmt = $pdo->prepare("SELECT owner_id FROM projects WHERE id = ?");
        $stmt->execute([$projectId]);
        $project = $stmt->fetch();
        
        if (!$project || ($project['owner_id'] != $user['id'] && !AuthHelper::hasRole($user, 'admin'))) {
            $response->getBody()->write(json_encode(['error' => 'Access denied']));
            return $response->withStatus(403)->withHeader('Content-Type', 'application/json');
        }
        
        $stmt = $pdo->prepare("DELETE FROM project_members WHERE project_id = ? AND user_id = ?");
        $stmt->execute([$projectId, $memberId]);
        
        $this->logActivity($user['id'], 'remove_member', 'project', $projectId, "Removed member from project");
        
        $response->getBody()->write(json_encode(['message' => 'Member removed']));
        return $response->withHeader('Content-Type', 'application/json');
    }
    
    private function logActivity($userId, $action, $targetType, $targetId, $details): void
    {
        $pdo = Database::getConnection();
        $stmt = $pdo->prepare("INSERT INTO activity_logs (user_id, action, target_type, target_id, details) VALUES (?, ?, ?, ?, ?)");
        $stmt->execute([$userId, $action, $targetType, $targetId, $details]);
    }
}
