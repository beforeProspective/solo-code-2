<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class IncidentUpdate extends Model
{
    protected $fillable = [
        'incident_id',
        'status',
        'content',
    ];

    public function incident()
    {
        return $this->belongsTo(Incident::class);
    }
}
