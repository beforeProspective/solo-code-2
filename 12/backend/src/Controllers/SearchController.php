<?php

namespace App\Controllers;

use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Message\ServerRequestInterface as Request;
use App\Database;
use App\Helpers\AuthHelper;
use PDO;

class SearchController
{
    public function search(Request $request, Response $response): Response
    {
        $user = AuthHelper::getCurrentUser($request);
        $params = $request->getQueryParams();
        $query = $params['q'] ?? '';
        
        if (empty($query)) {
            $response->getBody()->write(json_encode(['projects' => [], 'tasks' => [], 'milestones' => []]));
            return $response->withHeader('Content-Type', 'application/json');
        }
        
        $pdo = Database::getConnection();
        
        $projectSql = "SELECT DISTINCT p.id, p.name, p.description, p.status, p.created_at
                      FROM projects p
                      LEFT JOIN project_members pm ON p.id = pm.project_id
                      WHERE (p.owner_id = ? OR pm.user_id = ?)
                      AND (p.name LIKE ? OR p.description LIKE ?)
                      LIMIT 10";
        $stmt = $pdo->prepare($projectSql);
        $searchTerm = '%' . $query . '%';
        $stmt->execute([$user['id'], $user['id'], $searchTerm, $searchTerm]);
        $projects = $stmt->fetchAll();
        
        $taskSql = "SELECT t.id, t.title, t.description, t.status, t.priority, t.due_date,
                   p.name as project_name, t.project_id
                   FROM tasks t
                   JOIN projects p ON t.project_id = p.id
                   LEFT JOIN project_members pm ON p.id = pm.project_id
                   WHERE (p.owner_id = ? OR pm.user_id = ?)
                   AND (t.title LIKE ? OR t.description LIKE ?)
                   LIMIT 20";
        $stmt = $pdo->prepare($taskSql);
        $stmt->execute([$user['id'], $user['id'], $searchTerm, $searchTerm]);
        $tasks = $stmt->fetchAll();
        
        $milestoneSql = "SELECT m.id, m.name, m.description, m.status, m.due_date,
                        p.name as project_name, m.project_id
                        FROM milestones m
                        JOIN projects p ON m.project_id = p.id
                        LEFT JOIN project_members pm ON p.id = pm.project_id
                        WHERE (p.owner_id = ? OR pm.user_id = ?)
                        AND (m.name LIKE ? OR m.description LIKE ?)
                        LIMIT 10";
        $stmt = $pdo->prepare($milestoneSql);
        $stmt->execute([$user['id'], $user['id'], $searchTerm, $searchTerm]);
        $milestones = $stmt->fetchAll();
        
        $results = [
            'projects' => $projects,
            'tasks' => $tasks,
            'milestones' => $milestones
        ];
        
        $response->getBody()->write(json_encode($results));
        return $response->withHeader('Content-Type', 'application/json');
    }
}
