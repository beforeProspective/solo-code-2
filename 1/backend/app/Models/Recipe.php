<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Recipe extends Model
{
    use HasFactory;

    protected $fillable = [
        'name',
        'description',
        'instructions',
        'servings',
        'total_calories',
        'total_protein',
        'total_carbs',
        'total_fat',
    ];

    public function ingredients(): BelongsToMany
    {
        return $this->belongsToMany(Ingredient::class, 'recipe_ingredients')
            ->withPivot('quantity')
            ->withTimestamps();
    }

    public function mealPlans(): HasMany
    {
        return $this->hasMany(MealPlan::class);
    }

    public function calculateNutrition(): void
    {
        $calories = 0;
        $protein = 0;
        $carbs = 0;
        $fat = 0;

        foreach ($this->ingredients as $ingredient) {
            $quantity = $ingredient->pivot->quantity;
            $calories += $ingredient->calories_per_unit * $quantity;
            $protein += $ingredient->protein_per_unit * $quantity;
            $carbs += $ingredient->carbs_per_unit * $quantity;
            $fat += $ingredient->fat_per_unit * $quantity;
        }

        $this->total_calories = round($calories, 2);
        $this->total_protein = round($protein, 2);
        $this->total_carbs = round($carbs, 2);
        $this->total_fat = round($fat, 2);
        $this->save();
    }

    public function getNutritionPerServingAttribute(): array
    {
        if ($this->servings <= 0) {
            return [
                'calories' => 0,
                'protein' => 0,
                'carbs' => 0,
                'fat' => 0,
            ];
        }

        return [
            'calories' => round($this->total_calories / $this->servings, 2),
            'protein' => round($this->total_protein / $this->servings, 2),
            'carbs' => round($this->total_carbs / $this->servings, 2),
            'fat' => round($this->total_fat / $this->servings, 2),
        ];
    }
}
