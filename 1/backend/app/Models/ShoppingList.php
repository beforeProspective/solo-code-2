<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class ShoppingList extends Model
{
    use HasFactory;

    protected $fillable = [
        'week_start',
        'week_end',
        'ingredient_id',
        'required_quantity',
        'available_stock',
        'to_buy',
        'purchased',
    ];

    protected $casts = [
        'week_start' => 'date',
        'week_end' => 'date',
        'purchased' => 'boolean',
    ];

    public function ingredient(): BelongsTo
    {
        return $this->belongsTo(Ingredient::class);
    }

    public static function generateForWeek($startDate, $endDate): array
    {
        $mealPlans = MealPlan::whereBetween('plan_date', [$startDate, $endDate])
            ->with('recipe.ingredients')
            ->get();

        $requiredIngredients = [];

        foreach ($mealPlans as $mealPlan) {
            if (!$mealPlan->recipe) {
                continue;
            }

            foreach ($mealPlan->recipe->ingredients as $ingredient) {
                $ingredientId = $ingredient->id;
                $quantity = $ingredient->pivot->quantity;

                if (!isset($requiredIngredients[$ingredientId])) {
                    $requiredIngredients[$ingredientId] = [
                        'ingredient' => $ingredient,
                        'total_quantity' => 0,
                    ];
                }

                $requiredIngredients[$ingredientId]['total_quantity'] += $quantity;
            }
        }

        $shoppingList = [];

        foreach ($requiredIngredients as $item) {
            $ingredient = $item['ingredient'];
            $required = $item['total_quantity'];
            $available = $ingredient->current_stock;
            $toBuy = max(0, $required - $available);

            if ($toBuy > 0) {
                $shoppingList[] = [
                    'ingredient_id' => $ingredient->id,
                    'ingredient_name' => $ingredient->name,
                    'unit' => $ingredient->unit,
                    'required_quantity' => round($required, 2),
                    'available_stock' => round($available, 2),
                    'to_buy' => round($toBuy, 2),
                ];
            }
        }

        return $shoppingList;
    }
}
