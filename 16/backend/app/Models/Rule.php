<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Factories\HasFactory;

class Rule extends Model
{
    use HasFactory;

    protected $fillable = [
        'user_id',
        'name',
        'description_contains',
        'min_amount',
        'max_amount',
        'amount_operator',
        'category_id',
        'tag_ids',
        'priority',
        'is_active',
    ];

    protected $casts = [
        'min_amount' => 'decimal:2',
        'max_amount' => 'decimal:2',
        'tag_ids' => 'json',
        'is_active' => 'boolean',
        'priority' => 'integer',
    ];

    public function user()
    {
        return $this->belongsTo(User::class);
    }

    public function category()
    {
        return $this->belongsTo(Category::class);
    }
}
