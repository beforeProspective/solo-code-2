<?php

use App\Http\Controllers\API\AuthController;
use App\Http\Controllers\API\BorrowingController;
use App\Http\Controllers\API\DamageReportController;
use App\Http\Controllers\API\ToolController;
use Illuminate\Support\Facades\Route;

Route::post('/register', [AuthController::class, 'register']);
Route::post('/login', [AuthController::class, 'login']);

Route::get('/tools', [ToolController::class, 'index']);
Route::get('/tools/{tool}', [ToolController::class, 'show']);
Route::get('/categories', [ToolController::class, 'categories']);

Route::middleware('auth:sanctum')->group(function () {
    Route::post('/logout', [AuthController::class, 'logout']);
    Route::get('/user', [AuthController::class, 'user']);

    Route::post('/tools', [ToolController::class, 'store']);
    Route::get('/my-tools', [ToolController::class, 'myTools']);
    Route::put('/tools/{tool}', [ToolController::class, 'update']);
    Route::delete('/tools/{tool}', [ToolController::class, 'destroy']);

    Route::get('/borrowings', [BorrowingController::class, 'index']);
    Route::get('/my-borrowings', [BorrowingController::class, 'myBorrowings']);
    Route::post('/borrowings', [BorrowingController::class, 'store']);
    Route::get('/borrowings/{borrowing}', [BorrowingController::class, 'show']);
    Route::post('/borrowings/{borrowing}/return', [BorrowingController::class, 'return']);
    Route::get('/check-overdue', [BorrowingController::class, 'checkOverdue']);

    Route::get('/damage-reports', [DamageReportController::class, 'index']);
    Route::get('/my-reports', [DamageReportController::class, 'myReports']);
    Route::post('/damage-reports', [DamageReportController::class, 'store']);
    Route::get('/damage-reports/{damageReport}', [DamageReportController::class, 'show']);
    Route::put('/damage-reports/{damageReport}', [DamageReportController::class, 'update']);
    Route::delete('/damage-reports/{damageReport}', [DamageReportController::class, 'destroy']);
});
