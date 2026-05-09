<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('recipes', function (Blueprint $table) {
            $table->id();
            $table->string('name');
            $table->text('description')->nullable();
            $table->text('instructions')->nullable();
            $table->integer('servings')->default(1);
            $table->decimal('total_calories', 10, 2)->default(0);
            $table->decimal('total_protein', 10, 2)->default(0);
            $table->decimal('total_carbs', 10, 2)->default(0);
            $table->decimal('total_fat', 10, 2)->default(0);
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('recipes');
    }
};
