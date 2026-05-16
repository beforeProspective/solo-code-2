<?php

namespace App\Models;

use Carbon\Carbon;
use Illuminate\Database\Eloquent\Model;

class ApiKey extends Model
{
    protected $fillable = [
        'user_id', 'name', 'key', 'usage_count', 'limit', 'active', 'last_used_at'
    ];

    protected $casts = [
        'active' => 'boolean',
        'last_used_at' => 'datetime',
    ];

    public function user()
    {
        return $this->belongsTo(User::class);
    }

    public function canUse()
    {
        if (!$this->active) {
            return false;
        }
        if ($this->limit && $this->usage_count >= $this->limit) {
            return false;
        }
        return true;
    }

    public function incrementUsage()
    {
        $this->increment('usage_count');
        $this->update(['last_used_at' => Carbon::now()]);
    }
}
