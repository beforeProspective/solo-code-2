<?php
require_once __DIR__ . '/../includes/db.php';

try {
    $db = getDB();
    
    $db->exec("CREATE TABLE IF NOT EXISTS cabinets (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        location TEXT,
        total_units INTEGER DEFAULT 42,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )");
    
    $db->exec("CREATE TABLE IF NOT EXISTS devices (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        type TEXT,
        model TEXT,
        serial_number TEXT,
        cabinet_id INTEGER,
        unit_start INTEGER,
        unit_height INTEGER DEFAULT 1,
        ip_address TEXT,
        status TEXT DEFAULT 'active',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (cabinet_id) REFERENCES cabinets(id)
    )");
    
    $db->exec("CREATE TABLE IF NOT EXISTS power_ports (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        device_id INTEGER,
        port_number INTEGER,
        label TEXT,
        status TEXT DEFAULT 'connected',
        FOREIGN KEY (device_id) REFERENCES devices(id)
    )");
    
    $db->exec("CREATE TABLE IF NOT EXISTS network_connections (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        source_device_id INTEGER,
        source_port TEXT,
        target_device_id INTEGER,
        target_port TEXT,
        connection_type TEXT,
        notes TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (source_device_id) REFERENCES devices(id),
        FOREIGN KEY (target_device_id) REFERENCES devices(id)
    )");
    
    $stmt = $db->query("SELECT COUNT(*) as count FROM cabinets");
    if ($stmt->fetch()['count'] === 0) {
        $cabinets = [
            ['name' => 'A01', 'location' => '数据中心A区-1排', 'total_units' => 42],
            ['name' => 'A02', 'location' => '数据中心A区-1排', 'total_units' => 42],
            ['name' => 'B01', 'location' => '数据中心B区-1排', 'total_units' => 42],
            ['name' => 'B02', 'location' => '数据中心B区-2排', 'total_units' => 42],
        ];
        
        foreach ($cabinets as $cab) {
            $stmt = $db->prepare("INSERT INTO cabinets (name, location, total_units) VALUES (?, ?, ?)");
            $stmt->execute([$cab['name'], $cab['location'], $cab['total_units']]);
        }
        
        $devices = [
            ['name' => '服务器01', 'type' => '服务器', 'model' => 'Dell R740', 'serial_number' => 'SN001', 'cabinet_id' => 1, 'unit_start' => 1, 'unit_height' => 2, 'ip_address' => '192.168.1.101'],
            ['name' => '服务器02', 'type' => '服务器', 'model' => 'HP DL380', 'serial_number' => 'SN002', 'cabinet_id' => 1, 'unit_start' => 3, 'unit_height' => 2, 'ip_address' => '192.168.1.102'],
            ['name' => '交换机01', 'type' => '交换机', 'model' => 'Cisco C9300', 'serial_number' => 'SN003', 'cabinet_id' => 1, 'unit_start' => 5, 'unit_height' => 1, 'ip_address' => '192.168.1.1'],
            ['name' => '服务器03', 'type' => '服务器', 'model' => 'Dell R740', 'serial_number' => 'SN004', 'cabinet_id' => 2, 'unit_start' => 1, 'unit_height' => 2, 'ip_address' => '192.168.1.103'],
            ['name' => '存储设备01', 'type' => '存储', 'model' => 'EMC VNX', 'serial_number' => 'SN005', 'cabinet_id' => 2, 'unit_start' => 10, 'unit_height' => 4, 'ip_address' => '192.168.1.201'],
            ['name' => '防火墙01', 'type' => '防火墙', 'model' => 'Palo Alto PA-2200', 'serial_number' => 'SN006', 'cabinet_id' => 3, 'unit_start' => 1, 'unit_height' => 1, 'ip_address' => '192.168.1.254'],
            ['name' => '路由器01', 'type' => '路由器', 'model' => 'Cisco ISR4331', 'serial_number' => 'SN007', 'cabinet_id' => 3, 'unit_start' => 2, 'unit_height' => 1, 'ip_address' => '192.168.1.253'],
        ];
        
        foreach ($devices as $dev) {
            $stmt = $db->prepare("INSERT INTO devices (name, type, model, serial_number, cabinet_id, unit_start, unit_height, ip_address) VALUES (?, ?, ?, ?, ?, ?, ?, ?)");
            $stmt->execute([$dev['name'], $dev['type'], $dev['model'], $dev['serial_number'], $dev['cabinet_id'], $dev['unit_start'], $dev['unit_height'], $dev['ip_address']]);
        }
        
        $connections = [
            ['source_device_id' => 1, 'source_port' => 'eth0', 'target_device_id' => 3, 'target_port' => 'Gi1/0/1', 'connection_type' => '网络'],
            ['source_device_id' => 2, 'source_port' => 'eth0', 'target_device_id' => 3, 'target_port' => 'Gi1/0/2', 'connection_type' => '网络'],
            ['source_device_id' => 4, 'source_port' => 'eth0', 'target_device_id' => 3, 'target_port' => 'Gi1/0/3', 'connection_type' => '网络'],
            ['source_device_id' => 3, 'source_port' => 'Gi1/0/24', 'target_device_id' => 7, 'target_port' => 'Gi0/0/0', 'connection_type' => '网络'],
            ['source_device_id' => 7, 'source_port' => 'Gi0/0/1', 'target_device_id' => 6, 'target_port' => 'eth1', 'connection_type' => '网络'],
        ];
        
        foreach ($connections as $conn) {
            $stmt = $db->prepare("INSERT INTO network_connections (source_device_id, source_port, target_device_id, target_port, connection_type) VALUES (?, ?, ?, ?, ?)");
            $stmt->execute([$conn['source_device_id'], $conn['source_port'], $conn['target_device_id'], $conn['target_port'], $conn['connection_type']]);
        }
    }
    
    echo "数据库初始化成功！\n";
} catch (Exception $e) {
    echo "错误: " . $e->getMessage() . "\n";
}
