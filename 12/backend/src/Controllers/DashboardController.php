<?php

namespace App\Controllers;

use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Message\ServerRequestInterface as Request;
use App\Database;
use App\Helpers\AuthHelper;
use PDO;

class DashboardController
{
    public function stats(Request $request, Response $response): Response
    {
        $user = AuthHelper::getCurrentUser($request);
        $pdo = Database::getConnection();
        
        $projectSql = "SELECT COUNT(DISTINCT p.id) as count
                      FROM projects p
                      LEFT JOIN project_members pm ON p.id = pm.project_id
                      WHERE p.owner_id = ? OR pm.user_id = ?";
        $stmt = $pdo->prepare($projectSql);
        $stmt->execute([$user['id'], $user['id']]);
        $projectCount = $stmt->fetch()['count'];
        
        $taskSql = "SELECT COUNT(*) as count FROM tasks t
                   JOIN projects p ON t.project_id = p.id
                   LEFT JOIN project_members pm ON p.id = pm.project_id
                   WHERE p.owner_id = ? OR pm.user_id = ?";
        $stmt = $pdo->prepare($taskSql);
        $stmt->execute([$user['id'], $user['id']]);
        $taskCount = $stmt->fetch()['count'];
        
        $completedSql = "SELECT COUNT(*) as count FROM tasks t
                        JOIN projects p ON t.project_id = p.id
                        LEFT JOIN project_members pm ON p.id = pm.project_id
                        WHERE (p.owner_id = ? OR pm.user_id = ?) AND t.status = 'completed'";
        $stmt = $pdo->prepare($completedSql);
        $stmt->execute([$user['id'], $user['id']]);
        $completedCount = $stmt->fetch()['count'];
        
        $inProgressSql = "SELECT COUNT(*) as count FROM tasks t
                         JOIN projects p ON t.project_id = p.id
                         LEFT JOIN project_members pm ON p.id = pm.project_id
                         WHERE (p.owner_id = ? OR pm.user_id = ?) AND t.status = 'in_progress'";
        $stmt = $pdo->prepare($inProgressSql);
        $stmt->execute([$user['id'], $user['id']]);
        $inProgressCount = $stmt->fetch()['count'];
        
        $myTasksSql = "SELECT COUNT(*) as count FROM tasks WHERE assignee_id = ?";
        $stmt = $pdo->prepare($myTasksSql);
        $stmt->execute([$user['id']]);
        $myTaskCount = $stmt->fetch()['count'];
        
        $recentSql = "SELECT t.*, p.name as project_name FROM tasks t
                     JOIN projects p ON t.project_id = p.id
                     LEFT JOIN project_members pm ON p.id = pm.project_id
                     WHERE (p.owner_id = ? OR pm.user_id = ?)
                     ORDER BY t.created_at DESC LIMIT 5";
        $stmt = $pdo->prepare($recentSql);
        $stmt->execute([$user['id'], $user['id']]);
        $recentTasks = $stmt->fetchAll();
        
        $overdueSql = "SELECT t.*, p.name as project_name FROM tasks t
                      JOIN projects p ON t.project_id = p.id
                      LEFT JOIN project_members pm ON p.id = pm.project_id
                      WHERE (p.owner_id = ? OR pm.user_id = ?) 
                      AND t.due_date IS NOT NULL 
                      AND t.due_date < DATE('now')
                      AND t.status != 'completed'
                      ORDER BY t.due_date ASC LIMIT 5";
        $stmt = $pdo->prepare($overdueSql);
        $stmt->execute([$user['id'], $user['id']]);
        $overdueTasks = $stmt->fetchAll();
        
        $stats = [
            'projects' => $projectCount,
            'tasks' => $taskCount,
            'completed' => $completedCount,
            'in_progress' => $inProgressCount,
            'my_tasks' => $myTaskCount,
            'completion_rate' => $taskCount > 0 ? round(($completedCount / $taskCount) * 100, 2) : 0,
            'recent_tasks' => $recentTasks,
            'overdue_tasks' => $overdueTasks
        ];
        
        $response->getBody()->write(json_encode($stats));
        return $response->withHeader('Content-Type', 'application/json');
    }
    
    public function activity(Request $request, Response $response): Response
    {
        $user = AuthHelper::getCurrentUser($request);
        $pdo = Database::getConnection();
        
        $sql = "SELECT al.*, u.name as user_name
               FROM activity_logs al
               JOIN users u ON al.user_id = u.id
               ORDER BY al.created_at DESC LIMIT 50";
        
        $stmt = $pdo->query($sql);
        $activities = $stmt->fetchAll();
        
        $response->getBody()->write(json_encode($activities));
        return $response->withHeader('Content-Type', 'application/json');
    }
    
    public function users(Request $request, Response $response): Response
    {
        $pdo = Database::getConnection();
        
        $sql = "SELECT id, name, email, role, created_at FROM users ORDER BY name ASC";
        $stmt = $pdo->query($sql);
        $users = $stmt->fetchAll();
        
        $response->getBody()->write(json_encode($users));
        return $response->withHeader('Content-Type', 'application/json');
    }
}
