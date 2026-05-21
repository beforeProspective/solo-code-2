<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Hotel extends Model
{
    protected $fillable = [
        'name',
        'description',
        'address',
        'city',
        'star_rating',
        'image',
        'facilities',
    ];

    protected function casts(): array
    {
        return [
            'facilities' => 'array',
            'star_rating' => 'decimal:1',
        ];
    }

    public function rooms()
    {
        return $this->hasMany(Room::class);
    }

    public function bookings()
    {
        return $this->hasMany(Booking::class);
    }
}
