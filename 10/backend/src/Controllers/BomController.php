<?php

namespace App\Controllers;

use App\Config\Database;
use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Message\ServerRequestInterface as Request;

class BomController
{
    private Database $db;

    public function __construct(Database $db)
    {
        $this->db = $db;
    }

    public function getAll(Request $request, Response $response): Response
    {
        $pdo = $this->db->getConnection();
        $queryParams = $request->getQueryParams();
        
        $page = max(1, (int)($queryParams['page'] ?? 1));
        $perPage = min(100, max(1, (int)($queryParams['perPage'] ?? 20)));
        $offset = ($page - 1) * $perPage;

        $countStmt = $pdo->query("SELECT COUNT(*) as total FROM boms");
        $total = $countStmt->fetch()['total'];

        $stmt = $pdo->prepare("
            SELECT b.*, u.username as created_by_name,
                   (SELECT COUNT(*) FROM bom_items bi WHERE bi.bom_id = b.id) as item_count
            FROM boms b
            LEFT JOIN users u ON b.created_by = u.id
            ORDER BY b.created_at DESC
            LIMIT :limit OFFSET :offset
        ");
        $stmt->bindValue(':limit', $perPage, \PDO::PARAM_INT);
        $stmt->bindValue(':offset', $offset, \PDO::PARAM_INT);
        $stmt->execute();

        $boms = $stmt->fetchAll();

        return $this->jsonResponse($response, [
            'data' => $boms,
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
            SELECT b.*, u.username as created_by_name
            FROM boms b
            LEFT JOIN users u ON b.created_by = u.id
            WHERE b.id = ?
        ");
        $stmt->execute([$id]);
        $bom = $stmt->fetch();

        if (!$bom) {
            return $this->jsonResponse($response, ['error' => 'BOM not found'], 404);
        }

        $stmt = $pdo->prepare("
            SELECT bi.*, c.name, c.part_number, c.category, c.package, c.value,
                   i.quantity as stock_quantity, i.unit_price
            FROM bom_items bi
            JOIN components c ON bi.component_id = c.id
            LEFT JOIN inventory i ON c.id = i.component_id
            WHERE bi.bom_id = ?
        ");
        $stmt->execute([$id]);
        $bom['items'] = $stmt->fetchAll();

        return $this->jsonResponse($response, ['data' => $bom]);
    }

    public function create(Request $request, Response $response): Response
    {
        $user = $request->getAttribute('user');
        $body = json_decode($request->getBody()->getContents(), true);
        $pdo = $this->db->getConnection();

        if (empty($body['name'])) {
            return $this->jsonResponse($response, ['error' => 'Name is required'], 400);
        }

        $pdo->beginTransaction();
        try {
            $stmt = $pdo->prepare("
                INSERT INTO boms (name, description, project_name, created_by)
                VALUES (?, ?, ?, ?)
            ");
            $stmt->execute([
                $body['name'],
                $body['description'] ?? null,
                $body['project_name'] ?? null,
                $user['id'] ?? null
            ]);

            $bomId = $pdo->lastInsertId();

            if (!empty($body['items']) && is_array($body['items'])) {
                foreach ($body['items'] as $item) {
                    if (!empty($item['component_id'])) {
                        $stmt = $pdo->prepare("
                            INSERT INTO bom_items (bom_id, component_id, quantity, reference_designator, notes)
                            VALUES (?, ?, ?, ?, ?)
                        ");
                        $stmt->execute([
                            $bomId,
                            $item['component_id'],
                            $item['quantity'] ?? 1,
                            $item['reference_designator'] ?? null,
                            $item['notes'] ?? null
                        ]);
                    }
                }
            }

            $pdo->commit();

            $stmt = $pdo->prepare("SELECT * FROM boms WHERE id = ?");
            $stmt->execute([$bomId]);
            $bom = $stmt->fetch();

            return $this->jsonResponse($response, ['message' => 'BOM created', 'data' => $bom], 201);
        } catch (\Exception $e) {
            $pdo->rollBack();
            return $this->jsonResponse($response, ['error' => 'Failed to create BOM: ' . $e->getMessage()], 500);
        }
    }

    public function update(Request $request, Response $response, array $args): Response
    {
        $id = $args['id'];
        $body = json_decode($request->getBody()->getContents(), true);
        $pdo = $this->db->getConnection();

        $stmt = $pdo->prepare("SELECT id FROM boms WHERE id = ?");
        $stmt->execute([$id]);
        if (!$stmt->fetch()) {
            return $this->jsonResponse($response, ['error' => 'BOM not found'], 404);
        }

        $pdo->beginTransaction();
        try {
            $stmt = $pdo->prepare("
                UPDATE boms 
                SET name = ?, description = ?, project_name = ?, updated_at = CURRENT_TIMESTAMP
                WHERE id = ?
            ");
            $stmt->execute([
                $body['name'] ?? null,
                $body['description'] ?? null,
                $body['project_name'] ?? null,
                $id
            ]);

            if (isset($body['items']) && is_array($body['items'])) {
                $stmt = $pdo->prepare("DELETE FROM bom_items WHERE bom_id = ?");
                $stmt->execute([$id]);

                foreach ($body['items'] as $item) {
                    if (!empty($item['component_id'])) {
                        $stmt = $pdo->prepare("
                            INSERT INTO bom_items (bom_id, component_id, quantity, reference_designator, notes)
                            VALUES (?, ?, ?, ?, ?)
                        ");
                        $stmt->execute([
                            $id,
                            $item['component_id'],
                            $item['quantity'] ?? 1,
                            $item['reference_designator'] ?? null,
                            $item['notes'] ?? null
                        ]);
                    }
                }
            }

            $pdo->commit();

            $stmt = $pdo->prepare("SELECT * FROM boms WHERE id = ?");
            $stmt->execute([$id]);
            $bom = $stmt->fetch();

            return $this->jsonResponse($response, ['message' => 'BOM updated', 'data' => $bom]);
        } catch (\Exception $e) {
            $pdo->rollBack();
            return $this->jsonResponse($response, ['error' => 'Failed to update BOM: ' . $e->getMessage()], 500);
        }
    }

    public function delete(Request $request, Response $response, array $args): Response
    {
        $id = $args['id'];
        $pdo = $this->db->getConnection();

        $stmt = $pdo->prepare("SELECT id FROM boms WHERE id = ?");
        $stmt->execute([$id]);
        if (!$stmt->fetch()) {
            return $this->jsonResponse($response, ['error' => 'BOM not found'], 404);
        }

        try {
            $stmt = $pdo->prepare("DELETE FROM boms WHERE id = ?");
            $stmt->execute([$id]);

            return $this->jsonResponse($response, ['message' => 'BOM deleted']);
        } catch (\Exception $e) {
            return $this->jsonResponse($response, ['error' => 'Failed to delete BOM: ' . $e->getMessage()], 500);
        }
    }

    public function export(Request $request, Response $response, array $args): Response
    {
        $id = $args['id'];
        $pdo = $this->db->getConnection();

        $stmt = $pdo->prepare("SELECT * FROM boms WHERE id = ?");
        $stmt->execute([$id]);
        $bom = $stmt->fetch();

        if (!$bom) {
            return $this->jsonResponse($response, ['error' => 'BOM not found'], 404);
        }

        $stmt = $pdo->prepare("
            SELECT bi.reference_designator, c.part_number, c.name, c.category, c.package, c.value, bi.quantity, bi.notes
            FROM bom_items bi
            JOIN components c ON bi.component_id = c.id
            WHERE bi.bom_id = ?
        ");
        $stmt->execute([$id]);
        $items = $stmt->fetchAll();

        $csv = "Reference,Part Number,Name,Category,Package,Value,Quantity,Notes\n";
        foreach ($items as $item) {
            $csv .= implode(',', array_map(function($val) {
                return '"' . str_replace('"', '""', $val ?? '') . '"';
            }, $item)) . "\n";
        }

        $response->getBody()->write($csv);
        return $response
            ->withHeader('Content-Type', 'text/csv')
            ->withHeader('Content-Disposition', 'attachment; filename="' . $bom['name'] . '.csv"');
    }

    private function jsonResponse(Response $response, array $data, int $status = 200): Response
    {
        $response->getBody()->write(json_encode($data));
        return $response->withHeader('Content-Type', 'application/json')->withStatus($status);
    }
}
