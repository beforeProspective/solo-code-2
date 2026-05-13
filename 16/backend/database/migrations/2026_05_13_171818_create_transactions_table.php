<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('transactions', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->onDelete('cascade');
            $table->foreignId('account_id')->constrained()->onDelete('cascade');
            $table->foreignId('category_id')->nullable()->constrained()->onDelete('set null');
            $table->foreignId('transfer_to_account_id')->nullable()->constrained('accounts')->onDelete('set null');
            $table->string('type');
            $table->decimal('amount', 15, 2);
            $table->string('currency', 3)->default('CNY');
            $table->decimal('amount_in_usd', 15, 2)->nullable();
            $table->string('description')->nullable();
            $table->dateTime('transaction_date');
            $table->boolean('is_recurring')->default(false);
            $table->string('recurring_interval')->nullable();
            $table->text('notes')->nullable();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('transactions');
    }
};
