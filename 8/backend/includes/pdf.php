<?php
function generateInvoicePdf($invoiceId, $db) {
    $stmt = $db->prepare('SELECT i.*, c.name as customer_name, c.email as customer_email, c.phone as customer_phone, c.address as customer_address
                          FROM invoices i
                          LEFT JOIN customers c ON i.customer_id = c.id
                          WHERE i.id = ?');
    $stmt->execute([$invoiceId]);
    $invoice = $stmt->fetch(PDO::FETCH_ASSOC);
    
    if (!$invoice) {
        http_response_code(404);
        echo json_encode(['error' => 'Invoice not found']);
        exit;
    }
    
    $stmt = $db->prepare('SELECT * FROM invoice_items WHERE invoice_id = ?');
    $stmt->execute([$invoiceId]);
    $items = $stmt->fetchAll(PDO::FETCH_ASSOC);
    
    $html = buildInvoiceHtml($invoice, $items);
    
    header('Content-Type: application/pdf');
    header('Content-Disposition: attachment; filename="invoice-' . $invoice['invoice_number'] . '.pdf"');
    
    $vendorDir = __DIR__ . '/../vendor';
    
    require_once $vendorDir . '/autoload.php';
    
    if (!class_exists('Mpdf\Mpdf')) {
        spl_autoload_register(function ($class) use ($vendorDir) {
            $prefix = 'Mpdf\\';
            $len = strlen($prefix);
            if (strncmp($prefix, $class, $len) !== 0) return;
            $relative_class = substr($class, $len);
            $file = $vendorDir . '/mpdf/mpdf/src/' . str_replace('\\', '/', $relative_class) . '.php';
            if (file_exists($file)) require_once $file;
        });
        require_once $vendorDir . '/mpdf/mpdf/src/functions.php';
    }
    
    $defaultConfig = (new \Mpdf\Config\ConfigVariables())->getDefaults();
    $fontDirs = $defaultConfig['fontDir'];
    $fontDirs[] = $vendorDir . '/mpdf/mpdf/ttfonts';
    
    $defaultFontConfig = (new \Mpdf\Config\FontVariables())->getDefaults();
    $fontData = $defaultFontConfig['fontdata'];
    
    $fontData['simsun'] = [
        'R' => 'simsun.ttc',
        'B' => 'simsun.ttc',
        'I' => 'simsun.ttc',
        'BI' => 'simsun.ttc',
        'TTCfontID' => [
            'R' => 1,
            'B' => 1,
            'I' => 1,
            'BI' => 1,
        ],
        'useOTL' => 0xFF,
    ];
    
    $mpdf = new \Mpdf\Mpdf([
        'mode' => 'zh-CN',
        'format' => 'A4',
        'default_font_size' => 12,
        'default_font' => 'simsun',
        'margin_left' => 20,
        'margin_right' => 20,
        'margin_top' => 20,
        'margin_bottom' => 20,
        'fontDir' => $fontDirs,
        'fontdata' => $fontData,
        'useSubstitutions' => true,
    ]);
    
    $mpdf->autoScriptToLang = true;
    $mpdf->autoLangToFont = true;
    $mpdf->SetTitle('Invoice ' . $invoice['invoice_number']);
    $mpdf->WriteHTML($html);
    $mpdf->Output();
    exit;
}

function buildInvoiceHtml($invoice, $items) {
    $statusText = [
        'draft' => '草稿',
        'sent' => '已发送',
        'paid' => '已付款',
        'overdue' => '已逾期'
    ][$invoice['status']] ?? $invoice['status'];
    
    $statusColor = [
        'draft' => '#6b7280',
        'sent' => '#3b82f6',
        'paid' => '#10b981',
        'overdue' => '#ef4444'
    ][$invoice['status']] ?? '#6b7280';
    
    $itemsHtml = '';
    $i = 1;
    foreach ($items as $item) {
        $lineTotal = (float)$item['price'] * (int)$item['quantity'];
        $itemsHtml .= '<tr>
            <td style="border:1px solid #ddd; padding:10px; text-align:center; width:5%;">' . $i++ . '</td>
            <td style="border:1px solid #ddd; padding:10px; width:45%;">' . htmlspecialchars($item['description']) . '</td>
            <td style="border:1px solid #ddd; padding:10px; text-align:center; width:10%;">' . (int)$item['quantity'] . '</td>
            <td style="border:1px solid #ddd; padding:10px; text-align:right; width:15%;">' . number_format((float)$item['price'], 2) . '</td>
            <td style="border:1px solid #ddd; padding:10px; text-align:center; width:10%;">' . (float)$item['tax_rate'] . '%</td>
            <td style="border:1px solid #ddd; padding:10px; text-align:right; width:15%;">' . number_format($lineTotal, 2) . '</td>
        </tr>';
    }
    
    return '<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <style>
        body { font-family: simsun, "SimSun", "宋体", sans-serif; font-size: 12px; color: #333; }
        h1 { font-size: 28px; color: #2563eb; margin: 0; text-align: center; font-weight: bold; }
        h2 { font-size: 14px; color: #666; margin: 5px 0 20px 0; text-align: center; font-weight: normal; }
        h3 { font-size: 14px; color: #333; margin: 20px 0 10px 0; padding-bottom: 8px; border-bottom: 2px solid #2563eb; font-weight: bold; }
        table { width: 100%; border-collapse: collapse; }
        .info-table td { padding: 8px 10px; vertical-align: top; }
        .info-label { font-weight: bold; color: #555; width: 25%; }
        .gray-box { background-color: #f9fafb; padding: 15px; border-radius: 8px; }
        .total-label { text-align: right; padding: 8px 15px; }
        .total-value { text-align: right; padding: 8px 15px; font-weight: bold; }
        .footer { text-align: center; margin-top: 40px; color: #9ca3af; font-size: 11px; }
        .status-badge { background-color: ' . $statusColor . '; color: white; padding: 4px 12px; border-radius: 4px; font-weight: bold; font-size: 11px; }
        th { background-color: #eff6ff; font-weight: bold; text-align: left; padding: 10px; border: 1px solid #ddd; }
        .total-amount { font-size: 16px; color: #2563eb; }
        .paid-amount { color: #10b981; }
        .due-amount { color: #ef4444; }
    </style>
</head>
<body>
    <h1>发 票</h1>
    <h2>INVOICE</h2>
    
    <div class="gray-box">
        <table class="info-table">
            <tr>
                <td class="info-label">发票编号</td>
                <td>' . htmlspecialchars($invoice['invoice_number']) . '</td>
                <td class="info-label">状态</td>
                <td><span class="status-badge">' . $statusText . '</span></td>
            </tr>
            <tr>
                <td class="info-label">开具日期</td>
                <td>' . date('Y-m-d', strtotime($invoice['created_at'])) . '</td>
                <td class="info-label">到期日期</td>
                <td>' . htmlspecialchars($invoice['due_date']) . '</td>
            </tr>
        </table>
    </div>
    
    <h3>客户信息</h3>
    <table class="info-table">
        <tr>
            <td class="info-label">名称</td>
            <td>' . htmlspecialchars($invoice['customer_name'] ?? 'N/A') . '</td>
        </tr>
        <tr>
            <td class="info-label">邮箱</td>
            <td>' . htmlspecialchars($invoice['customer_email'] ?? '-') . '</td>
        </tr>
        <tr>
            <td class="info-label">电话</td>
            <td>' . htmlspecialchars($invoice['customer_phone'] ?? '-') . '</td>
        </tr>
        <tr>
            <td class="info-label">地址</td>
            <td>' . htmlspecialchars($invoice['customer_address'] ?? '-') . '</td>
        </tr>
    </table>
    
    <h3>明 细</h3>
    <table>
        <thead>
            <tr>
                <th style="text-align:center; width:5%;">#</th>
                <th style="width:45%;">描述</th>
                <th style="text-align:center; width:10%;">数量</th>
                <th style="text-align:right; width:15%;">单价</th>
                <th style="text-align:center; width:10%;">税率</th>
                <th style="text-align:right; width:15%;">小计</th>
            </tr>
        </thead>
        <tbody>' . $itemsHtml . '</tbody>
    </table>
    
    <table style="width:50%; margin-left:auto; margin-top:20px;">
        <tr>
            <td class="total-label">小计</td>
            <td class="total-value">¥ ' . number_format((float)$invoice['amount'], 2) . '</td>
        </tr>
        <tr>
            <td class="total-label">税额</td>
            <td class="total-value">¥ ' . number_format((float)$invoice['tax_amount'], 2) . '</td>
        </tr>
        <tr>
            <td class="total-label total-amount"><strong>总计</strong></td>
            <td class="total-value total-amount"><strong>¥ ' . number_format((float)$invoice['total'], 2) . '</strong></td>
        </tr>
        <tr>
            <td class="total-label">已付</td>
            <td class="total-value paid-amount">¥ ' . number_format((float)$invoice['paid_amount'], 2) . '</td>
        </tr>
        <tr>
            <td class="total-label">待付</td>
            <td class="total-value due-amount"><strong>¥ ' . number_format((float)$invoice['total'] - (float)$invoice['paid_amount'], 2) . '</strong></td>
        </tr>
    </table>' . 
    
    ($invoice['notes'] ? '
    <h3>备 注</h3>
    <p style="margin:10px 0; padding:10px; background-color:#fffbeb; border-radius:4px;">' . htmlspecialchars($invoice['notes']) . '</p>
    ' : '') . '
    
    <div class="footer">
        <p>感谢您的业务！</p>
        <p>Thank you for your business!</p>
    </div>
</body>
</html>';
}
