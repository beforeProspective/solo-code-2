<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Subscriber extends Model
{
    protected $fillable = [
        'email',
        'verified',
        'verification_token',
    ];

    protected $casts = [
        'verified' => 'boolean',
    ];
}
