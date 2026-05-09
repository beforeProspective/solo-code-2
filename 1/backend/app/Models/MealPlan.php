<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class MealPlan extends Model
{
    use HasFactory;

    protected $fillable = [
        'plan_date',
        'meal_type',
        'recipe_id',
        'notes',
    ];

    protected $casts = [
        'plan_date' => 'date',
    ];

    public function toArray()
    {
        $array = parent::toArray();
        if (isset($array['plan_date']) && is_object($array['plan_date'])) {
            $array['plan_date'] = $this->plan_date->toDateString();
        } elseif (isset($array['plan_date']) && is_string($array['plan_date'])) {
            if (strpos($array['plan_date'], 'T') !== false) {
                $array['plan_date'] = substr($array['plan_date'], 0, 10);
            }
        }
        return $array;
    }

    public function recipe(): BelongsTo
    {
        return $this->belongsTo(Recipe::class);
    }

    public static function getMealTypes(): array
    {
        return ['breakfast', 'lunch', 'dinner', 'snack'];
    }
}
