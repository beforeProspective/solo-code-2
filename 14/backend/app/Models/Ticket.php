<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class Ticket extends Model
{
    use HasFactory;

    protected $fillable = [
        'event_id', 'name', 'description', 'type', 'price',
        'quantity', 'min_donation', 'start_sale_at', 'end_sale_at', 'is_active'
    ];

    protected $casts = [
        'price' => 'decimal:2',
        'start_sale_at' => 'datetime',
        'end_sale_at' => 'datetime',
        'is_active' => 'boolean',
    ];

    public function event()
    {
        return $this->belongsTo(Event::class);
    }

    public function orderItems()
    {
        return $this->hasMany(OrderItem::class);
    }
}
