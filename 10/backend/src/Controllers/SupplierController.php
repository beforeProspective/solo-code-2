<?php

namespace App\Controllers;

use App\Config\Database;
use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Message\ServerRequestInterface as Request;

class SupplierController
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
        $perPage = min(100, max(1, (int)($queryParams['perPage'] ?? 50)));
        $offset = ($page - 1) * $perPage;

        $countStmt = $pdo->query("SELECT COUNT(*) as total FROM suppliers");
        $total = $countStmt->fetch()['total'];

        $stmt = $pdo->prepare("SELECT * FROM suppliers ORDER BY name ASC LIMIT :limit OFFSET :offset");
        $stmt->bindValue(':limit', $perPage, \PDO::PARAM_INT);
        $stmt->bindValue(':offset', $offset, \PDO::PARAM_INT);
        $stmt->execute();

        $suppliers = $stmt->fetchAll();

        return $this->jsonResponse($response, [
            'data' => $suppliers,
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

        $stmt = $pdo->prepare("SELECT * FROM suppliers WHERE id = ?");
        $stmt->execute([$id]);
        $supplier = $stmt->fetch();

        if (!$supplier) {
            return $this->jsonResponse($response, ['error' => 'Supplier not found'], 404);
        }

        $stmt = $pdo->prepare("
            SELECT c.*, i.quantity 
            FROM inventory i 
            JOIN components c ON i.component_id = c.id 
            WHERE i.supplier_id = ?
        ");
        $stmt->execute([$id]);
        $supplier['components'] = $stmt->fetchAll();

        return $this->jsonResponse($response, ['data' => $supplier]);
    }

    public function create(Request $request, Response $response): Response
    {
        $body = json_decode($request->getBody()->getContents(), true);
        $pdo = $this->db->getConnection();

        if (empty($body['name'])) {
            return $this->jsonResponse($response, ['error' => 'Name is required'], 400);
        }

        try {
            $stmt = $pdo->prepare("
                INSERT INTO suppliers (name, contact_person, phone, email, address, website)
                VALUES (?, ?, ?, ?, ?, ?)
            ");
            $stmt->execute([
                $body['name'],
                $body['contact_person'] ?? null,
                $body['phone'] ?? null,
                $body['email'] ?? null,
                $body['address'] ?? null,
                $body['website'] ?? null,
            ]);

            $id = $pdo->lastInsertId();
            
            $stmt = $pdo->prepare("SELECT * FROM suppliers WHERE id = ?");
            $stmt->execute([$id]);
            $supplier = $stmt->fetch();

            return $this->jsonResponse($response, ['message' => 'Supplier created', 'data' => $supplier], 201);
        } catch (\Exception $e) {
            return $this->jsonResponse($response, ['error' => 'Failed to create supplier: ' . $e->getMessage()], 500);
        }
    }

    public function update(Request $request, Response $response, array $args): Response
    {
        $id = $args['id'];
        $body = json_decode($request->getBody()->getContents(), true);
        $pdo = $this->db->getConnection();

        $stmt = $pdo->prepare("SELECT id FROM suppliers WHERE id = ?");
        $stmt->execute([$id]);
        if (!$stmt->fetch()) {
            return $this->jsonResponse($response, ['error' => 'Supplier not found'], 404);
        }

        try {
            $stmt = $pdo->prepare("
                UPDATE suppliers 
                SET name = ?, contact_person = ?, phone = ?, email = ?, address = ?, website = ?
                WHERE id = ?
            ");
            $stmt->execute([
                $body['name'] ?? null,
                $body['contact_person'] ?? null,
                $body['phone'] ?? null,
                $body['email'] ?? null,
                $body['address'] ?? null,
                $body['website'] ?? null,
                $id
            ]);

            $stmt = $pdo->prepare("SELECT * FROM suppliers WHERE id = ?");
            $stmt->execute([$id]);
            $supplier = $stmt->fetch();

            return $this->jsonResponse($response, ['message' => 'Supplier updated', 'data' => $supplier]);
        } catch (\Exception $e) {
            return $this->jsonResponse($response, ['error' => 'Failed to update supplier: ' . $e->getMessage()], 500);
        }
    }

    public function delete(Request $request, Response $response, array $args): Response
    {
        $id = $args['id'];
        $pdo = $this->db->getConnection();

        $stmt = $pdo->prepare("SELECT id FROM suppliers WHERE id = ?");
        $stmt->execute([$id]);
        if (!$stmt->fetch()) {
            return $this->jsonResponse($response, ['error' => 'Supplier not found'], 404);
        }

        try {
            $stmt = $pdo->prepare("DELETE FROM suppliers WHERE id = ?");
            $stmt->execute([$id]);

            return $this->jsonResponse($response, ['message' => 'Supplier deleted']);
        } catch (\Exception $e) {
            return $this->jsonResponse($response, ['error' => 'Failed to delete supplier: ' . $e->getMessage()], 500);
        }
    }

    private function jsonResponse(Response $response, array $data, int $status = 200): Response
    {
        $response->getBody()->write(json_encode($data));
        return $response->withHeader('Content-Type', 'application/json')->withStatus($status);
    }
}
