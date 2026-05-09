<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('ingredients', function (Blueprint $table) {
            $table->id();
            $table->string('name');
            $table->string('unit');
            $table->decimal('calories_per_unit', 10, 2)->default(0);
            $table->decimal('protein_per_unit', 10, 2)->default(0);
            $table->decimal('carbs_per_unit', 10, 2)->default(0);
            $table->decimal('fat_per_unit', 10, 2)->default(0);
            $table->decimal('current_stock', 10, 2)->default(0);
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('ingredients');
    }
};
