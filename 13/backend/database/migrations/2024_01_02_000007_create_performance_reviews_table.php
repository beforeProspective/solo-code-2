<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('performance_reviews', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->foreignId('manager_id')->constrained('users');
            $table->string('review_period');
            $table->date('review_date')->nullable();
            $table->string('status')->default('draft');
            $table->json('goals')->nullable();
            $table->text('self_assessment')->nullable();
            $table->decimal('self_rating', 3, 1)->nullable();
            $table->text('manager_assessment')->nullable();
            $table->decimal('manager_rating', 3, 1)->nullable();
            $table->json('competencies')->nullable();
            $table->text('development_plan')->nullable();
            $table->decimal('overall_rating', 3, 1)->nullable();
            $table->timestamp('submitted_at')->nullable();
            $table->timestamp('finalized_at')->nullable();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('performance_reviews');
    }
};
