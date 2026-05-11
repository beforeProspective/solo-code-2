<?php

use Slim\Factory\AppFactory;
use DI\Container;
use App\Config\Database;
use App\Controllers\AuthController;
use App\Controllers\ComponentController;
use App\Controllers\SupplierController;
use App\Controllers\BomController;
use App\Controllers\StatsController;
use App\Middleware\AuthMiddleware;
use App\Utils\JwtUtils;

require_once __DIR__ . '/../vendor/autoload.php';

if (file_exists(__DIR__ . '/../.env')) {
    $dotenv = Dotenv\Dotenv::createImmutable(__DIR__ . '/../');
    $dotenv->load();
}

$container = new Container();
AppFactory::setContainer($container);

$container->set('db', function () {
    return (new Database())->getConnection();
});

$container->set(Database::class, function () {
    return new Database();
});

$container->set(JwtUtils::class, function () {
    return new JwtUtils();
});

$container->set(AuthMiddleware::class, function ($c) {
    return new AuthMiddleware($c->get(JwtUtils::class));
});

$app = AppFactory::create();
$app->setBasePath('/api');

$app->addBodyParsingMiddleware();
$app->addErrorMiddleware(true, true, true);

$app->add(new Tuupola\Middleware\CorsMiddleware([
    'origin' => ['*'],
    'methods' => ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    'headers.allow' => ['Content-Type', 'Authorization', 'X-Requested-With'],
    'headers.expose' => [],
    'credentials' => false,
    'cache' => 0,
    'error' => function ($request, $response, $error) {
        return $response
            ->withHeader('Content-Type', 'application/json')
            ->write(json_encode(['error' => $error['message']]));
    }
]));

$app->options('/{routes:.+}', function ($request, $response, $args) {
    return $response;
});

$app->group('/v1', function ($app) {
    
    $app->post('/auth/login', [AuthController::class, 'login']);
    $app->post('/auth/register', [AuthController::class, 'register']);
    
    $app->group('', function ($app) {
        $app->get('/auth/me', [AuthController::class, 'me']);
    })->add([AuthMiddleware::class, '__invoke']);

    $app->get('/components/categories', [ComponentController::class, 'getCategories']);
    $app->get('/components/packages', [ComponentController::class, 'getPackages']);
    $app->get('/components', [ComponentController::class, 'getAll']);
    $app->get('/components/{id}', [ComponentController::class, 'getById']);
    
    $app->group('', function ($app) {
        $app->post('/components', [ComponentController::class, 'create']);
        $app->put('/components/{id}', [ComponentController::class, 'update']);
        $app->delete('/components/{id}', [ComponentController::class, 'delete']);
    })->add([AuthMiddleware::class, '__invoke']);

    $app->get('/suppliers', [SupplierController::class, 'getAll']);
    $app->get('/suppliers/{id}', [SupplierController::class, 'getById']);
    
    $app->group('', function ($app) {
        $app->post('/suppliers', [SupplierController::class, 'create']);
        $app->put('/suppliers/{id}', [SupplierController::class, 'update']);
        $app->delete('/suppliers/{id}', [SupplierController::class, 'delete']);
    })->add([AuthMiddleware::class, '__invoke']);

    $app->group('/boms', function ($app) {
        $app->get('', [BomController::class, 'getAll']);
        $app->get('/{id}', [BomController::class, 'getById']);
        $app->get('/{id}/export', [BomController::class, 'export']);
    });

    $app->group('/boms', function ($app) {
        $app->post('', [BomController::class, 'create']);
        $app->put('/{id}', [BomController::class, 'update']);
        $app->delete('/{id}', [BomController::class, 'delete']);
    })->add([AuthMiddleware::class, '__invoke']);

    $app->get('/stats/overview', [StatsController::class, 'getOverview']);
    $app->get('/stats/by-category', [StatsController::class, 'getByCategory']);
    $app->get('/stats/by-package', [StatsController::class, 'getByPackage']);
    $app->get('/stats/low-stock', [StatsController::class, 'getLowStock']);
    $app->get('/stats/by-supplier', [StatsController::class, 'getBySupplier']);
    $app->get('/stats/recent', [StatsController::class, 'getRecentComponents']);
});

$app->run();
