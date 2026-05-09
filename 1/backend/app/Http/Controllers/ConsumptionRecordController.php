<?php

namespace App\Http\Controllers;

use App\Models\ConsumptionRecord;
use App\Models\Ingredient;
use Illuminate\Http\Request;
use Illuminate\Http\JsonResponse;
use Illuminate\Validation\Rule;

class ConsumptionRecordController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $query = ConsumptionRecord::with(['ingredient', 'recipe', 'mealPlan']);

        if ($request->has('start_date') && $request->has('end_date')) {
            $query->whereBetween('consumed_at', [$request->start_date, $request->end_date]);
        }

        if ($request->has('ingredient_id')) {
            $query->where('ingredient_id', $request->ingredient_id);
        }

        if ($request->has('type')) {
            $query->where('type', $request->type);
        }

        $records = $query->orderBy('consumed_at', 'desc')->get();

        $stats = [
            'total_used' => ConsumptionRecord::where('type', 'used')->sum('quantity'),
            'total_purchased' => ConsumptionRecord::where('type', 'purchased')->sum('quantity'),
            'total_wasted' => ConsumptionRecord::where('type', 'wasted')->sum('quantity'),
        ];

        return response()->json([
            'records' => $records,
            'stats' => $stats,
            'types' => ConsumptionRecord::getTypes(),
        ]);
    }

    public function store(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'ingredient_id' => 'required|exists:ingredients,id',
            'quantity' => 'required|numeric|min:0',
            'type' => ['required', Rule::in(ConsumptionRecord::getTypes())],
            'notes' => 'nullable|string',
            'recipe_id' => 'nullable|exists:recipes,id',
            'meal_plan_id' => 'nullable|exists:meal_plans,id',
            'consumed_at' => 'nullable|date',
        ]);

        $ingredient = Ingredient::findOrFail($validated['ingredient_id']);
        $ingredient->adjustStock($validated['quantity'], $validated['type']);

        $record = ConsumptionRecord::create([
            'ingredient_id' => $validated['ingredient_id'],
            'quantity' => $validated['quantity'],
            'type' => $validated['type'],
            'notes' => $validated['notes'] ?? null,
            'recipe_id' => $validated['recipe_id'] ?? null,
            'meal_plan_id' => $validated['meal_plan_id'] ?? null,
            'consumed_at' => $validated['consumed_at'] ?? now(),
        ]);

        return response()->json($record->load(['ingredient', 'recipe', 'mealPlan']), 201);
    }

    public function show(ConsumptionRecord $consumptionRecord): JsonResponse
    {
        return response()->json($consumptionRecord->load(['ingredient', 'recipe', 'mealPlan']));
    }

    public function destroy(ConsumptionRecord $consumptionRecord): JsonResponse
    {
        $ingredient = $consumptionRecord->ingredient;
        if ($ingredient) {
            $reverseType = $consumptionRecord->type === 'purchased' ? 'used' : 'purchased';
            $ingredient->adjustStock($consumptionRecord->quantity, $reverseType);
        }

        $consumptionRecord->delete();
        return response()->json(null, 204);
    }

    public function getIngredientHistory($ingredientId): JsonResponse
    {
        $ingredient = Ingredient::findOrFail($ingredientId);
        $records = ConsumptionRecord::where('ingredient_id', $ingredientId)
            ->with(['recipe', 'mealPlan'])
            ->orderBy('consumed_at', 'desc')
            ->get();

        return response()->json([
            'ingredient' => $ingredient,
            'records' => $records,
        ]);
    }
}
