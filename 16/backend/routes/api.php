<?php

use Illuminate\Support\Facades\Route;
use App\Http\Controllers\AuthController;
use App\Http\Controllers\AccountController;
use App\Http\Controllers\TransactionController;
use App\Http\Controllers\CategoryController;
use App\Http\Controllers\TagController;
use App\Http\Controllers\BudgetController;
use App\Http\Controllers\BillController;
use App\Http\Controllers\RuleController;
use App\Http\Controllers\CurrencyController;
use App\Http\Controllers\ReportController;
use App\Http\Controllers\DataController;

Route::post('/register', [AuthController::class, 'register']);
Route::post('/login', [AuthController::class, 'login']);
Route::post('/currencies/update-rates', [CurrencyController::class, 'updateRates']);
Route::get('/currencies', [CurrencyController::class, 'index']);
Route::post('/currencies/convert', [CurrencyController::class, 'convert']);

Route::middleware('auth:api')->group(function () {
    Route::post('/logout', [AuthController::class, 'logout']);
    Route::post('/refresh', [AuthController::class, 'refresh']);
    Route::get('/me', [AuthController::class, 'me']);

    Route::apiResource('accounts', AccountController::class);
    Route::apiResource('transactions', TransactionController::class);
    Route::apiResource('categories', CategoryController::class);
    Route::apiResource('tags', TagController::class);
    Route::apiResource('budgets', BudgetController::class);
    Route::apiResource('bills', BillController::class);
    Route::post('bills/{bill}/mark-paid', [BillController::class, 'markAsPaid']);
    Route::apiResource('rules', RuleController::class);

    Route::get('reports/summary', [ReportController::class, 'summary']);
    Route::get('reports/trend', [ReportController::class, 'trend']);
    Route::get('reports/by-category', [ReportController::class, 'byCategory']);
    Route::get('reports/net-worth', [ReportController::class, 'netWorth']);
    Route::get('reports/account-balances', [ReportController::class, 'accountBalances']);

    Route::get('data/export', [DataController::class, 'export']);
    Route::post('data/import', [DataController::class, 'import']);
});
