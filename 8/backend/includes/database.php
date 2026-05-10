<?php
function getDB() {
    $dbPath = __DIR__ . '/../data/invoices.db';
    $dbDir = dirname($dbPath);
    if (!file_exists($dbDir)) {
        mkdir($dbDir, 0777, true);
    }
    
    $pdo = new PDO('sqlite:' . $dbPath);
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    
    $initialized = file_exists($dbPath . '.init');
    if (!$initialized) {
        initDatabase($pdo);
        file_put_contents($dbPath . '.init', '1');
    }
    
    return $pdo;
}

function initDatabase($pdo) {
    $pdo->exec("CREATE TABLE IF NOT EXISTS customers (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        email TEXT,
        phone TEXT,
        address TEXT,
        created_at TEXT DEFAULT (datetime('now'))
    )");
    
    $pdo->exec("CREATE TABLE IF NOT EXISTS taxes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        rate REAL NOT NULL,
        created_at TEXT DEFAULT (datetime('now'))
    )");
    
    $pdo->exec("CREATE TABLE IF NOT EXISTS invoices (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        customer_id INTEGER,
        invoice_number TEXT NOT NULL UNIQUE,
        due_date TEXT NOT NULL,
        amount REAL DEFAULT 0,
        tax_amount REAL DEFAULT 0,
        total REAL DEFAULT 0,
        paid_amount REAL DEFAULT 0,
        status TEXT DEFAULT 'draft',
        notes TEXT,
        created_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (customer_id) REFERENCES customers(id)
    )");
    
    $pdo->exec("CREATE TABLE IF NOT EXISTS invoice_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        invoice_id INTEGER NOT NULL,
        description TEXT NOT NULL,
        quantity INTEGER DEFAULT 1,
        price REAL DEFAULT 0,
        tax_rate REAL DEFAULT 0,
        created_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (invoice_id) REFERENCES invoices(id)
    )");
    
    $pdo->exec("CREATE TABLE IF NOT EXISTS payments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        invoice_id INTEGER NOT NULL,
        amount REAL NOT NULL,
        payment_date TEXT NOT NULL,
        method TEXT DEFAULT 'cash',
        notes TEXT,
        created_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (invoice_id) REFERENCES invoices(id)
    )");
    
    $pdo->exec("CREATE TABLE IF NOT EXISTS reminders (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        invoice_id INTEGER NOT NULL,
        reminder_type TEXT NOT NULL,
        sent_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (invoice_id) REFERENCES invoices(id)
    )");
    
    $taxes = [
        ['name' => '免税 0%', 'rate' => 0],
        ['name' => '6% 增值税', 'rate' => 6],
        ['name' => '9% 增值税', 'rate' => 9],
        ['name' => '13% 增值税', 'rate' => 13],
        ['name' => '16% 增值税', 'rate' => 16],
    ];
    
    $stmt = $pdo->prepare('INSERT INTO taxes (name, rate) VALUES (?, ?)');
    foreach ($taxes as $tax) {
        $stmt->execute([$tax['name'], $tax['rate']]);
    }
    
    $stmt = $pdo->prepare('INSERT INTO customers (name, email, phone, address) VALUES (?, ?, ?, ?)');
    $stmt->execute(['张三有限公司', 'zhangsan@example.com', '13800138001', '北京市朝阳区A座101']);
    $stmt->execute(['李四科技', 'lisi@example.com', '13800138002', '上海市浦东新区B栋202']);
    $stmt->execute(['王五商贸', 'wangwu@example.com', '13800138003', '广州市天河区C广场303']);
    
    $date = date('Y-m-d');
    $duePast = date('Y-m-d', strtotime('-15 days'));
    $dueFuture = date('Y-m-d', strtotime('+15 days'));
    
    $invoices = [
        ['customer_id' => 1, 'status' => 'paid', 'due' => $duePast, 'amount' => 5000, 'tax' => 650, 'total' => 5650, 'paid' => 5650],
        ['customer_id' => 2, 'status' => 'sent', 'due' => $dueFuture, 'amount' => 12000, 'tax' => 1560, 'total' => 13560, 'paid' => 0],
        ['customer_id' => 3, 'status' => 'overdue', 'due' => $duePast, 'amount' => 8000, 'tax' => 1040, 'total' => 9040, 'paid' => 0],
    ];
    
    $invStmt = $pdo->prepare('INSERT INTO invoices (customer_id, invoice_number, due_date, amount, tax_amount, total, paid_amount, status) 
                               VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
    $itemStmt = $pdo->prepare('INSERT INTO invoice_items (invoice_id, description, quantity, price, tax_rate) VALUES (?, ?, ?, ?, ?)');
    $payStmt = $pdo->prepare('INSERT INTO payments (invoice_id, amount, payment_date, method) VALUES (?, ?, ?, ?)');
    
    foreach ($invoices as $i => $inv) {
        $invNo = 'INV-DEMO' . str_pad($i + 1, 3, '0', STR_PAD_LEFT);
        $invStmt->execute([$inv['customer_id'], $invNo, $inv['due'], $inv['amount'], $inv['tax'], $inv['total'], $inv['paid'], $inv['status']]);
        $invId = $pdo->lastInsertId();
        
        $itemStmt->execute([$invId, '开发服务 - 项目A', 1, $inv['amount'], 13]);
        
        if ($inv['paid'] > 0) {
            $payStmt->execute([$invId, $inv['paid'], $duePast, 'bank_transfer']);
        }
    }
}
