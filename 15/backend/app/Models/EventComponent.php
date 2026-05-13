<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class EventComponent extends Model
{
    protected $fillable = [
        'incident_id',
        'service_component_id',
        'status',
    ];

    public function incident()
    {
        return $this->belongsTo(Incident::class);
    }

    public function component()
    {
        return $this->belongsTo(ServiceComponent::class, 'service_component_id');
    }
}
