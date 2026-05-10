<?php
require_once __DIR__ . '/../includes/db.php';

handleCORS();
$db = getDB();
$method = $_SERVER['REQUEST_METHOD'];

switch ($method) {
    case 'GET':
        $id = isset($_GET['id']) ? intval($_GET['id']) : null;
        $search = isset($_GET['search']) ? trim($_GET['search']) : null;
        $type = isset($_GET['type']) ? trim($_GET['type']) : null;
        
        if ($id) {
            $stmt = $db->prepare("SELECT d.*, c.name as cabinet_name FROM devices d LEFT JOIN cabinets c ON d.cabinet_id = c.id WHERE d.id = ?");
            $stmt->execute([$id]);
            $device = $stmt->fetch();
            
            if ($device) {
                $stmt = $db->prepare("SELECT nc.*, s.name as source_name, t.name as target_name 
                    FROM network_connections nc 
                    LEFT JOIN devices s ON nc.source_device_id = s.id 
                    LEFT JOIN devices t ON nc.target_device_id = t.id 
                    WHERE nc.source_device_id = ? OR nc.target_device_id = ?");
                $stmt->execute([$id, $id]);
                $device['connections'] = $stmt->fetchAll();
                jsonResponse(['success' => true, 'data' => $device]);
            }
            jsonResponse(['success' => false, 'message' => '设备不存在'], 404);
        }
        
        $where = [];
        $params = [];
        
        if ($search) {
            $where[] = "(d.name LIKE ? OR d.model LIKE ? OR d.serial_number LIKE ? OR d.ip_address LIKE ?)";
            $like = "%$search%";
            $params = array_merge($params, [$like, $like, $like, $like]);
        }
        
        if ($type) {
            $where[] = "d.type = ?";
            $params[] = $type;
        }
        
        $whereClause = $where ? 'WHERE ' . implode(' AND ', $where) : '';
        
        $stmt = $db->prepare("SELECT d.*, c.name as cabinet_name FROM devices d LEFT JOIN cabinets c ON d.cabinet_id = c.id $whereClause ORDER BY d.id DESC");
        $stmt->execute($params);
        $devices = $stmt->fetchAll();
        
        jsonResponse(['success' => true, 'data' => $devices]);
        break;
        
    case 'POST':
        $input = getInput();
        $stmt = $db->prepare("INSERT INTO devices (name, type, model, serial_number, cabinet_id, unit_start, unit_height, ip_address, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)");
        $stmt->execute([
            $input['name'],
            $input['type'] ?? '',
            $input['model'] ?? '',
            $input['serial_number'] ?? '',
            intval($input['cabinet_id'] ?? null),
            intval($input['unit_start'] ?? null),
            intval($input['unit_height'] ?? 1),
            $input['ip_address'] ?? '',
            $input['status'] ?? 'active'
        ]);
        jsonResponse(['success' => true, 'data' => ['id' => $db->lastInsertId()]]);
        break;
        
    case 'PUT':
        $input = getInput();
        $id = intval($_GET['id'] ?? $input['id']);
        $stmt = $db->prepare("UPDATE devices SET name = ?, type = ?, model = ?, serial_number = ?, cabinet_id = ?, unit_start = ?, unit_height = ?, ip_address = ?, status = ? WHERE id = ?");
        $stmt->execute([
            $input['name'],
            $input['type'] ?? '',
            $input['model'] ?? '',
            $input['serial_number'] ?? '',
            intval($input['cabinet_id'] ?? null),
            intval($input['unit_start'] ?? null),
            intval($input['unit_height'] ?? 1),
            $input['ip_address'] ?? '',
            $input['status'] ?? 'active',
            $id
        ]);
        jsonResponse(['success' => true, 'data' => ['id' => $id]]);
        break;
        
    case 'DELETE':
        $id = intval($_GET['id']);
        $db->prepare("DELETE FROM network_connections WHERE source_device_id = ? OR target_device_id = ?")->execute([$id, $id]);
        $db->prepare("DELETE FROM power_ports WHERE device_id = ?")->execute([$id]);
        $stmt = $db->prepare("DELETE FROM devices WHERE id = ?");
        $stmt->execute([$id]);
        jsonResponse(['success' => true]);
        break;
}
