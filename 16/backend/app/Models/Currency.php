<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Factories\HasFactory;

class Currency extends Model
{
    use HasFactory;

    protected $fillable = [
        'code',
        'name',
        'symbol',
        'rate_to_usd',
        'is_active',
    ];

    protected $casts = [
        'rate_to_usd' => 'decimal:6',
        'is_active' => 'boolean',
    ];
}
