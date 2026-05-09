<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Ingredient extends Model
{
    use HasFactory;

    protected $fillable = [
        'name',
        'unit',
        'calories_per_unit',
        'protein_per_unit',
        'carbs_per_unit',
        'fat_per_unit',
        'current_stock',
    ];

    public function recipes(): BelongsToMany
    {
        return $this->belongsToMany(Recipe::class, 'recipe_ingredients')
            ->withPivot('quantity')
            ->withTimestamps();
    }

    public function consumptionRecords(): HasMany
    {
        return $this->hasMany(ConsumptionRecord::class);
    }

    public function shoppingLists(): HasMany
    {
        return $this->hasMany(ShoppingList::class);
    }

    public function adjustStock(float $quantity, string $type): void
    {
        if ($type === 'purchased') {
            $this->current_stock += $quantity;
        } else {
            $this->current_stock = max(0, $this->current_stock - $quantity);
        }
        $this->save();
    }
}
