<?php
require_once __DIR__ . '/../includes/db.php';

handleCORS();
$db = getDB();

if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    jsonResponse(['success' => false, 'message' => '仅支持GET请求'], 405);
}

$device_ids = isset($_GET['device_ids']) ? explode(',', $_GET['device_ids']) : [];
$device_ids = array_map('intval', array_filter($device_ids));

if (empty($device_ids)) {
    jsonResponse(['success' => false, 'message' => '请指定设备ID'], 400);
}

$placeholders = implode(',', array_fill(0, count($device_ids), '?'));
$stmt = $db->prepare("SELECT * FROM devices WHERE id IN ($placeholders)");
$stmt->execute($device_ids);
$devices = $stmt->fetchAll();

if (empty($devices)) {
    jsonResponse(['success' => false, 'message' => '未找到设备'], 404);
}

function generateBarcode($text) {
    return strtoupper(bin2hex(substr(md5($text), 0, 8)));
}

function formatLabelHTML($device) {
    $barcode = generateBarcode($device['id'] . '-' . ($device['serial_number'] ?? 'N/A'));
    return '
    <div class="label">
        <div class="barcode">' . $barcode . '</div>
        <table class="label-table">
            <tr><th>设备名称</th><td>' . htmlspecialchars($device['name']) . '</td></tr>
            <tr><th>型号</th><td>' . htmlspecialchars($device['model'] ?? 'N/A') . '</td></tr>
            <tr><th>序列号</th><td>' . htmlspecialchars($device['serial_number'] ?? 'N/A') . '</td></tr>
            <tr><th>IP地址</th><td>' . htmlspecialchars($device['ip_address'] ?? 'N/A') . '</td></tr>
            <tr><th>位置</th><td>' . htmlspecialchars($device['cabinet_name'] ?? 'N/A') . '</td></tr>
        </table>
    </div>';
}

$labelsHTML = '';
foreach ($devices as $dev) {
    $labelsHTML .= formatLabelHTML($dev);
}

$html = '<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <title>资产标签</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: "Microsoft YaHei", sans-serif; background: #fff; padding: 20px; }
        .labels-container { display: flex; flex-wrap: wrap; gap: 20px; }
        .label { 
            width: 280px; 
            border: 2px solid #333; 
            padding: 15px; 
            background: #fff;
            page-break-inside: avoid;
        }
        .barcode { 
            font-family: monospace; 
            font-size: 12px; 
            letter-spacing: 3px; 
            text-align: center; 
            padding: 8px; 
            background: #f0f0f0;
            margin-bottom: 10px;
            border: 1px dashed #999;
        }
        .label-table { width: 100%; font-size: 12px; border-collapse: collapse; }
        .label-table th { 
            text-align: left; 
            width: 70px; 
            padding: 3px 2px; 
            color: #666;
            font-weight: normal;
        }
        .label-table td { padding: 3px 2px; word-break: break-all; }
        @media print {
            body { padding: 0; }
            .label { page-break-inside: avoid; }
        }
    </style>
</head>
<body>
    <div class="labels-container">' . $labelsHTML . '</div>
</body>
</html>';

$filename = 'asset_labels_' . date('YmdHis') . '.html';
$filepath = __DIR__ . '/../pdfs/' . $filename;
$dir = dirname($filepath);
if (!is_dir($dir)) {
    mkdir($dir, 0777, true);
}
file_put_contents($filepath, $html);

$baseUrl = (isset($_SERVER['HTTPS']) ? 'https' : 'http') . '://' . $_SERVER['HTTP_HOST'];
$relativePath = str_replace('\\', '/', substr($filepath, strlen(__DIR__ . '/../')));

jsonResponse([
    'success' => true,
    'data' => [
        'filename' => $filename,
        'html_content' => $html,
        'url' => $baseUrl . '/backend/' . $relativePath,
        'device_count' => count($devices)
    ]
]);
