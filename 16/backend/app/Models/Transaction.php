<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Factories\HasFactory;

class Transaction extends Model
{
    use HasFactory;

    protected $fillable = [
        'user_id',
        'account_id',
        'category_id',
        'transfer_to_account_id',
        'type',
        'amount',
        'currency',
        'amount_in_usd',
        'description',
        'transaction_date',
        'is_recurring',
        'recurring_interval',
        'notes',
    ];

    protected $casts = [
        'amount' => 'decimal:2',
        'amount_in_usd' => 'decimal:2',
        'transaction_date' => 'datetime',
        'is_recurring' => 'boolean',
    ];

    public function user()
    {
        return $this->belongsTo(User::class);
    }

    public function account()
    {
        return $this->belongsTo(Account::class);
    }

    public function category()
    {
        return $this->belongsTo(Category::class);
    }

    public function transferToAccount()
    {
        return $this->belongsTo(Account::class, 'transfer_to_account_id');
    }

    public function tags()
    {
        return $this->belongsToMany(Tag::class, 'transaction_tag');
    }
}
