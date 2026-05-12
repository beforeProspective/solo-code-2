<?php

use App\Http\Controllers\AuthController;
use App\Http\Controllers\DashboardController;
use App\Http\Controllers\EventController;
use App\Http\Controllers\OrderController;
use App\Http\Controllers\PublicEventController;
use App\Http\Controllers\TicketController;
use Illuminate\Support\Facades\Route;

Route::group(['prefix' => 'public'], function () {
    Route::get('/events', [PublicEventController::class, 'index']);
    Route::get('/events/{slug}', [PublicEventController::class, 'show']);
    Route::post('/events/{slug}/register', [PublicEventController::class, 'register']);
    Route::get('/orders/{orderNumber}', [PublicEventController::class, 'getOrder']);
    Route::get('/tickets/{ticketCode}', [PublicEventController::class, 'ticketByCode']);
    Route::get('/tickets/{ticketCode}/download', [PublicEventController::class, 'downloadTicket']);
});

Route::post('/register', [AuthController::class, 'register']);
Route::post('/login', [AuthController::class, 'login']);

Route::group(['middleware' => ['auth:api']], function () {
    Route::post('/logout', [AuthController::class, 'logout']);
    Route::get('/me', [AuthController::class, 'me']);
    Route::post('/refresh', [AuthController::class, 'refresh']);
    Route::put('/profile', [AuthController::class, 'updateProfile']);

    Route::get('/dashboard/stats', [DashboardController::class, 'stats']);
    Route::get('/dashboard/events/{eventId}/stats', [DashboardController::class, 'eventStats']);

    Route::post('/events/upload-image', [EventController::class, 'uploadImage']);
    Route::apiResource('events', EventController::class);

    Route::group(['prefix' => 'events/{eventId}'], function () {
        Route::apiResource('tickets', TicketController::class)->except(['create', 'edit']);
        Route::get('/orders', [OrderController::class, 'index']);
        Route::get('/orders/{orderId}', [OrderController::class, 'show']);
        Route::put('/orders/{orderId}', [OrderController::class, 'update']);
        Route::post('/orders/{orderId}/refund', [OrderController::class, 'refund']);
        Route::get('/attendees/export', [OrderController::class, 'exportCsv']);
    });
});
