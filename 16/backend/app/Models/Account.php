<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Factories\HasFactory;

class Account extends Model
{
    use HasFactory;

    protected $fillable = [
        'user_id',
        'name',
        'type',
        'currency',
        'balance',
        'color',
        'notes',
        'is_active',
    ];

    protected $casts = [
        'is_active' => 'boolean',
        'balance' => 'decimal:2',
    ];

    public function user()
    {
        return $this->belongsTo(User::class);
    }

    public function transactions()
    {
        return $this->hasMany(Transaction::class, 'account_id');
    }

    public function transferTransactions()
    {
        return $this->hasMany(Transaction::class, 'transfer_to_account_id');
    }

    public function bills()
    {
        return $this->hasMany(Bill::class);
    }
}
