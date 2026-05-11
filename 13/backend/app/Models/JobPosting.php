<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class JobPosting extends Model
{
    protected $fillable = [
        'title',
        'department_id',
        'position_id',
        'description',
        'requirements',
        'benefits',
        'min_salary',
        'max_salary',
        'location',
        'employment_type',
        'status',
        'publish_date',
        'close_date',
        'created_by',
    ];

    protected $casts = [
        'publish_date' => 'date',
        'close_date' => 'date',
        'min_salary' => 'float',
        'max_salary' => 'float',
    ];

    public function department(): BelongsTo
    {
        return $this->belongsTo(Department::class);
    }

    public function position(): BelongsTo
    {
        return $this->belongsTo(Position::class);
    }

    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    public function applicants(): HasMany
    {
        return $this->hasMany(Applicant::class);
    }

    public function interviews(): HasMany
    {
        return $this->hasMany(Interview::class);
    }
}
