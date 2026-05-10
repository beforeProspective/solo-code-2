<?php
require_once __DIR__ . '/../includes/db.php';

handleCORS();
$db = getDB();

$totalCabinets = $db->query("SELECT COUNT(*) as count FROM cabinets")->fetch()['count'];
$totalDevices = $db->query("SELECT COUNT(*) as count FROM devices")->fetch()['count'];
$totalConnections = $db->query("SELECT COUNT(*) as count FROM network_connections")->fetch()['count'];

$deviceTypes = $db->query("SELECT type, COUNT(*) as count FROM devices GROUP BY type")->fetchAll();

$cabinetUtilization = $db->query("
    SELECT c.id, c.name, c.total_units,
        COALESCE(SUM(d.unit_height), 0) as used_units
    FROM cabinets c
    LEFT JOIN devices d ON c.id = d.cabinet_id
    GROUP BY c.id, c.name, c.total_units
")->fetchAll();

foreach ($cabinetUtilization as &$cab) {
    $cab['used_units'] = intval($cab['used_units']);
    $cab['utilization'] = $cab['total_units'] > 0 ? round(($cab['used_units'] / $cab['total_units']) * 100, 2) : 0;
}

jsonResponse([
    'success' => true,
    'data' => [
        'total_cabinets' => intval($totalCabinets),
        'total_devices' => intval($totalDevices),
        'total_connections' => intval($totalConnections),
        'device_types' => $deviceTypes,
        'cabinet_utilization' => $cabinetUtilization
    ]
]);
