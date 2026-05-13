<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Webhook extends Model
{
    protected $fillable = [
        'url',
        'events',
        'active',
    ];

    protected $casts = [
        'events' => 'array',
        'active' => 'boolean',
    ];
}
