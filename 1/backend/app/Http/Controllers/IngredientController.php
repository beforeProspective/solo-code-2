<?php

namespace App\Http\Controllers;

use App\Models\Ingredient;
use Illuminate\Http\Request;
use Illuminate\Http\JsonResponse;

class IngredientController extends Controller
{
    public function index(): JsonResponse
    {
        $ingredients = Ingredient::all();
        return response()->json($ingredients);
    }

    public function store(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'name' => 'required|string|max:255',
            'unit' => 'required|string|max:50',
            'calories_per_unit' => 'required|numeric|min:0',
            'protein_per_unit' => 'required|numeric|min:0',
            'carbs_per_unit' => 'required|numeric|min:0',
            'fat_per_unit' => 'required|numeric|min:0',
            'current_stock' => 'nullable|numeric|min:0',
        ]);

        $ingredient = Ingredient::create($validated);
        return response()->json($ingredient, 201);
    }

    public function show(Ingredient $ingredient): JsonResponse
    {
        return response()->json($ingredient);
    }

    public function update(Request $request, Ingredient $ingredient): JsonResponse
    {
        $validated = $request->validate([
            'name' => 'required|string|max:255',
            'unit' => 'required|string|max:50',
            'calories_per_unit' => 'required|numeric|min:0',
            'protein_per_unit' => 'required|numeric|min:0',
            'carbs_per_unit' => 'required|numeric|min:0',
            'fat_per_unit' => 'required|numeric|min:0',
            'current_stock' => 'nullable|numeric|min:0',
        ]);

        $ingredient->update($validated);
        return response()->json($ingredient);
    }

    public function destroy(Ingredient $ingredient): JsonResponse
    {
        $ingredient->delete();
        return response()->json(null, 204);
    }
}
