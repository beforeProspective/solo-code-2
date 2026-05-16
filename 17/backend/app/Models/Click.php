<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Click extends Model
{
    protected $fillable = [
        'short_link_id', 'ip_address', 'user_agent', 'referer', 'country', 'city'
    ];

    public function shortLink()
    {
        return $this->belongsTo(ShortLink::class);
    }
}
