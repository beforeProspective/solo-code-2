<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class Announcement extends Model
{
    protected $fillable = [
        'title',
        'content',
        'type',
        'target_audience',
        'created_by',
        'is_pinned',
        'publish_date',
        'expiry_date',
        'status',
        'attachments',
    ];

    protected $casts = [
        'attachments' => 'json',
        'publish_date' => 'datetime',
        'expiry_date' => 'datetime',
        'is_pinned' => 'boolean',
    ];

    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }
}
