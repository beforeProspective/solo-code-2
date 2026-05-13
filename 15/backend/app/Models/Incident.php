<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Incident extends Model
{
    protected $fillable = [
        'title',
        'description',
        'status',
        'impact',
        'started_at',
        'resolved_at',
        'is_maintenance',
        'scheduled_at',
        'scheduled_end_at',
    ];

    protected $casts = [
        'started_at' => 'datetime',
        'resolved_at' => 'datetime',
        'scheduled_at' => 'datetime',
        'scheduled_end_at' => 'datetime',
    ];

    const STATUS_INVESTIGATING = 'investigating';
    const STATUS_IDENTIFIED = 'identified';
    const STATUS_MONITORING = 'monitoring';
    const STATUS_RESOLVED = 'resolved';

    const IMPACT_NONE = 'none';
    const IMPACT_MINOR = 'minor';
    const IMPACT_MAJOR = 'major';
    const IMPACT_CRITICAL = 'critical';

    public function updates()
    {
        return $this->hasMany(IncidentUpdate::class)->orderBy('created_at', 'desc');
    }

    public function components()
    {
        return $this->hasMany(EventComponent::class);
    }
}
