<?php
require_once __DIR__ . '/../includes/db.php';

handleCORS();
$db = getDB();
$method = $_SERVER['REQUEST_METHOD'];

switch ($method) {
    case 'GET':
        $id = isset($_GET['id']) ? intval($_GET['id']) : null;
        
        if ($id) {
            $stmt = $db->prepare("SELECT * FROM cabinets WHERE id = ?");
            $stmt->execute([$id]);
            $cabinet = $stmt->fetch();
            
            if ($cabinet) {
                $stmt = $db->prepare("SELECT * FROM devices WHERE cabinet_id = ? ORDER BY unit_start");
                $stmt->execute([$id]);
                $cabinet['devices'] = $stmt->fetchAll();
                jsonResponse(['success' => true, 'data' => $cabinet]);
            }
            jsonResponse(['success' => false, 'message' => '机柜不存在'], 404);
        }
        
        $stmt = $db->query("SELECT * FROM cabinets ORDER BY name");
        $cabinets = $stmt->fetchAll();
        
        foreach ($cabinets as &$cab) {
            $stmt = $db->prepare("SELECT SUM(unit_height) as used FROM devices WHERE cabinet_id = ?");
            $stmt->execute([$cab['id']]);
            $used = $stmt->fetch()['used'] ?? 0;
            $cab['used_units'] = intval($used);
            $cab['available_units'] = $cab['total_units'] - $used;
            $cab['utilization'] = round(($used / $cab['total_units']) * 100, 2);
        }
        
        jsonResponse(['success' => true, 'data' => $cabinets]);
        break;
        
    case 'POST':
        $input = getInput();
        $stmt = $db->prepare("INSERT INTO cabinets (name, location, total_units) VALUES (?, ?, ?)");
        $stmt->execute([
            $input['name'],
            $input['location'] ?? '',
            intval($input['total_units'] ?? 42)
        ]);
        jsonResponse(['success' => true, 'data' => ['id' => $db->lastInsertId()]]);
        break;
        
    case 'PUT':
        $input = getInput();
        $id = intval($_GET['id'] ?? $input['id']);
        $stmt = $db->prepare("UPDATE cabinets SET name = ?, location = ?, total_units = ? WHERE id = ?");
        $stmt->execute([
            $input['name'],
            $input['location'] ?? '',
            intval($input['total_units'] ?? 42),
            $id
        ]);
        jsonResponse(['success' => true, 'data' => ['id' => $id]]);
        break;
        
    case 'DELETE':
        $id = intval($_GET['id']);
        $stmt = $db->prepare("DELETE FROM cabinets WHERE id = ?");
        $stmt->execute([$id]);
        jsonResponse(['success' => true]);
        break;
}
