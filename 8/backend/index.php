<?php
header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

require_once __DIR__ . '/includes/database.php';
require_once __DIR__ . '/includes/response.php';
require_once __DIR__ . '/includes/pdf.php';
require_once __DIR__ . '/includes/reminder.php';

$uri = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);
$uri = preg_replace('#^/api/?#', '', $uri);
$uri = preg_replace('#^/index\.php#', '', $uri);
$uri = trim($uri, '/');
$method = $_SERVER['REQUEST_METHOD'];

$db = getDB();

try {
    $request = json_decode(file_get_contents('php://input'), true) ?: [];

    if (preg_match('#^customers/?$#', $uri) && $method === 'GET') {
        $stmt = $db->query('SELECT * FROM customers ORDER BY created_at DESC');
        sendSuccess($stmt->fetchAll(PDO::FETCH_ASSOC));
    }
    elseif (preg_match('#^customers/(\d+)/?$#', $uri, $m) && $method === 'GET') {
        $stmt = $db->prepare('SELECT * FROM customers WHERE id = ?');
        $stmt->execute([$m[1]]);
        $customer = $stmt->fetch(PDO::FETCH_ASSOC);
        if (!$customer) sendError('Customer not found', 404);
        sendSuccess($customer);
    }
    elseif (preg_match('#^customers/?$#', $uri) && $method === 'POST') {
        $stmt = $db->prepare('INSERT INTO customers (name, email, phone, address) VALUES (?, ?, ?, ?)');
        $stmt->execute([$request['name'] ?? '', $request['email'] ?? '', $request['phone'] ?? '', $request['address'] ?? '']);
        sendSuccess(['id' => (int)$db->lastInsertId()], 201);
    }
    elseif (preg_match('#^customers/(\d+)/?$#', $uri, $m) && $method === 'PUT') {
        $stmt = $db->prepare('UPDATE customers SET name = ?, email = ?, phone = ?, address = ? WHERE id = ?');
        $stmt->execute([$request['name'] ?? '', $request['email'] ?? '', $request['phone'] ?? '', $request['address'] ?? '', $m[1]]);
        sendSuccess(['updated' => true]);
    }
    elseif (preg_match('#^customers/(\d+)/?$#', $uri, $m) && $method === 'DELETE') {
        $stmt = $db->prepare('DELETE FROM customers WHERE id = ?');
        $stmt->execute([$m[1]]);
        sendSuccess(['deleted' => true]);
    }

    elseif (preg_match('#^taxes/?$#', $uri) && $method === 'GET') {
        $stmt = $db->query('SELECT * FROM taxes ORDER BY rate ASC');
        sendSuccess($stmt->fetchAll(PDO::FETCH_ASSOC));
    }

    elseif (preg_match('#^invoices/?$#', $uri) && $method === 'GET') {
        $status = $_GET['status'] ?? '';
        $sql = 'SELECT i.*, c.name as customer_name 
                FROM invoices i 
                LEFT JOIN customers c ON i.customer_id = c.id';
        $params = [];
        if ($status) {
            $sql .= ' WHERE i.status = ?';
            $params[] = $status;
        }
        $sql .= ' ORDER BY i.created_at DESC';
        $stmt = $db->prepare($sql);
        $stmt->execute($params);
        $invoices = $stmt->fetchAll(PDO::FETCH_ASSOC);
        foreach ($invoices as &$inv) {
            $inv['amount'] = (float)$inv['amount'];
            $inv['tax_amount'] = (float)$inv['tax_amount'];
            $inv['total'] = (float)$inv['total'];
            $inv['paid_amount'] = (float)$inv['paid_amount'];
        }
        sendSuccess($invoices);
    }
    elseif (preg_match('#^invoices/(\d+)/?$#', $uri, $m) && $method === 'GET') {
        $stmt = $db->prepare('SELECT i.*, c.name as customer_name, c.email as customer_email 
                              FROM invoices i 
                              LEFT JOIN customers c ON i.customer_id = c.id 
                              WHERE i.id = ?');
        $stmt->execute([$m[1]]);
        $invoice = $stmt->fetch(PDO::FETCH_ASSOC);
        if (!$invoice) sendError('Invoice not found', 404);
        
        $stmt = $db->prepare('SELECT * FROM invoice_items WHERE invoice_id = ?');
        $stmt->execute([$m[1]]);
        $invoice['items'] = $stmt->fetchAll(PDO::FETCH_ASSOC);
        
        $stmt = $db->prepare('SELECT * FROM payments WHERE invoice_id = ? ORDER BY created_at DESC');
        $stmt->execute([$m[1]]);
        $invoice['payments'] = $stmt->fetchAll(PDO::FETCH_ASSOC);
        
        $invoice['amount'] = (float)$invoice['amount'];
        $invoice['tax_amount'] = (float)$invoice['tax_amount'];
        $invoice['total'] = (float)$invoice['total'];
        $invoice['paid_amount'] = (float)$invoice['paid_amount'];
        foreach ($invoice['items'] as &$item) {
            $item['quantity'] = (int)$item['quantity'];
            $item['price'] = (float)$item['price'];
            $item['tax_rate'] = (float)$item['tax_rate'];
        }
        foreach ($invoice['payments'] as &$p) {
            $p['amount'] = (float)$p['amount'];
        }
        
        sendSuccess($invoice);
    }
    elseif (preg_match('#^invoices/?$#', $uri) && $method === 'POST') {
        $items = $request['items'] ?? [];
        if (empty($items)) sendError('Items are required', 400);
        
        $subtotal = 0;
        $tax_total = 0;
        foreach ($items as $item) {
            $price = (float)($item['price'] ?? 0);
            $qty = (int)($item['quantity'] ?? 0);
            $tax_rate = (float)($item['tax_rate'] ?? 0);
            $line_total = $price * $qty;
            $subtotal += $line_total;
            $tax_total += $line_total * ($tax_rate / 100);
        }
        $total = $subtotal + $tax_total;
        
        $invoice_number = 'INV-' . strtoupper(substr(md5(uniqid()), 0, 6));
        $due_date = $request['due_date'] ?? date('Y-m-d', strtotime('+30 days'));
        
        $db->beginTransaction();
        $stmt = $db->prepare('INSERT INTO invoices (customer_id, invoice_number, due_date, amount, tax_amount, total, status, notes) 
                              VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
        $stmt->execute([
            (int)($request['customer_id'] ?? null) ?: null,
            $invoice_number,
            $due_date,
            $subtotal,
            $tax_total,
            $total,
            'draft',
            $request['notes'] ?? ''
        ]);
        $invoice_id = (int)$db->lastInsertId();
        
        $itemStmt = $db->prepare('INSERT INTO invoice_items (invoice_id, description, quantity, price, tax_rate) VALUES (?, ?, ?, ?, ?)');
        foreach ($items as $item) {
            $itemStmt->execute([
                $invoice_id,
                $item['description'] ?? '',
                (int)($item['quantity'] ?? 1),
                (float)($item['price'] ?? 0),
                (float)($item['tax_rate'] ?? 0)
            ]);
        }
        $db->commit();
        
        sendSuccess(['id' => $invoice_id, 'invoice_number' => $invoice_number], 201);
    }
    elseif (preg_match('#^invoices/(\d+)/status/?$#', $uri, $m) && $method === 'PUT') {
        $status = $request['status'] ?? '';
        if (!in_array($status, ['draft', 'sent', 'paid', 'overdue'])) sendError('Invalid status', 400);
        
        $stmt = $db->prepare('UPDATE invoices SET status = ? WHERE id = ?');
        $stmt->execute([$status, $m[1]]);
        sendSuccess(['updated' => true]);
    }

    elseif (preg_match('#^invoices/(\d+)/payments/?$#', $uri, $m) && $method === 'POST') {
        $amount = (float)($request['amount'] ?? 0);
        if ($amount <= 0) sendError('Invalid amount', 400);
        
        $db->beginTransaction();
        $stmt = $db->prepare('SELECT total, paid_amount, status FROM invoices WHERE id = ?');
        $stmt->execute([$m[1]]);
        $invoice = $stmt->fetch(PDO::FETCH_ASSOC);
        if (!$invoice) sendError('Invoice not found', 404);
        
        $new_paid = (float)$invoice['paid_amount'] + $amount;
        $status = ($new_paid >= (float)$invoice['total']) ? 'paid' : 'sent';
        
        $stmt = $db->prepare('INSERT INTO payments (invoice_id, amount, payment_date, method, notes) VALUES (?, ?, ?, ?, ?)');
        $stmt->execute([
            $m[1],
            $amount,
            $request['payment_date'] ?? date('Y-m-d'),
            $request['method'] ?? 'cash',
            $request['notes'] ?? ''
        ]);
        
        $stmt = $db->prepare('UPDATE invoices SET paid_amount = paid_amount + ?, status = ? WHERE id = ?');
        $stmt->execute([$amount, $status, $m[1]]);
        $db->commit();
        
        sendSuccess(['paid_amount' => $new_paid, 'status' => $status]);
    }
    elseif (preg_match('#^invoices/(\d+)/pdf/?$#', $uri, $m) && $method === 'GET') {
        generateInvoicePdf((int)$m[1], $db);
    }
    elseif (preg_match('#^statistics/?$#', $uri) && $method === 'GET') {
        $year = (int)($_GET['year'] ?? date('Y'));
        
        $months = [];
        for ($i = 1; $i <= 12; $i++) {
            $months[] = [
                'month' => $i,
                'month_name' => date('F', mktime(0, 0, 0, $i, 1)),
                'total' => 0,
                'paid' => 0,
                'count' => 0
            ];
        }
        
        $stmt = $db->prepare('SELECT strftime("%m", created_at) as m, 
                                     COUNT(*) as cnt, 
                                     SUM(total) as total, 
                                     SUM(paid_amount) as paid 
                              FROM invoices 
                              WHERE strftime("%Y", created_at) = ? 
                              GROUP BY strftime("%m", created_at)');
        $stmt->execute([(string)$year]);
        $results = $stmt->fetchAll(PDO::FETCH_ASSOC);
        
        foreach ($results as $row) {
            $idx = (int)$row['m'] - 1;
            $months[$idx]['total'] = (float)$row['total'];
            $months[$idx]['paid'] = (float)$row['paid'];
            $months[$idx]['count'] = (int)$row['cnt'];
        }
        
        $stmt = $db->query('SELECT COUNT(*) as c FROM customers');
        $total_customers = (int)$stmt->fetchColumn();
        
        $stmt = $db->query('SELECT COUNT(*) as c, SUM(total) as total FROM invoices');
        $inv_stats = $stmt->fetch(PDO::FETCH_ASSOC);
        
        $stmt = $db->query("SELECT COUNT(*) as c FROM invoices WHERE status = 'overdue'");
        $overdue_count = (int)$stmt->fetchColumn();
        
        $stmt = $db->query("SELECT SUM(total - paid_amount) as t FROM invoices WHERE status = 'overdue'");
        $overdue_total = (float)$stmt->fetchColumn();
        
        sendSuccess([
            'year' => $year,
            'monthly' => $months,
            'summary' => [
                'total_customers' => $total_customers,
                'total_invoices' => (int)($inv_stats['c'] ?? 0),
                'total_revenue' => (float)($inv_stats['total'] ?? 0),
                'overdue_count' => $overdue_count,
                'overdue_total' => $overdue_total
            ]
        ]);
    }
    elseif (preg_match('#^reminders/check/?$#', $uri) && $method === 'POST') {
        $result = checkOverdueInvoices($db);
        sendSuccess($result);
    }
    elseif (preg_match('#^reminders/?$#', $uri) && $method === 'GET') {
        $stmt = $db->query('SELECT r.*, i.invoice_number, c.name as customer_name, c.email as customer_email, i.total as invoice_total
                            FROM reminders r
                            JOIN invoices i ON r.invoice_id = i.id
                            LEFT JOIN customers c ON i.customer_id = c.id
                            ORDER BY r.created_at DESC
                            LIMIT 50');
        sendSuccess($stmt->fetchAll(PDO::FETCH_ASSOC));
    }
    else {
        sendError('Not found', 404);
    }
} catch (Exception $e) {
    if (isset($db) && $db->inTransaction()) $db->rollBack();
    sendError($e->getMessage(), 500);
}
