<?php

namespace App\Controllers;

use App\Config\Database;
use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Message\ServerRequestInterface as Request;

class ComponentController
{
    private Database $db;

    public function __construct(Database $db)
    {
        $this->db = $db;
    }

    public function getAll(Request $request, Response $response): Response
    {
        $queryParams = $request->getQueryParams();
        $pdo = $this->db->getConnection();

        $page = max(1, (int)($queryParams['page'] ?? 1));
        $perPage = min(100, max(1, (int)($queryParams['perPage'] ?? 10)));
        $offset = ($page - 1) * $perPage;

        $whereClauses = [];
        $params = [];

        $searchFields = ['name', 'part_number', 'category', 'package', 'value', 'tolerance', 'voltage_rating', 'power_rating', 'description'];
        foreach ($searchFields as $field) {
            if (!empty($queryParams[$field])) {
                $whereClauses[] = "c.$field = :$field";
                $params[$field] = $queryParams[$field];
            }
        }

        if (!empty($queryParams['search'])) {
            $searchTerm = $queryParams['search'];
            $whereClauses[] = "(c.name LIKE :search OR c.part_number LIKE :search OR c.description LIKE :search OR c.value LIKE :search)";
            $params['search'] = "%$searchTerm%";
        }

        $whereSql = !empty($whereClauses) ? 'WHERE ' . implode(' AND ', $whereClauses) : '';

        $countStmt = $pdo->prepare("SELECT COUNT(*) as total FROM components c $whereSql");
        $countStmt->execute($params);
        $total = $countStmt->fetch()['total'];

        $orderBy = 'c.id DESC';
        if (!empty($queryParams['sortField'])) {
            $sortField = $queryParams['sortField'];
            $sortOrder = strtoupper($queryParams['sortOrder'] ?? 'ASC');
            if (in_array($sortOrder, ['ASC', 'DESC']) && in_array($sortField, ['id', 'name', 'part_number', 'category', 'package', 'value', 'created_at'])) {
                $orderBy = "c.$sortField $sortOrder";
            }
        }

        $sql = "
            SELECT c.*, 
                   i.quantity, 
                   i.min_stock, 
                   i.location, 
                   i.unit_price,
                   s.name as supplier_name
            FROM components c
            LEFT JOIN inventory i ON c.id = i.component_id
            LEFT JOIN suppliers s ON i.supplier_id = s.id
            $whereSql
            ORDER BY $orderBy
            LIMIT :limit OFFSET :offset
        ";

        $stmt = $pdo->prepare($sql);
        foreach ($params as $key => $value) {
            $stmt->bindValue($key, $value);
        }
        $stmt->bindValue(':limit', $perPage, \PDO::PARAM_INT);
        $stmt->bindValue(':offset', $offset, \PDO::PARAM_INT);
        $stmt->execute();

        $components = $stmt->fetchAll();

        foreach ($components as &$comp) {
            $comp['low_stock'] = ($comp['quantity'] !== null && $comp['min_stock'] !== null) ? ($comp['quantity'] <= $comp['min_stock']) : false;
        }

        return $this->jsonResponse($response, [
            'data' => $components,
            'pagination' => [
                'page' => $page,
                'perPage' => $perPage,
                'total' => $total,
                'totalPages' => ceil($total / $perPage)
            ]
        ]);
    }

    public function getById(Request $request, Response $response, array $args): Response
    {
        $id = $args['id'];
        $pdo = $this->db->getConnection();

        $stmt = $pdo->prepare("
            SELECT c.*, 
                   i.quantity, 
                   i.min_stock, 
                   i.location, 
                   i.unit_price,
                   i.supplier_id,
                   s.name as supplier_name
            FROM components c
            LEFT JOIN inventory i ON c.id = i.component_id
            LEFT JOIN suppliers s ON i.supplier_id = s.id
            WHERE c.id = ?
        ");
        $stmt->execute([$id]);
        $component = $stmt->fetch();

        if (!$component) {
            return $this->jsonResponse($response, ['error' => 'Component not found'], 404);
        }

        $component['low_stock'] = ($component['quantity'] !== null && $component['min_stock'] !== null) ? ($component['quantity'] <= $component['min_stock']) : false;

        return $this->jsonResponse($response, ['data' => $component]);
    }

    public function create(Request $request, Response $response): Response
    {
        $body = json_decode($request->getBody()->getContents(), true);
        $pdo = $this->db->getConnection();

        $required = ['name'];
        foreach ($required as $field) {
            if (empty($body[$field])) {
                return $this->jsonResponse($response, ['error' => "Field '$field' is required"], 400);
            }
        }

        $pdo->beginTransaction();
        try {
            $stmt = $pdo->prepare("
                INSERT INTO components (name, part_number, category, package, value, tolerance, voltage_rating, power_rating, description, datasheet_url, datasheet_file)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ");
            $stmt->execute([
                $body['name'] ?? null,
                $body['part_number'] ?? null,
                $body['category'] ?? null,
                $body['package'] ?? null,
                $body['value'] ?? null,
                $body['tolerance'] ?? null,
                $body['voltage_rating'] ?? null,
                $body['power_rating'] ?? null,
                $body['description'] ?? null,
                $body['datasheet_url'] ?? null,
                $body['datasheet_file'] ?? null,
            ]);

            $componentId = $pdo->lastInsertId();

            $stmt = $pdo->prepare("
                INSERT INTO inventory (component_id, supplier_id, quantity, min_stock, location, unit_price)
                VALUES (?, ?, ?, ?, ?, ?)
            ");
            $stmt->execute([
                $componentId,
                $body['supplier_id'] ?? null,
                $body['quantity'] ?? 0,
                $body['min_stock'] ?? 10,
                $body['location'] ?? null,
                $body['unit_price'] ?? null,
            ]);

            $pdo->commit();

            $stmt = $pdo->prepare("
                SELECT c.*, i.quantity, i.min_stock, i.location, i.unit_price, s.name as supplier_name
                FROM components c
                LEFT JOIN inventory i ON c.id = i.component_id
                LEFT JOIN suppliers s ON i.supplier_id = s.id
                WHERE c.id = ?
            ");
            $stmt->execute([$componentId]);
            $component = $stmt->fetch();

            return $this->jsonResponse($response, ['message' => 'Component created', 'data' => $component], 201);
        } catch (\Exception $e) {
            $pdo->rollBack();
            return $this->jsonResponse($response, ['error' => 'Failed to create component: ' . $e->getMessage()], 500);
        }
    }

    public function update(Request $request, Response $response, array $args): Response
    {
        $id = $args['id'];
        $body = json_decode($request->getBody()->getContents(), true);
        $pdo = $this->db->getConnection();

        $stmt = $pdo->prepare("SELECT id FROM components WHERE id = ?");
        $stmt->execute([$id]);
        if (!$stmt->fetch()) {
            return $this->jsonResponse($response, ['error' => 'Component not found'], 404);
        }

        $pdo->beginTransaction();
        try {
            $stmt = $pdo->prepare("
                UPDATE components 
                SET name = ?, part_number = ?, category = ?, package = ?, value = ?, tolerance = ?, 
                    voltage_rating = ?, power_rating = ?, description = ?, datasheet_url = ?, datasheet_file = ?, updated_at = CURRENT_TIMESTAMP
                WHERE id = ?
            ");
            $stmt->execute([
                $body['name'] ?? null,
                $body['part_number'] ?? null,
                $body['category'] ?? null,
                $body['package'] ?? null,
                $body['value'] ?? null,
                $body['tolerance'] ?? null,
                $body['voltage_rating'] ?? null,
                $body['power_rating'] ?? null,
                $body['description'] ?? null,
                $body['datasheet_url'] ?? null,
                $body['datasheet_file'] ?? null,
                $id
            ]);

            $inventoryFields = ['quantity', 'min_stock', 'location', 'unit_price', 'supplier_id'];
            $inventoryUpdates = [];
            $inventoryValues = [];
            
            foreach ($inventoryFields as $field) {
                if (isset($body[$field])) {
                    $inventoryUpdates[] = "$field = ?";
                    $inventoryValues[] = $body[$field];
                }
            }
            
            if (!empty($inventoryUpdates)) {
                $inventoryValues[] = $id;
                $stmt = $pdo->prepare("UPDATE inventory SET " . implode(', ', $inventoryUpdates) . ", last_updated = CURRENT_TIMESTAMP WHERE component_id = ?");
                $stmt->execute($inventoryValues);
            }

            $pdo->commit();

            $stmt = $pdo->prepare("
                SELECT c.*, i.quantity, i.min_stock, i.location, i.unit_price, s.name as supplier_name
                FROM components c
                LEFT JOIN inventory i ON c.id = i.component_id
                LEFT JOIN suppliers s ON i.supplier_id = s.id
                WHERE c.id = ?
            ");
            $stmt->execute([$id]);
            $component = $stmt->fetch();

            return $this->jsonResponse($response, ['message' => 'Component updated', 'data' => $component]);
        } catch (\Exception $e) {
            $pdo->rollBack();
            return $this->jsonResponse($response, ['error' => 'Failed to update component: ' . $e->getMessage()], 500);
        }
    }

    public function delete(Request $request, Response $response, array $args): Response
    {
        $id = $args['id'];
        $pdo = $this->db->getConnection();

        $stmt = $pdo->prepare("SELECT id FROM components WHERE id = ?");
        $stmt->execute([$id]);
        if (!$stmt->fetch()) {
            return $this->jsonResponse($response, ['error' => 'Component not found'], 404);
        }

        try {
            $stmt = $pdo->prepare("DELETE FROM components WHERE id = ?");
            $stmt->execute([$id]);

            return $this->jsonResponse($response, ['message' => 'Component deleted']);
        } catch (\Exception $e) {
            return $this->jsonResponse($response, ['error' => 'Failed to delete component: ' . $e->getMessage()], 500);
        }
    }

    public function getCategories(Request $request, Response $response): Response
    {
        $pdo = $this->db->getConnection();
        $stmt = $pdo->query("SELECT DISTINCT category FROM components WHERE category IS NOT NULL ORDER BY category");
        $categories = array_column($stmt->fetchAll(), 'category');
        
        return $this->jsonResponse($response, ['data' => $categories]);
    }

    public function getPackages(Request $request, Response $response): Response
    {
        $pdo = $this->db->getConnection();
        $stmt = $pdo->query("SELECT DISTINCT package FROM components WHERE package IS NOT NULL ORDER BY package");
        $packages = array_column($stmt->fetchAll(), 'package');
        
        return $this->jsonResponse($response, ['data' => $packages]);
    }

    private function jsonResponse(Response $response, array $data, int $status = 200): Response
    {
        $response->getBody()->write(json_encode($data));
        return $response->withHeader('Content-Type', 'application/json')->withStatus($status);
    }
}
