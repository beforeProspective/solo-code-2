<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class PerformanceReview extends Model
{
    protected $fillable = [
        'user_id',
        'manager_id',
        'review_period',
        'review_date',
        'status',
        'goals',
        'self_assessment',
        'self_rating',
        'manager_assessment',
        'manager_rating',
        'competencies',
        'development_plan',
        'overall_rating',
        'submitted_at',
        'finalized_at',
    ];

    protected $casts = [
        'goals' => 'json',
        'competencies' => 'json',
        'review_date' => 'date',
        'submitted_at' => 'datetime',
        'finalized_at' => 'datetime',
        'self_rating' => 'float',
        'manager_rating' => 'float',
        'overall_rating' => 'float',
    ];

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function manager(): BelongsTo
    {
        return $this->belongsTo(User::class, 'manager_id');
    }
}
