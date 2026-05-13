<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Metric extends Model
{
    protected $fillable = [
        'name',
        'description',
        'suffix',
        'default_value',
        'visible',
        'order',
    ];

    protected $casts = [
        'visible' => 'boolean',
        'default_value' => 'integer',
    ];

    public function points()
    {
        return $this->hasMany(MetricPoint::class);
    }
}
