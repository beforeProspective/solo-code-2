<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Str;

class Attendee extends Model
{
    use HasFactory;

    protected $fillable = [
        'order_id', 'ticket_id', 'ticket_name', 'name', 'email', 'phone',
        'ticket_code', 'checked_in', 'checked_in_at', 'custom_data'
    ];

    protected $casts = [
        'checked_in' => 'boolean',
        'checked_in_at' => 'datetime',
        'custom_data' => 'array',
    ];

    public static function boot()
    {
        parent::boot();

        static::creating(function ($attendee) {
            if (empty($attendee->ticket_code)) {
                $attendee->ticket_code = strtoupper(Str::random(12));
            }
        });
    }

    public function order()
    {
        return $this->belongsTo(Order::class);
    }

    public function ticket()
    {
        return $this->belongsTo(Ticket::class);
    }
}
