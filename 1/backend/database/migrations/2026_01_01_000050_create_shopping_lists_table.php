<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('shopping_lists', function (Blueprint $table) {
            $table->id();
            $table->date('week_start');
            $table->date('week_end');
            $table->foreignId('ingredient_id')->constrained()->onDelete('cascade');
            $table->decimal('required_quantity', 10, 2);
            $table->decimal('available_stock', 10, 2)->default(0);
            $table->decimal('to_buy', 10, 2);
            $table->boolean('purchased')->default(false);
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('shopping_lists');
    }
};
