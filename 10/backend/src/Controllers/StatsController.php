<?php

namespace App\Controllers;

use App\Config\Database;
use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Message\ServerRequestInterface as Request;

class StatsController
{
    private Database $db;

    public function __construct(Database $db)
    {
        $this->db = $db;
    }

    public function getOverview(Request $request, Response $response): Response
    {
        $pdo = $this->db->getConnection();

        $stats = [];

        $stmt = $pdo->query("SELECT COUNT(*) as count FROM components");
        $stats['total_components'] = $stmt->fetch()['count'];

        $stmt = $pdo->query("SELECT COUNT(*) as count FROM suppliers");
        $stats['total_suppliers'] = $stmt->fetch()['count'];

        $stmt = $pdo->query("SELECT COUNT(*) as count FROM boms");
        $stats['total_boms'] = $stmt->fetch()['count'];

        $stmt = $pdo->query("SELECT COALESCE(SUM(quantity), 0) as total FROM inventory");
        $stats['total_inventory'] = $stmt->fetch()['total'];

        $stmt = $pdo->query("SELECT COUNT(*) as count FROM inventory WHERE quantity <= min_stock");
        $stats['low_stock_count'] = $stmt->fetch()['count'];

        $stmt = $pdo->query("SELECT COALESCE(SUM(quantity * unit_price), 0) as value FROM inventory");
        $stats['inventory_value'] = (float)$stmt->fetch()['value'];

        return $this->jsonResponse($response, ['data' => $stats]);
    }

    public function getByCategory(Request $request, Response $response): Response
    {
        $pdo = $this->db->getConnection();

        $stmt = $pdo->query("
            SELECT c.category, COUNT(*) as count, COALESCE(SUM(i.quantity), 0) as total_quantity
            FROM components c
            LEFT JOIN inventory i ON c.id = i.component_id
            WHERE c.category IS NOT NULL
            GROUP BY c.category
            ORDER BY count DESC
        ");

        $categories = $stmt->fetchAll();

        return $this->jsonResponse($response, ['data' => $categories]);
    }

    public function getByPackage(Request $request, Response $response): Response
    {
        $pdo = $this->db->getConnection();

        $stmt = $pdo->query("
            SELECT c.package, COUNT(*) as count
            FROM components c
            WHERE c.package IS NOT NULL
            GROUP BY c.package
            ORDER BY count DESC
            LIMIT 15
        ");

        $packages = $stmt->fetchAll();

        return $this->jsonResponse($response, ['data' => $packages]);
    }

    public function getLowStock(Request $request, Response $response): Response
    {
        $pdo = $this->db->getConnection();
        $queryParams = $request->getQueryParams();
        
        $limit = min(100, max(1, (int)($queryParams['limit'] ?? 20)));

        $stmt = $pdo->prepare("
            SELECT c.*, i.quantity, i.min_stock, i.location, s.name as supplier_name
            FROM components c
            JOIN inventory i ON c.id = i.component_id
            LEFT JOIN suppliers s ON i.supplier_id = s.id
            WHERE i.quantity <= i.min_stock
            ORDER BY i.quantity ASC
            LIMIT :limit
        ");
        $stmt->bindValue(':limit', $limit, \PDO::PARAM_INT);
        $stmt->execute();

        $lowStock = $stmt->fetchAll();

        return $this->jsonResponse($response, ['data' => $lowStock, 'count' => count($lowStock)]);
    }

    public function getBySupplier(Request $request, Response $response): Response
    {
        $pdo = $this->db->getConnection();

        $stmt = $pdo->query("
            SELECT s.id, s.name, 
                   COUNT(DISTINCT i.component_id) as component_count,
                   COALESCE(SUM(i.quantity), 0) as total_quantity,
                   COALESCE(SUM(i.quantity * i.unit_price), 0) as total_value
            FROM suppliers s
            LEFT JOIN inventory i ON s.id = i.supplier_id
            GROUP BY s.id, s.name
            ORDER BY component_count DESC
        ");

        $suppliers = $stmt->fetchAll();

        return $this->jsonResponse($response, ['data' => $suppliers]);
    }

    public function getRecentComponents(Request $request, Response $response): Response
    {
        $pdo = $this->db->getConnection();
        $queryParams = $request->getQueryParams();
        
        $limit = min(50, max(1, (int)($queryParams['limit'] ?? 10)));

        $stmt = $pdo->prepare("
            SELECT c.*, i.quantity
            FROM components c
            LEFT JOIN inventory i ON c.id = i.component_id
            ORDER BY c.created_at DESC
            LIMIT :limit
        ");
        $stmt->bindValue(':limit', $limit, \PDO::PARAM_INT);
        $stmt->execute();

        $components = $stmt->fetchAll();

        return $this->jsonResponse($response, ['data' => $components]);
    }

    private function jsonResponse(Response $response, array $data, int $status = 200): Response
    {
        $response->getBody()->write(json_encode($data));
        return $response->withHeader('Content-Type', 'application/json')->withStatus($status);
    }
}
