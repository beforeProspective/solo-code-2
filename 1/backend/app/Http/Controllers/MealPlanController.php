<?php

namespace App\Http\Controllers;

use App\Models\MealPlan;
use Illuminate\Http\Request;
use Illuminate\Http\JsonResponse;
use Illuminate\Validation\Rule;

class MealPlanController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $query = MealPlan::with('recipe');

        if ($request->has('start_date') && $request->has('end_date')) {
            $query->whereBetween('plan_date', [$request->start_date, $request->end_date]);
        }

        $mealPlans = $query->orderBy('plan_date')->orderBy('meal_type')->get();

        $grouped = [];
        foreach ($mealPlans as $mealPlan) {
            $date = $mealPlan->plan_date->toDateString();
            if (!isset($grouped[$date])) {
                $grouped[$date] = [];
            }
            $grouped[$date][$mealPlan->meal_type] = $mealPlan;
        }

        return response()->json([
            'meal_plans' => $mealPlans,
            'grouped' => $grouped,
            'meal_types' => MealPlan::getMealTypes(),
        ]);
    }

    public function store(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'plan_date' => 'required|date',
            'meal_type' => ['required', Rule::in(MealPlan::getMealTypes())],
            'recipe_id' => 'nullable|exists:recipes,id',
            'notes' => 'nullable|string',
        ]);

        $existing = MealPlan::where('plan_date', $validated['plan_date'])
            ->where('meal_type', $validated['meal_type'])
            ->first();

        if ($existing) {
            $existing->update($validated);
            return response()->json($existing->load('recipe'));
        }

        $mealPlan = MealPlan::create($validated);
        return response()->json($mealPlan->load('recipe'), 201);
    }

    public function show(MealPlan $mealPlan): JsonResponse
    {
        return response()->json($mealPlan->load('recipe'));
    }

    public function update(Request $request, MealPlan $mealPlan): JsonResponse
    {
        $validated = $request->validate([
            'plan_date' => 'required|date',
            'meal_type' => ['required', Rule::in(MealPlan::getMealTypes())],
            'recipe_id' => 'nullable|exists:recipes,id',
            'notes' => 'nullable|string',
        ]);

        $mealPlan->update($validated);
        return response()->json($mealPlan->load('recipe'));
    }

    public function destroy(MealPlan $mealPlan): JsonResponse
    {
        $mealPlan->delete();
        return response()->json(null, 204);
    }
}
