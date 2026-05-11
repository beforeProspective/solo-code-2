<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class Interview extends Model
{
    protected $fillable = [
        'applicant_id',
        'job_posting_id',
        'scheduled_at',
        'interviewer_id',
        'type',
        'location',
        'meeting_link',
        'status',
        'feedback',
        'rating',
        'notes',
    ];

    protected $casts = [
        'scheduled_at' => 'datetime',
        'rating' => 'float',
    ];

    public function applicant(): BelongsTo
    {
        return $this->belongsTo(Applicant::class);
    }

    public function jobPosting(): BelongsTo
    {
        return $this->belongsTo(JobPosting::class);
    }

    public function interviewer(): BelongsTo
    {
        return $this->belongsTo(User::class, 'interviewer_id');
    }
}
