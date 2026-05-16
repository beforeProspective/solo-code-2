<?php

namespace App\Models;

use Carbon\Carbon;
use Illuminate\Database\Eloquent\Model;

class ShortLink extends Model
{
    protected $fillable = [
        'user_id', 'original_url', 'short_code', 'custom_domain', 
        'password', 'active', 'expires_at'
    ];

    protected $casts = [
        'active' => 'boolean',
        'expires_at' => 'datetime',
    ];

    protected $hidden = [
        'password',
    ];

    protected $appends = [
        'short_url',
    ];

    public function user()
    {
        return $this->belongsTo(User::class);
    }

    public function clicks()
    {
        return $this->hasMany(Click::class);
    }

    public function getShortUrlAttribute()
    {
        $baseUrl = $this->custom_domain ?: env('SHORTENER_BASE_URL', 'http://localhost:8001');
        return rtrim($baseUrl, '/') . '/' . $this->short_code;
    }

    public function hasPassword()
    {
        return !empty($this->password);
    }

    public function verifyPassword($password)
    {
        if (!$this->hasPassword()) {
            return true;
        }
        return password_verify($password, $this->password);
    }

    public function isExpired()
    {
        if (!$this->expires_at) {
            return false;
        }
        return Carbon::now()->greaterThan($this->expires_at);
    }
}
