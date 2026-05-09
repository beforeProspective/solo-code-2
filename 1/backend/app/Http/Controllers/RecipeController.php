<?php

namespace App\Http\Controllers;

use App\Models\Recipe;
use Illuminate\Http\Request;
use Illuminate\Http\JsonResponse;

class RecipeController extends Controller
{
    public function index(): JsonResponse
    {
        $recipes = Recipe::with('ingredients')->get();
        return response()->json($recipes);
    }

    public function store(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'name' => 'required|string|max:255',
            'description' => 'nullable|string',
            'instructions' => 'nullable|string',
            'servings' => 'required|integer|min:1',
            'ingredients' => 'required|array',
            'ingredients.*.id' => 'required|exists:ingredients,id',
            'ingredients.*.quantity' => 'required|numeric|min:0',
        ]);

        $recipe = Recipe::create([
            'name' => $validated['name'],
            'description' => $validated['description'] ?? null,
            'instructions' => $validated['instructions'] ?? null,
            'servings' => $validated['servings'],
        ]);

        $ingredients = [];
        foreach ($validated['ingredients'] as $ingredient) {
            $ingredients[$ingredient['id']] = ['quantity' => $ingredient['quantity']];
        }
        $recipe->ingredients()->sync($ingredients);

        $recipe->load('ingredients');
        $recipe->calculateNutrition();

        return response()->json($recipe->load('ingredients'), 201);
    }

    public function show(Recipe $recipe): JsonResponse
    {
        $recipe->load('ingredients');
        return response()->json([
            'recipe' => $recipe,
            'nutrition_per_serving' => $recipe->nutrition_per_serving,
        ]);
    }

    public function update(Request $request, Recipe $recipe): JsonResponse
    {
        $validated = $request->validate([
            'name' => 'required|string|max:255',
            'description' => 'nullable|string',
            'instructions' => 'nullable|string',
            'servings' => 'required|integer|min:1',
            'ingredients' => 'required|array',
            'ingredients.*.id' => 'required|exists:ingredients,id',
            'ingredients.*.quantity' => 'required|numeric|min:0',
        ]);

        $recipe->update([
            'name' => $validated['name'],
            'description' => $validated['description'] ?? null,
            'instructions' => $validated['instructions'] ?? null,
            'servings' => $validated['servings'],
        ]);

        $ingredients = [];
        foreach ($validated['ingredients'] as $ingredient) {
            $ingredients[$ingredient['id']] = ['quantity' => $ingredient['quantity']];
        }
        $recipe->ingredients()->sync($ingredients);

        $recipe->calculateNutrition();

        return response()->json($recipe->load('ingredients'));
    }

    public function destroy(Recipe $recipe): JsonResponse
    {
        $recipe->delete();
        return response()->json(null, 204);
    }
}
