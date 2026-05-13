<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class ServiceComponent extends Model
{
    protected $fillable = [
        'name',
        'description',
        'group_name',
        'status',
        'status_label',
        'order',
    ];

    const STATUS_OPERATIONAL = 'operational';
    const STATUS_DEGRADED = 'degraded';
    const STATUS_PARTIAL = 'partial_outage';
    const STATUS_OUTAGE = 'major_outage';

    public function eventComponents()
    {
        return $this->hasMany(EventComponent::class);
    }
}
