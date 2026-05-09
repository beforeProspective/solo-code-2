<?php

use Illuminate\Support\Facades\Route;
use App\Http\Controllers\IngredientController;
use App\Http\Controllers\RecipeController;
use App\Http\Controllers\MealPlanController;
use App\Http\Controllers\ShoppingListController;
use App\Http\Controllers\ConsumptionRecordController;

Route::apiResource('ingredients', IngredientController::class);

Route::apiResource('recipes', RecipeController::class);

Route::apiResource('meal-plans', MealPlanController::class);

Route::get('shopping-list/generate', [ShoppingListController::class, 'generate']);
Route::get('shopping-list', [ShoppingListController::class, 'index']);
Route::post('shopping-list/{shoppingList}/purchased', [ShoppingListController::class, 'markPurchased']);

Route::apiResource('consumption-records', ConsumptionRecordController::class);
Route::get('consumption-records/ingredient/{ingredientId}', [ConsumptionRecordController::class, 'getIngredientHistory']);
