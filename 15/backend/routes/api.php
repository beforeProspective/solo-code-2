<?php

use App\Http\Controllers\AuthController;
use App\Http\Controllers\ServiceComponentController;
use App\Http\Controllers\IncidentController;
use App\Http\Controllers\SettingController;
use App\Http\Controllers\SubscriberController;
use App\Http\Controllers\WebhookController;
use App\Http\Controllers\MetricController;
use App\Http\Controllers\DashboardController;
use Illuminate\Support\Facades\Route;

Route::post('/register', [AuthController::class, 'register']);
Route::post('/login', [AuthController::class, 'login']);

Route::get('/status', [DashboardController::class, 'publicStatus']);
Route::get('/components', [ServiceComponentController::class, 'index']);
Route::get('/incidents', [IncidentController::class, 'publicIndex']);
Route::get('/maintenances', [IncidentController::class, 'scheduledMaintenances']);
Route::get('/theme', [SettingController::class, 'getTheme']);
Route::get('/metrics', [MetricController::class, 'publicIndex']);
Route::get('/metrics/{metric}/points', [MetricController::class, 'getPoints']);
Route::post('/subscribe', [SubscriberController::class, 'publicSubscribe']);
Route::post('/unsubscribe', [SubscriberController::class, 'publicUnsubscribe']);

Route::middleware('auth:api')->group(function () {
    Route::post('/logout', [AuthController::class, 'logout']);
    Route::post('/refresh', [AuthController::class, 'refresh']);
    Route::get('/me', [AuthController::class, 'me']);

    Route::get('/dashboard', [DashboardController::class, 'stats']);

    Route::apiResource('/components', ServiceComponentController::class)->except(['show']);
    Route::post('/components/{component}/status', [ServiceComponentController::class, 'updateStatus']);

    Route::apiResource('/incidents', IncidentController::class)->except(['show']);
    Route::post('/incidents/{incident}/updates', [IncidentController::class, 'addUpdate']);

    Route::get('/settings/theme', [SettingController::class, 'getTheme']);
    Route::put('/settings/theme', [SettingController::class, 'updateTheme']);
    Route::get('/settings', [SettingController::class, 'getSettings']);

    Route::get('/subscribers', [SubscriberController::class, 'index']);
    Route::delete('/subscribers/{subscriber}', [SubscriberController::class, 'destroy']);

    Route::apiResource('/webhooks', WebhookController::class);

    Route::apiResource('/metrics', MetricController::class);
    Route::post('/metrics/{metric}/points', [MetricController::class, 'addPoint']);
});
