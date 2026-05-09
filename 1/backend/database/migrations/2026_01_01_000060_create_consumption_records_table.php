<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('consumption_records', function (Blueprint $table) {
            $table->id();
            $table->foreignId('ingredient_id')->constrained()->onDelete('cascade');
            $table->decimal('quantity', 10, 2);
            $table->enum('type', ['used', 'purchased', 'wasted']);
            $table->text('notes')->nullable();
            $table->foreignId('recipe_id')->nullable()->constrained()->onDelete('set null');
            $table->foreignId('meal_plan_id')->nullable()->constrained()->onDelete('set null');
            $table->timestamp('consumed_at')->useCurrent();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('consumption_records');
    }
};
