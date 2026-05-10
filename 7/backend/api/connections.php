<?php
require_once __DIR__ . '/../includes/db.php';

handleCORS();
$db = getDB();
$method = $_SERVER['REQUEST_METHOD'];

switch ($method) {
    case 'GET':
        $id = isset($_GET['id']) ? intval($_GET['id']) : null;
        $device_id = isset($_GET['device_id']) ? intval($_GET['device_id']) : null;
        
        if ($id) {
            $stmt = $db->prepare("SELECT nc.*, s.name as source_name, t.name as target_name, c1.name as source_cabinet, c2.name as target_cabinet
                FROM network_connections nc
                LEFT JOIN devices s ON nc.source_device_id = s.id
                LEFT JOIN devices t ON nc.target_device_id = t.id
                LEFT JOIN cabinets c1 ON s.cabinet_id = c1.id
                LEFT JOIN cabinets c2 ON t.cabinet_id = c2.id
                WHERE nc.id = ?");
            $stmt->execute([$id]);
            $conn = $stmt->fetch();
            if ($conn) {
                jsonResponse(['success' => true, 'data' => $conn]);
            }
            jsonResponse(['success' => false, 'message' => '连接不存在'], 404);
        }
        
        if ($device_id) {
            $stmt = $db->prepare("SELECT nc.*, s.name as source_name, t.name as target_name
                FROM network_connections nc
                LEFT JOIN devices s ON nc.source_device_id = s.id
                LEFT JOIN devices t ON nc.target_device_id = t.id
                WHERE nc.source_device_id = ? OR nc.target_device_id = ?");
            $stmt->execute([$device_id, $device_id]);
            jsonResponse(['success' => true, 'data' => $stmt->fetchAll()]);
        }
        
        $stmt = $db->query("SELECT nc.*, s.name as source_name, t.name as target_name, c1.name as source_cabinet, c2.name as target_cabinet
            FROM network_connections nc
            LEFT JOIN devices s ON nc.source_device_id = s.id
            LEFT JOIN devices t ON nc.target_device_id = t.id
            LEFT JOIN cabinets c1 ON s.cabinet_id = c1.id
            LEFT JOIN cabinets c2 ON t.cabinet_id = c2.id
            ORDER BY nc.id DESC");
        jsonResponse(['success' => true, 'data' => $stmt->fetchAll()]);
        break;
        
    case 'POST':
        $input = getInput();
        $stmt = $db->prepare("INSERT INTO network_connections (source_device_id, source_port, target_device_id, target_port, connection_type, notes) VALUES (?, ?, ?, ?, ?, ?)");
        $stmt->execute([
            intval($input['source_device_id']),
            $input['source_port'],
            intval($input['target_device_id']),
            $input['target_port'],
            $input['connection_type'] ?? '网络',
            $input['notes'] ?? ''
        ]);
        jsonResponse(['success' => true, 'data' => ['id' => $db->lastInsertId()]]);
        break;
        
    case 'PUT':
        $input = getInput();
        $id = intval($_GET['id'] ?? $input['id']);
        $stmt = $db->prepare("UPDATE network_connections SET source_device_id = ?, source_port = ?, target_device_id = ?, target_port = ?, connection_type = ?, notes = ? WHERE id = ?");
        $stmt->execute([
            intval($input['source_device_id']),
            $input['source_port'],
            intval($input['target_device_id']),
            $input['target_port'],
            $input['connection_type'] ?? '网络',
            $input['notes'] ?? '',
            $id
        ]);
        jsonResponse(['success' => true, 'data' => ['id' => $id]]);
        break;
        
    case 'DELETE':
        $id = intval($_GET['id']);
        $stmt = $db->prepare("DELETE FROM network_connections WHERE id = ?");
        $stmt->execute([$id]);
        jsonResponse(['success' => true]);
        break;
}
