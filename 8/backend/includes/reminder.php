<?php
function checkOverdueInvoices($db) {
    $today = date('Y-m-d');
    
    $stmt = $db->prepare("UPDATE invoices 
                          SET status = 'overdue' 
                          WHERE status IN ('draft', 'sent') 
                          AND due_date < ? 
                          AND paid_amount < total");
    $stmt->execute([$today]);
    $updatedCount = $stmt->rowCount();
    
    $stmt = $db->prepare("SELECT i.id, i.invoice_number, i.total, i.paid_amount, i.due_date,
                          c.name as customer_name, c.email as customer_email
                          FROM invoices i
                          LEFT JOIN customers c ON i.customer_id = c.id
                          WHERE i.status = 'overdue' 
                          AND i.id NOT IN (SELECT invoice_id FROM reminders)");
    $stmt->execute();
    $overdue = $stmt->fetchAll(PDO::FETCH_ASSOC);
    
    $reminders = [];
    $insertStmt = $db->prepare("INSERT INTO reminders (invoice_id, reminder_type) VALUES (?, 'overdue_email')");
    
    foreach ($overdue as $inv) {
        $insertStmt->execute([$inv['id']]);
        $reminders[] = [
            'invoice_number' => $inv['invoice_number'],
            'customer' => $inv['customer_name'] ?? '未知',
            'email' => $inv['customer_email'] ?? 'N/A',
            'amount_due' => (float)$inv['total'] - (float)$inv['paid_amount'],
            'due_date' => $inv['due_date'],
            'simulated_email' => simulateReminderEmail($inv)
        ];
    }
    
    return [
        'invoices_updated_to_overdue' => $updatedCount,
        'reminders_sent' => count($reminders),
        'reminders' => $reminders
    ];
}

function simulateReminderEmail($invoice) {
    $owed = (float)$invoice['total'] - (float)$invoice['paid_amount'];
    return [
        'to' => $invoice['customer_email'] ?? 'customer@example.com',
        'subject' => '付款提醒 - 发票 #' . $invoice['invoice_number'],
        'body' => "尊敬的 " . ($invoice['customer_name'] ?? '客户') . "，\n\n" .
                  "您的发票 #" . $invoice['invoice_number'] . " 已逾期。\n" .
                  "到期日期: " . $invoice['due_date'] . "\n" .
                  "待付金额: ¥" . number_format($owed, 2) . "\n\n" .
                  "请尽快安排付款。如有问题，请联系我们。\n\n" .
                  "此致\n" .
                  "发票管理系统"
    ];
}
