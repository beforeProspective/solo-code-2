<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Notifications\Notifiable;
use Laravel\Sanctum\HasApiTokens;

class User extends Authenticatable
{
    use HasFactory, Notifiable, HasApiTokens;

    protected $fillable = [
        'name',
        'email',
        'password',
        'credit_score',
        'is_admin',
    ];

    protected $hidden = [
        'password',
        'remember_token',
    ];

    protected function casts(): array
    {
        return [
            'email_verified_at' => 'datetime',
            'password' => 'hashed',
            'is_admin' => 'boolean',
        ];
    }

    public function ownedTools(): HasMany
    {
        return $this->hasMany(Tool::class, 'owner_id');
    }

    public function borrowings(): HasMany
    {
        return $this->hasMany(Borrowing::class, 'borrower_id');
    }

    public function damageReports(): HasMany
    {
        return $this->hasMany(DamageReport::class, 'reporter_id');
    }

    public function deductCredit(int $points): void
    {
        $this->credit_score = max(0, $this->credit_score - $points);
        $this->save();
    }

    public function addCredit(int $points): void
    {
        $this->credit_score = min(100, $this->credit_score + $points);
        $this->save();
    }
}
