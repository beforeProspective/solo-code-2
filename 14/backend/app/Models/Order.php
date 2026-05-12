<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Str;

class Order extends Model
{
    use HasFactory;

    protected $fillable = [
        'event_id', 'order_number', 'customer_name', 'customer_email',
        'customer_phone', 'total_amount', 'status', 'payment_method', 'form_data'
    ];

    protected $casts = [
        'total_amount' => 'decimal:2',
        'form_data' => 'array',
    ];

    public static function generateOrderNumber()
    {
        return 'EVT-' . date('Ymd') . '-' . strtoupper(Str::random(8));
    }

    public function event()
    {
        return $this->belongsTo(Event::class);
    }

    public function items()
    {
        return $this->hasMany(OrderItem::class);
    }

    public function attendees()
    {
        return $this->hasMany(Attendee::class);
    }
}
