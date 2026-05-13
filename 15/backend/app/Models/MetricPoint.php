<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class MetricPoint extends Model
{
    public $timestamps = false;

    protected $fillable = [
        'metric_id',
        'value',
        'created_at',
    ];

    protected $casts = [
        'value' => 'integer',
    ];

    public function metric()
    {
        return $this->belongsTo(Metric::class);
    }
}
