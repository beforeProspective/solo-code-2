<?php

require __DIR__ . '/../vendor/autoload.php';

use Dotenv\Dotenv;
use Slim\Factory\AppFactory;
use Slim\Routing\RouteCollectorProxy;
use App\Database;
use App\Middleware\CorsMiddleware;
use App\Controllers\AuthController;
use App\Controllers\ProjectController;
use App\Controllers\MilestoneController;
use App\Controllers\TaskController;
use App\Controllers\CommentController;
use App\Controllers\AttachmentController;
use App\Controllers\DashboardController;
use App\Controllers\SearchController;

$dotenv = Dotenv::createImmutable(__DIR__ . '/../');
$dotenv->load();

Database::init();

$app = AppFactory::create();

$app->addBodyParsingMiddleware();
$app->add(new CorsMiddleware());
$app->addRoutingMiddleware();
$app->addErrorMiddleware(true, true, true);

$app->options('/{routes:.+}', function ($request, $response) {
    return $response;
});

$app->group('/api', function (RouteCollectorProxy $group) {
    $group->post('/auth/login', [AuthController::class, 'login']);
    $group->post('/auth/register', [AuthController::class, 'register']);
    
    $group->group('', function (RouteCollectorProxy $protected) {
        $protected->get('/auth/me', [AuthController::class, 'me']);
        
        $protected->get('/dashboard/stats', [DashboardController::class, 'stats']);
        $protected->get('/dashboard/activity', [DashboardController::class, 'activity']);
        $protected->get('/users', [DashboardController::class, 'users']);
        
        $protected->get('/search', [SearchController::class, 'search']);
        
        $protected->group('/projects', function (RouteCollectorProxy $projects) {
            $projects->get('', [ProjectController::class, 'index']);
            $projects->post('', [ProjectController::class, 'create']);
            $projects->get('/{id}', [ProjectController::class, 'show']);
            $projects->put('/{id}', [ProjectController::class, 'update']);
            $projects->delete('/{id}', [ProjectController::class, 'delete']);
            $projects->get('/{id}/members', [ProjectController::class, 'members']);
            $projects->post('/{id}/members', [ProjectController::class, 'addMember']);
            $projects->delete('/{id}/members/{memberId}', [ProjectController::class, 'removeMember']);
        });
        
        $protected->group('/projects/{projectId}/milestones', function (RouteCollectorProxy $milestones) {
            $milestones->get('', [MilestoneController::class, 'index']);
            $milestones->post('', [MilestoneController::class, 'create']);
        });
        $protected->put('/milestones/{id}', [MilestoneController::class, 'update']);
        $protected->delete('/milestones/{id}', [MilestoneController::class, 'delete']);
        
        $protected->group('/projects/{projectId}/tasks', function (RouteCollectorProxy $tasks) {
            $tasks->get('', [TaskController::class, 'index']);
            $tasks->post('', [TaskController::class, 'create']);
        });
        $protected->get('/tasks/{id}', [TaskController::class, 'show']);
        $protected->put('/tasks/{id}', [TaskController::class, 'update']);
        $protected->patch('/tasks/{id}/status', [TaskController::class, 'updateStatus']);
        $protected->delete('/tasks/{id}', [TaskController::class, 'delete']);
        
        $protected->group('/tasks/{taskId}/comments', function (RouteCollectorProxy $comments) {
            $comments->get('', [CommentController::class, 'index']);
            $comments->post('', [CommentController::class, 'create']);
        });
        $protected->put('/comments/{id}', [CommentController::class, 'update']);
        $protected->delete('/comments/{id}', [CommentController::class, 'delete']);
        
        $protected->group('/tasks/{taskId}/attachments', function (RouteCollectorProxy $attachments) {
            $attachments->get('', [AttachmentController::class, 'index']);
            $attachments->post('', [AttachmentController::class, 'create']);
        });
        $protected->get('/attachments/{id}/download', [AttachmentController::class, 'download']);
        $protected->delete('/attachments/{id}', [AttachmentController::class, 'delete']);
        
    })->add(function ($request, $handler) {
        $authHeader = $request->getHeader('Authorization');
        if (!$authHeader) {
            $response = new \Slim\Psr7\Response();
            $response->getBody()->write(json_encode(['error' => 'Unauthorized']));
            return $response->withStatus(401)->withHeader('Content-Type', 'application/json');
        }
        
        $token = str_replace('Bearer ', '', $authHeader[0]);
        $decoded = \App\Helpers\AuthHelper::decodeToken($token);
        
        if (!$decoded) {
            $response = new \Slim\Psr7\Response();
            $response->getBody()->write(json_encode(['error' => 'Invalid token']));
            return $response->withStatus(401)->withHeader('Content-Type', 'application/json');
        }
        
        $request = $request->withAttribute('jwt', $decoded);
        return $handler->handle($request);
    });
});

$app->run();
