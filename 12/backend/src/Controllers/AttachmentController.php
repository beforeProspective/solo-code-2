<?php

namespace App\Controllers;

use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Message\ServerRequestInterface as Request;
use Psr\Http\Message\UploadedFileInterface;
use App\Database;
use App\Helpers\AuthHelper;
use PDO;

class AttachmentController
{
    public function index(Request $request, Response $response, array $args): Response
    {
        $taskId = $args['taskId'];
        $pdo = Database::getConnection();
        
        $sql = "SELECT a.*, u.name as user_name
                FROM attachments a
                JOIN users u ON a.user_id = u.id
                WHERE a.task_id = ?
                ORDER BY a.created_at DESC";
        
        $stmt = $pdo->prepare($sql);
        $stmt->execute([$taskId]);
        $attachments = $stmt->fetchAll();
        
        $response->getBody()->write(json_encode($attachments));
        return $response->withHeader('Content-Type', 'application/json');
    }
    
    public function create(Request $request, Response $response, array $args): Response
    {
        $user = AuthHelper::getCurrentUser($request);
        $taskId = $args['taskId'];
        
        $uploadDir = __DIR__ . '/../../uploads';
        if (!is_dir($uploadDir)) {
            mkdir($uploadDir, 0755, true);
        }
        
        $uploadedFiles = $request->getUploadedFiles();
        
        if (!isset($uploadedFiles['file'])) {
            $response->getBody()->write(json_encode(['error' => 'No file uploaded']));
            return $response->withStatus(400)->withHeader('Content-Type', 'application/json');
        }
        
        $file = $uploadedFiles['file'];
        
        if ($file->getError() !== UPLOAD_ERR_OK) {
            $response->getBody()->write(json_encode(['error' => 'Upload failed']));
            return $response->withStatus(400)->withHeader('Content-Type', 'application/json');
        }
        
        $filename = uniqid() . '_' . basename($file->getClientFilename());
        $filepath = $uploadDir . '/' . $filename;
        
        $file->moveTo($filepath);
        
        $pdo = Database::getConnection();
        $stmt = $pdo->prepare("INSERT INTO attachments (task_id, user_id, filename, original_name, filepath, filesize) VALUES (?, ?, ?, ?, ?, ?)");
        $stmt->execute([
            $taskId,
            $user['id'],
            $filename,
            $file->getClientFilename(),
            $filepath,
            $file->getSize()
        ]);
        
        $this->logActivity($user['id'], 'upload', 'task', $taskId, "Uploaded file: " . $file->getClientFilename());
        
        $response->getBody()->write(json_encode([
            'id' => $pdo->lastInsertId(),
            'message' => 'File uploaded successfully'
        ]));
        return $response->withStatus(201)->withHeader('Content-Type', 'application/json');
    }
    
    public function download(Request $request, Response $response, array $args): Response
    {
        $pdo = Database::getConnection();
        $id = $args['id'];
        
        $stmt = $pdo->prepare("SELECT * FROM attachments WHERE id = ?");
        $stmt->execute([$id]);
        $attachment = $stmt->fetch();
        
        if (!$attachment || !file_exists($attachment['filepath'])) {
            $response->getBody()->write(json_encode(['error' => 'File not found']));
            return $response->withStatus(404)->withHeader('Content-Type', 'application/json');
        }
        
        $file = file_get_contents($attachment['filepath']);
        
        $response->getBody()->write($file);
        return $response
            ->withHeader('Content-Type', 'application/octet-stream')
            ->withHeader('Content-Disposition', 'attachment; filename="' . $attachment['original_name'] . '"')
            ->withHeader('Content-Length', $attachment['filesize']);
    }
    
    public function delete(Request $request, Response $response, array $args): Response
    {
        $user = AuthHelper::getCurrentUser($request);
        $id = $args['id'];
        
        $pdo = Database::getConnection();
        
        $stmt = $pdo->prepare("SELECT * FROM attachments WHERE id = ?");
        $stmt->execute([$id]);
        $attachment = $stmt->fetch();
        
        if (!$attachment) {
            $response->getBody()->write(json_encode(['error' => 'File not found']));
            return $response->withStatus(404)->withHeader('Content-Type', 'application/json');
        }
        
        if ($attachment['user_id'] != $user['id'] && !AuthHelper::hasRole($user, 'admin')) {
            $response->getBody()->write(json_encode(['error' => 'Access denied']));
            return $response->withStatus(403)->withHeader('Content-Type', 'application/json');
        }
        
        if (file_exists($attachment['filepath'])) {
            unlink($attachment['filepath']);
        }
        
        $stmt = $pdo->prepare("DELETE FROM attachments WHERE id = ?");
        $stmt->execute([$id]);
        
        $this->logActivity($user['id'], 'delete_file', 'task', $attachment['task_id'], "Deleted file: " . $attachment['original_name']);
        
        $response->getBody()->write(json_encode(['message' => 'Attachment deleted']));
        return $response->withHeader('Content-Type', 'application/json');
    }
    
    private function logActivity($userId, $action, $targetType, $targetId, $details): void
    {
        $pdo = Database::getConnection();
        $stmt = $pdo->prepare("INSERT INTO activity_logs (user_id, action, target_type, target_id, details) VALUES (?, ?, ?, ?, ?)");
        $stmt->execute([$userId, $action, $targetType, $targetId, $details]);
    }
}
